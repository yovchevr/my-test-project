/**
 * Unit tests for `@neo-search/data-bookmarks` (STORY-007).
 *
 * Coverage map (every AC in `.stories/project-spec/STORY-007-bookmark-store.md`):
 *   - "save → get round-trip" (both kinds)         → AC 1, AC 2, AC 3.
 *   - "get(unknownId) returns null"                → AC 4.
 *   - "list orders by ts DESC, paginates at 25"    → AC 5.
 *   - "schema introspection: no user/tenant cols"  → AC 7 + NFR-006 posture.
 *   - "no auto-purge after advancing 365 days"     → AC 8 + I-13.
 *   - "pre-aborted signal short-circuits"          → AC 9 + foundation/conventions.md.
 *
 * The "process restart" AC (AC 6) is exercised in `bookmark-store.spec.ts`,
 * which is the integration-test sibling.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  BOOKMARK_PAGE_SIZE,
  type BookmarkStore,
  type Clock,
  type IdGenerator,
  createBookmarkStore,
} from './index.js';

/**
 * Deterministic clock: returns successive timestamps spaced one second apart.
 * Each call to `tick()` advances the wall-clock by one second, which is
 * enough resolution for `ts DESC` ordering to be unambiguous in the list test.
 */
const makeClock = (start: Date): Clock & { advance(ms: number): void; tick(): void } => {
  let now = start.getTime();
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
    tick: () => {
      now += 1_000;
    },
  };
};

/** Sequential id generator so ids are predictable across the suite. */
const makeIds = (prefix = 'bm-test'): IdGenerator => {
  let n = 0;
  return {
    next: () => `${prefix}-${++n}`,
  };
};

describe('BookmarkStore', () => {
  let dataDir: string;
  let store: BookmarkStore;
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'neo-bookmarks-test-'));
    clock = makeClock(new Date('2026-05-10T00:00:00.000Z'));
    store = createBookmarkStore({ dataDir, clock, idGenerator: makeIds() });
  });

  afterEach(() => {
    store.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('round-trips a kind="result" bookmark via save → get', async () => {
    const result = {
      title: 'Example',
      snippet: 'A snippet',
      domain: 'example.com',
      url: 'https://example.com/',
    };

    const { id } = await store.save({ kind: 'result', payload: result });
    expect(id).toBe('bm-test-1');

    const got = await store.get(id);
    expect(got).not.toBeNull();
    expect(got?.kind).toBe('result');
    expect(got?.payload).toEqual(result);
    // ts is the iso of the injected clock; deterministic.
    expect(got?.ts).toBe('2026-05-10T00:00:00.000Z');
  });

  it('round-trips a kind="answer" bookmark via save → get', async () => {
    // The "answer" payload is the full UiApiAnswerContract value per the story
    // scope; we exercise the structurally-equal payload via JSON.parse round-trip.
    const answer = {
      answer_summary: 'This is the answer.',
      references: [
        {
          id: 'ref-1',
          title: 'Cited',
          url: 'https://cited.example.com/',
          context: 'See section 2.',
        },
      ],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };

    const { id } = await store.save({ kind: 'answer', payload: answer });
    const got = await store.get(id);

    expect(got).not.toBeNull();
    expect(got?.kind).toBe('answer');
    expect(got?.payload).toEqual(answer);
  });

  it('returns null (does NOT throw) for an unknown id', async () => {
    // `foundation/conventions.md`: an absence is not an error.
    await expect(store.get('does-not-exist')).resolves.toBeNull();
  });

  it('lists entries by ts DESC, paginated at 25 per page', async () => {
    // Insert 30 entries with monotonically-increasing timestamps. The most
    // recent entry MUST land first on page 1.
    for (let i = 0; i < 30; i += 1) {
      await store.save({ kind: 'result', payload: { i } });
      clock.tick();
    }

    const page1 = await store.list(1);
    expect(page1.entries).toHaveLength(BOOKMARK_PAGE_SIZE);
    expect(page1.pagination.page).toBe(1);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.totalChunks).toBe(2);

    // Most recent first: the last save (i=29) is page 1's first entry.
    const firstPayload = page1.entries[0]?.payload as { i: number };
    const lastPayload = page1.entries[page1.entries.length - 1]?.payload as { i: number };
    expect(firstPayload.i).toBe(29);
    expect(lastPayload.i).toBe(5);

    const page2 = await store.list(2);
    expect(page2.entries).toHaveLength(5);
    expect(page2.pagination.hasMore).toBe(false);
    const page2First = page2.entries[0]?.payload as { i: number };
    expect(page2First.i).toBe(4);
  });

  it('treats an out-of-range page as empty without throwing', async () => {
    await store.save({ kind: 'result', payload: { i: 0 } });
    const page99 = await store.list(99);
    expect(page99.entries).toEqual([]);
    expect(page99.pagination.hasMore).toBe(false);
  });

  it('does NOT auto-purge — entries survive a 365-day clock advance', async () => {
    // I-13: no retention. Saving today and reading 365 days later MUST work.
    const { id } = await store.save({ kind: 'result', payload: { keep: true } });
    clock.advance(365 * 24 * 60 * 60 * 1_000);

    const got = await store.get(id);
    expect(got).not.toBeNull();
    expect(got?.payload).toEqual({ keep: true });
  });

  it('rejects with AbortError when the signal is already aborted (save)', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(store.save({ kind: 'result', payload: {} }, ctl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('rejects with AbortError when the signal is already aborted (list)', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(store.list(1, ctl.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with AbortError when the signal is already aborted (get)', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(store.get('any', ctl.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('does NOT touch SQLite when the signal is pre-aborted', async () => {
    // Even with the store closed (DB handle gone), a pre-aborted signal MUST
    // reject without attempting any I/O. If the implementation reached SQLite,
    // we would see a "database is closed" error instead of an AbortError.
    store.close();
    const ctl = new AbortController();
    ctl.abort();
    await expect(store.get('whatever', ctl.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('schema MUST NOT carry user_id / tenant_id / session columns (NFR-006)', async () => {
    // Open the same DB read-only via a fresh handle and inspect the columns.
    // I-14 / I-15: single-user prototype, no per-user partitioning, no auth.
    const dbPath = join(dataDir, 'bookmarks.sqlite');
    const inspect = new Database(dbPath, { readonly: true });
    try {
      const cols = inspect.pragma('table_info(bookmarks)') as Array<{ name: string }>;
      const names = cols.map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['id', 'kind', 'payload', 'ts']));
      const forbidden = ['user_id', 'tenant_id', 'session', 'session_id', 'owner_id'];
      for (const f of forbidden) {
        expect(names).not.toContain(f);
      }
    } finally {
      inspect.close();
    }
  });
});

/**
 * STORY-006 unit tests for the history store (FR-014).
 *
 * Each test maps to one of the story's acceptance criteria:
 *   - `append` returns the injected id and inserts a row.
 *   - `list` orders entries by `ts DESC` and paginates at `pageSize = 25`.
 *   - A zero-result append round-trips (FR-014 acceptance + I-8).
 *   - A pre-aborted signal causes early return without touching SQLite.
 *   - The schema does not contain a `user_id` / `tenant_id` / session column
 *     (NFR-006, I-14, OQ-005).
 *   - The store does not auto-purge (I-13).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HISTORY_PAGE_SIZE,
  createHistoryStore,
  type HistoryEntryAppendInput,
  type HistoryStore,
} from './index.js';

const baseEntry = (overrides: Partial<HistoryEntryAppendInput> = {}): HistoryEntryAppendInput => ({
  query: 'typebox',
  sourceFilter: 'LIVE',
  resultChunkIds: ['chunk-0'],
  ...overrides,
});

let dataDir: string;
let store: HistoryStore;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'neo-search-history-'));
});

afterEach(() => {
  // Closing twice is harmless — `close` on an already-closed handle is a no-op
  // in better-sqlite3 (it throws, hence the try/catch). The cleanup is
  // best-effort because some tests close the handle themselves.
  try {
    store.close();
  } catch {
    // ignore
  }
  rmSync(dataDir, { recursive: true, force: true });
});

describe('FR-014 — append returns the injected id and inserts a row', () => {
  it('returns the id produced by the injected idGenerator', async () => {
    let counter = 0;
    store = createHistoryStore({
      dataDir,
      idGenerator: () => `test-id-${++counter}`,
      clock: () => new Date('2026-05-10T12:00:00.000Z'),
    });

    const result = await store.append(baseEntry());
    expect(result).toEqual({ id: 'test-id-1' });

    const next = await store.append(baseEntry({ query: 'fastify' }));
    expect(next).toEqual({ id: 'test-id-2' });
  });

  it('persists the appended entry verbatim (query, sourceFilter, resultChunkIds)', async () => {
    store = createHistoryStore({
      dataDir,
      idGenerator: () => 'h-1',
      clock: () => new Date('2026-05-10T12:00:00.000Z'),
    });

    await store.append({
      query: 'langgraph',
      sourceFilter: 'LIVE',
      resultChunkIds: ['c-0', 'c-1', 'c-2'],
    });

    const { entries } = await store.list(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      id: 'h-1',
      query: 'langgraph',
      sourceFilter: 'LIVE',
      ts: '2026-05-10T12:00:00.000Z',
      resultChunkIds: ['c-0', 'c-1', 'c-2'],
    });
  });

  it('uses the injected clock for the ts column (no Date.now / wall-clock)', async () => {
    const fixed = new Date('2030-01-01T00:00:00.000Z');
    store = createHistoryStore({
      dataDir,
      idGenerator: () => 'h-1',
      clock: () => fixed,
    });

    await store.append(baseEntry());
    const { entries } = await store.list(1);
    expect(entries[0]?.ts).toBe('2030-01-01T00:00:00.000Z');
  });

  it('FR-014 acceptance criterion — zero-result append succeeds and appears in list (I-8)', async () => {
    store = createHistoryStore({
      dataDir,
      idGenerator: () => 'h-empty',
      clock: () => new Date('2026-05-10T12:00:00.000Z'),
    });

    const { id } = await store.append({
      query: 'no results query',
      sourceFilter: 'LIVE',
      resultChunkIds: [],
    });
    expect(id).toBe('h-empty');

    const { entries } = await store.list(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.resultChunkIds).toEqual([]);
  });

  it('returns a UUID v4 by default when no idGenerator is injected', async () => {
    store = createHistoryStore({ dataDir });
    const { id } = await store.append(baseEntry());
    // RFC 4122 v4 layout: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx.
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe('FR-014 — list ordering and pagination', () => {
  it('returns entries in ts DESC order (most-recent first)', async () => {
    let count = 0;
    const timestamps = [
      '2026-05-10T10:00:00.000Z',
      '2026-05-10T11:00:00.000Z',
      '2026-05-10T12:00:00.000Z',
    ];
    store = createHistoryStore({
      dataDir,
      idGenerator: () => `h-${++count}`,
      clock: () => new Date(timestamps[count] ?? timestamps[timestamps.length - 1]!),
    });

    await store.append(baseEntry({ query: 'oldest' }));
    await store.append(baseEntry({ query: 'middle' }));
    await store.append(baseEntry({ query: 'newest' }));

    const { entries } = await store.list(1);
    expect(entries.map((entry) => entry.query)).toEqual(['newest', 'middle', 'oldest']);
  });

  it(`paginates at HISTORY_PAGE_SIZE = ${HISTORY_PAGE_SIZE} entries`, async () => {
    let counter = 0;
    store = createHistoryStore({
      dataDir,
      idGenerator: () => `h-${String(++counter).padStart(3, '0')}`,
      // Strictly-increasing clock so list ordering is deterministic; the test
      // does not rely on a specific real-world timestamp.
      clock: () => new Date(2026, 4, 10, 12, 0, counter, 0),
    });

    const total = HISTORY_PAGE_SIZE * 2 + 3;
    for (let i = 0; i < total; i++) {
      await store.append(baseEntry({ query: `q-${i}` }));
    }

    const page1 = await store.list(1);
    expect(page1.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(page1.pagination).toEqual({
      page: 1,
      totalChunks: total,
      hasMore: true,
    });

    const page2 = await store.list(2);
    expect(page2.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(page2.pagination).toEqual({
      page: 2,
      totalChunks: total,
      hasMore: true,
    });

    const page3 = await store.list(3);
    expect(page3.entries).toHaveLength(3);
    expect(page3.pagination).toEqual({
      page: 3,
      totalChunks: total,
      hasMore: false,
    });
  });

  it('an empty store returns an empty list with hasMore=false (FR-005-adjacent)', async () => {
    store = createHistoryStore({ dataDir });
    const result = await store.list(1);
    expect(result.entries).toEqual([]);
    expect(result.pagination).toEqual({ page: 1, totalChunks: 0, hasMore: false });
  });

  it('rejects a non-positive page number with RangeError', async () => {
    store = createHistoryStore({ dataDir });
    await expect(store.list(0)).rejects.toBeInstanceOf(RangeError);
    await expect(store.list(-1)).rejects.toBeInstanceOf(RangeError);
    await expect(store.list(1.5)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('STORY-006 — AbortSignal early return', () => {
  it('append rejects without touching SQLite when the signal is already aborted', async () => {
    let inserts = 0;
    store = createHistoryStore({
      dataDir,
      idGenerator: () => {
        inserts++;
        return `h-${inserts}`;
      },
    });
    const controller = new AbortController();
    controller.abort(new Error('test abort'));

    await expect(store.append(baseEntry(), controller.signal)).rejects.toThrow('test abort');

    // Inserting again with no signal must succeed — the prior abort MUST NOT
    // have inserted a row, so the count is 1 not 2.
    await store.append(baseEntry());
    const { entries } = await store.list(1);
    expect(entries).toHaveLength(1);
    expect(inserts).toBe(1);
  });

  it('list rejects without touching SQLite when the signal is already aborted', async () => {
    store = createHistoryStore({ dataDir });
    await store.append(baseEntry());

    const controller = new AbortController();
    controller.abort(new Error('list abort'));
    await expect(store.list(1, controller.signal)).rejects.toThrow('list abort');

    // After the abort, a clean list call still works.
    const result = await store.list(1);
    expect(result.entries).toHaveLength(1);
  });
});

describe('NFR-006 / I-14 — schema carries no user/tenant/session column', () => {
  // STORY-018 ships the repo-grep that catches user_id / tenant_id additions
  // anywhere in the data layer. The structural test below catches the same
  // class of mistake at the SQLite level — if a future migration sneaks in
  // a per-user column, this test fails by name.
  const FORBIDDEN_COLUMN_PATTERNS = [
    /user/i,
    /tenant/i,
    /session/i,
    /account/i,
    /owner/i,
    /principal/i,
  ];

  it('PRAGMA table_info(history) reports only the documented columns', async () => {
    store = createHistoryStore({ dataDir });
    // Open a second handle in read-only mode to introspect the schema. We
    // can't introspect through the `HistoryStore` interface — that is the
    // point of this test, the schema is invisible to the public API.
    const inspector = new Database(join(dataDir, 'history.sqlite'), { readonly: true });
    try {
      const columns = inspector.prepare('PRAGMA table_info(history)').all() as Array<{
        name: string;
      }>;
      const names = columns.map((column) => column.name).sort();
      expect(names).toEqual(['id', 'query', 'result_chunk_ids', 'source_filter', 'ts']);
    } finally {
      inspector.close();
    }
  });

  it('no column name matches user/tenant/session/account/owner/principal patterns', async () => {
    store = createHistoryStore({ dataDir });
    const inspector = new Database(join(dataDir, 'history.sqlite'), { readonly: true });
    try {
      const columns = inspector.prepare('PRAGMA table_info(history)').all() as Array<{
        name: string;
      }>;
      for (const column of columns) {
        for (const pattern of FORBIDDEN_COLUMN_PATTERNS) {
          expect(
            pattern.test(column.name),
            `history.${column.name} matches ${pattern} — see I-14, NFR-006`,
          ).toBe(false);
        }
      }
    } finally {
      inspector.close();
    }
  });
});

describe('I-13 — store does not auto-purge entries on age', () => {
  it('an entry appended now is still visible after the clock advances 365 days', async () => {
    let now = new Date('2026-05-10T12:00:00.000Z');
    let counter = 0;
    store = createHistoryStore({
      dataDir,
      idGenerator: () => `h-${++counter}`,
      clock: () => now,
    });

    await store.append(baseEntry({ query: 'one-year-old' }));

    // Advance the injected clock by 365 days. There is no separate purge
    // method to call — I-13 says retention MUST NOT exist, so the store has
    // no mechanism that could drop the entry. The test asserts the absence.
    now = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    // Append a second entry to give `list` something to interleave with the
    // old one. If a purge existed and ran on append (a likely placement),
    // the old entry would be gone.
    await store.append(baseEntry({ query: 'fresh' }));

    const { entries, pagination } = await store.list(1);
    expect(pagination.totalChunks).toBe(2);
    const queries = entries.map((entry) => entry.query);
    expect(queries).toContain('one-year-old');
    expect(queries).toContain('fresh');
  });
});

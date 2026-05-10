/**
 * Integration test for `@neo-search/data-bookmarks` (STORY-007).
 *
 * Covers the FR-015 + I-12 acceptance criterion that requires the store to
 * survive a process restart: save, tear down the handle, reopen on the same
 * `dataDir`, and verify get-by-id and list both succeed and return the same
 * payload.
 *
 * This is the "spec" sibling of `bookmark-store.test.ts` (unit). The split
 * follows the same posture used in STORY-006 (history store): the .test.ts
 * file holds in-memory unit assertions, the .spec.ts file holds the
 * substrate-survives-restart round-trip.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Clock, type IdGenerator, createBookmarkStore } from './index.js';

const fixedClock = (start: Date): Clock & { advance(ms: number): void } => {
  let now = start.getTime();
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const sequentialIds = (): IdGenerator => {
  let n = 0;
  return { next: () => `bm-spec-${++n}` };
};

describe('BookmarkStore — process-restart round-trip (FR-015, I-12)', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'neo-bookmarks-spec-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('persists entries across close + reopen on the same dataDir', async () => {
    const clock = fixedClock(new Date('2026-05-10T08:00:00.000Z'));
    const ids = sequentialIds();

    // ---- session 1: write some bookmarks, close. ----
    const session1 = createBookmarkStore({ dataDir, clock, idGenerator: ids });
    const resultPayload = {
      title: 'Sample',
      snippet: 'snip',
      domain: 'sample.com',
      url: 'https://sample.com/',
    };
    const answerPayload = {
      answer_summary: 'A short answer.',
      references: [
        {
          id: 'r1',
          title: 'Title',
          url: 'https://r1.example.com/',
          context: 'context',
        },
      ],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };

    const { id: id1 } = await session1.save({ kind: 'result', payload: resultPayload });
    clock.advance(1_000);
    const { id: id2 } = await session1.save({ kind: 'answer', payload: answerPayload });
    session1.close();

    // ---- session 2: reopen the same dataDir, verify get + list work. ----
    // Using a fresh clock + id generator confirms the persisted state, not
    // anything carried in memory, is what we read back.
    const session2 = createBookmarkStore({
      dataDir,
      clock: fixedClock(new Date('2027-01-01T00:00:00.000Z')),
      idGenerator: sequentialIds(),
    });
    try {
      const got1 = await session2.get(id1);
      expect(got1).not.toBeNull();
      expect(got1?.kind).toBe('result');
      expect(got1?.payload).toEqual(resultPayload);

      const got2 = await session2.get(id2);
      expect(got2).not.toBeNull();
      expect(got2?.kind).toBe('answer');
      expect(got2?.payload).toEqual(answerPayload);

      const page = await session2.list(1);
      expect(page.entries).toHaveLength(2);
      // Most recent first — the answer (saved second) is at index 0.
      expect(page.entries[0]?.id).toBe(id2);
      expect(page.entries[1]?.id).toBe(id1);
      expect(page.pagination.page).toBe(1);
      expect(page.pagination.hasMore).toBe(false);
    } finally {
      session2.close();
    }
  });

  it('a third reopen after another write still observes all entries', async () => {
    // Strengthens the round-trip: many close/reopen cycles MUST be stable.
    // The id generator is intentionally shared across sessions so the
    // sequential ids stay unique across the close/reopen boundary — a fresh
    // generator per session would re-emit `bm-spec-1` and conflict with the
    // PK from session 1, which is a property of this test scaffold, not of
    // the store itself.
    const clock = fixedClock(new Date('2026-05-10T09:00:00.000Z'));
    const ids = sequentialIds();

    const s1 = createBookmarkStore({ dataDir, clock, idGenerator: ids });
    const { id: a } = await s1.save({ kind: 'result', payload: { tag: 'a' } });
    s1.close();

    const s2 = createBookmarkStore({ dataDir, clock, idGenerator: ids });
    clock.advance(2_000);
    const { id: b } = await s2.save({ kind: 'result', payload: { tag: 'b' } });
    s2.close();

    const s3 = createBookmarkStore({ dataDir, clock, idGenerator: ids });
    try {
      const list = await s3.list(1);
      expect(list.entries.map((e) => e.id)).toEqual([b, a]);
      expect(((await s3.get(a))?.payload as { tag: string }).tag).toBe('a');
      expect(((await s3.get(b))?.payload as { tag: string }).tag).toBe('b');
    } finally {
      s3.close();
    }
  });
});

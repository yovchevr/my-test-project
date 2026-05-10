/**
 * STORY-006 integration test — the FR-014 restart round-trip.
 *
 * Acceptance criterion under test:
 *   "The store MUST survive a process restart: append, tear down the handle,
 *    re-create on the same `dataDir`, list — the entries are returned
 *    (FR-014 + I-12)."
 *
 * The test exercises the durability promise structurally: it cannot pass if
 * the store keeps its state in memory or in a temp file that's wiped on
 * close. The same `dataDir` is used across two distinct `createHistoryStore`
 * calls; the second call MUST see the rows the first call wrote.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHistoryStore, type HistoryStore } from './index.js';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'neo-search-history-restart-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('FR-014 — entries survive a process restart (I-12)', () => {
  it('appends in store A, closes, reopens store B on the same dataDir, lists — entries present', async () => {
    let counter = 0;
    const idGenerator = (): string => `h-${++counter}`;
    const fixedClock = (): Date => new Date('2026-05-10T12:00:00.000Z');

    // ──────── First "process": write entries, then tear the handle down. ────────
    const storeA: HistoryStore = createHistoryStore({ dataDir, idGenerator, clock: fixedClock });
    await storeA.append({
      query: 'persistent query',
      sourceFilter: 'LIVE',
      resultChunkIds: ['chunk-0', 'chunk-1'],
    });
    await storeA.append({
      query: 'zero-result query',
      sourceFilter: 'LIVE',
      resultChunkIds: [],
    });
    storeA.close();

    // ──────── Second "process": fresh handle on the same dataDir. ────────
    // A new factory call simulates the next process boot. The id generator
    // and clock are intentionally fresh here too — the persisted entries
    // belong to storeA's writes, not to the new factory's defaults.
    const storeB: HistoryStore = createHistoryStore({
      dataDir,
      idGenerator: () => 'unused-by-this-test',
      clock: () => new Date('2099-12-31T23:59:59.999Z'),
    });
    try {
      const { entries, pagination } = await storeB.list(1);

      expect(pagination.totalChunks).toBe(2);
      // Both entries persisted; ordering is ts DESC. Both rows have the same
      // injected ts here so SQLite's secondary `id DESC` tiebreaker decides
      // — the second insert (`h-2`) wins.
      const ids = entries.map((entry) => entry.id);
      expect(ids).toEqual(['h-2', 'h-1']);

      const queries = entries.map((entry) => entry.query);
      expect(queries).toContain('persistent query');
      expect(queries).toContain('zero-result query');

      const persistent = entries.find((entry) => entry.query === 'persistent query');
      expect(persistent?.resultChunkIds).toEqual(['chunk-0', 'chunk-1']);
      expect(persistent?.sourceFilter).toBe('LIVE');
      expect(persistent?.ts).toBe('2026-05-10T12:00:00.000Z');

      const zeroResult = entries.find((entry) => entry.query === 'zero-result query');
      expect(zeroResult?.resultChunkIds).toEqual([]);
    } finally {
      storeB.close();
    }
  });

  it('a third reopen still sees the entries — migration is idempotent', async () => {
    const storeA = createHistoryStore({
      dataDir,
      idGenerator: () => 'h-only',
      clock: () => new Date('2026-05-10T12:00:00.000Z'),
    });
    await storeA.append({ query: 'q', sourceFilter: 'LIVE', resultChunkIds: [] });
    storeA.close();

    const storeB = createHistoryStore({ dataDir });
    storeB.close();

    const storeC = createHistoryStore({ dataDir });
    try {
      const { entries } = await storeC.list(1);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.id).toBe('h-only');
    } finally {
      storeC.close();
    }
  });
});

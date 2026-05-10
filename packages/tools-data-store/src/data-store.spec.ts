/**
 * STORY-010 integration tests for the `data-store` tool — end-to-end against
 * real stores backed by a temp `dataDir`.
 *
 * The unit-tier file (`data-store.test.ts`) exercises the facade with fakes;
 * this file proves the wiring works against actual SQLite + segmented JSON
 * persistence.
 *
 * AC coverage (FR-014, FR-015, FR-016, FR-018, FR-022):
 *  - Each of the seven ops round-trips end-to-end against real stores:
 *    input → handler → store → output validates against the matching
 *    output-union variant.
 *  - The composition test exercises the data flow the agent will use in
 *    production: cache.write → cache.read → history.append referencing the
 *    chunk ids → history.list → bookmark.save → bookmark.list.
 *  - FR-018 / NFR-004: a multi-chunk cache.read MUST report
 *    `chunksRead < pagination.totalChunks` so the agent observes the
 *    "no full scan" property.
 *
 * Per `.design/technology/testing.md`, integration tests live in `.spec.ts`
 * files and tear down their temp dirs in `afterEach`. No fixture is shared
 * mutably between tests.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Value } from '@sinclair/typebox/value';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataStoreOutputContract } from '@neo-search/contracts';
import type { ResultCardContract } from '@neo-search/contracts';
import { createBookmarkStore, type BookmarkStore } from '@neo-search/data-bookmarks';
import { createSearchCache, type SearchCache } from '@neo-search/data-cache';
import { createHistoryStore, type HistoryStore } from '@neo-search/data-history';
import { createDataStoreHandler } from './index.js';

// `DataStoreOutputContract` references `HistoryEntryContract.ts` (date-time)
// and `ResultCardContract.url` (uri); both formats are unregistered in
// TypeBox by default. The integration tests below validate every successful
// handler output against the union, so we register the format validators
// once at file load. This mirrors `web-search.test.ts`'s `beforeAll` shim.
import { FormatRegistry } from '@sinclair/typebox';

const URI_PATTERN = /^[a-z][a-z0-9+\-.]*:\/\/[^\s/$.?#].[^\s]*$/i;

beforeAll(() => {
  if (!FormatRegistry.Has('uri')) {
    FormatRegistry.Set('uri', (value) => URI_PATTERN.test(value));
  }
  if (!FormatRegistry.Has('date-time')) {
    FormatRegistry.Set('date-time', (value) => !Number.isNaN(Date.parse(value)));
  }
});

const liveSignal = (): AbortSignal => new AbortController().signal;

const sampleResult = (idx: number): ResultCardContract => ({
  title: `Result ${idx}`,
  snippet: `Snippet for result ${idx}`,
  domain: 'example.com',
  url: `https://example.com/r/${idx}`,
});

let dataDir: string;
let historyStore: HistoryStore;
let bookmarkStore: BookmarkStore;
let searchCache: SearchCache;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'neo-search-data-store-spec-'));
  // Each store gets its own subdir so the SQLite files don't collide and so
  // a teardown can `rmSync` the parent without leaving handles open across
  // stores. The composition root in production would do the same — the
  // `dataDir` per store is a layout choice the data-store tool inherits.
  historyStore = createHistoryStore({
    dataDir: join(dataDir, 'history'),
    idGenerator: ((): (() => string) => {
      let counter = 0;
      return (): string => `h-${++counter}`;
    })(),
    clock: ((): (() => Date) => {
      let nowMs = Date.parse('2026-05-10T12:00:00.000Z');
      // Each call advances by 1 ms so `ts DESC, id DESC` ordering is stable.
      return (): Date => new Date(nowMs++);
    })(),
  });
  bookmarkStore = createBookmarkStore({ dataDir: join(dataDir, 'bookmarks') });
  searchCache = createSearchCache({ dataDir: join(dataDir, 'cache') });
});

afterEach(() => {
  try {
    historyStore.close();
  } catch {
    // ignore
  }
  try {
    bookmarkStore.close();
  } catch {
    // ignore
  }
  try {
    searchCache.close();
  } catch {
    // ignore
  }
  rmSync(dataDir, { recursive: true, force: true });
});

describe('FR-014 / FR-015 / FR-016 — end-to-end happy path against real stores', () => {
  it('cache.write → cache.read → history.append (chunk ids) → history.list — composes through the facade', async () => {
    const handler = createDataStoreHandler({ historyStore, bookmarkStore, searchCache });

    // Step 1 — cache.write a small result set. With chunkSize=100 and a
    // 5-result fixture, this produces exactly 1 chunk.
    const results = Array.from({ length: 5 }, (_, i) => sampleResult(i));
    const writeResult = await handler(
      { op: 'cache.write', query: 'integration-q', results },
      liveSignal(),
    );
    expect(writeResult.ok).toBe(true);
    if (!writeResult.ok) throw new Error('cache.write failed');
    expect(Value.Check(DataStoreOutputContract, writeResult.value)).toBe(true);
    if (writeResult.value.op !== 'cache.write') throw new Error('expected cache.write');
    expect(writeResult.value.chunkIds).toHaveLength(1);
    const cachedChunkIds = writeResult.value.chunkIds;

    // Step 2 — cache.read the same query, page 1.
    const readResult = await handler(
      { op: 'cache.read', query: 'integration-q', page: 1 },
      liveSignal(),
    );
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) throw new Error('cache.read failed');
    expect(Value.Check(DataStoreOutputContract, readResult.value)).toBe(true);
    if (readResult.value.op !== 'cache.read') throw new Error('expected cache.read');
    expect(readResult.value.results).toEqual(results);
    expect(readResult.value.chunksRead).toBe(1);
    expect(readResult.value.pagination.totalChunks).toBe(1);

    // Step 3 — history.append referencing the cache chunk ids.
    const appendResult = await handler(
      {
        op: 'history.append',
        entry: {
          // The store stamps `id` and `ts` itself; we still have to satisfy
          // the contract's `entry` shape, so we send placeholders the store
          // is documented to overwrite.
          id: 'placeholder',
          query: 'integration-q',
          sourceFilter: 'LIVE',
          ts: '2026-05-10T12:00:00.000Z',
          resultChunkIds: cachedChunkIds,
        },
      },
      liveSignal(),
    );
    expect(appendResult.ok).toBe(true);
    if (!appendResult.ok) throw new Error('history.append failed');
    expect(Value.Check(DataStoreOutputContract, appendResult.value)).toBe(true);
    if (appendResult.value.op !== 'history.append') throw new Error('expected history.append');
    // The store generated id starts with `h-` per the injected generator.
    expect(appendResult.value.id).toMatch(/^h-/);

    // Step 4 — history.list page 1 shows the appended entry referencing the
    // cache chunk ids.
    const listResult = await handler({ op: 'history.list', page: 1 }, liveSignal());
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) throw new Error('history.list failed');
    expect(Value.Check(DataStoreOutputContract, listResult.value)).toBe(true);
    if (listResult.value.op !== 'history.list') throw new Error('expected history.list');
    expect(listResult.value.entries).toHaveLength(1);
    const entry = listResult.value.entries[0];
    expect(entry?.query).toBe('integration-q');
    expect(entry?.resultChunkIds).toEqual(cachedChunkIds);
  });

  it('bookmark.save → bookmark.list → bookmark.get — round-trips end-to-end', async () => {
    const handler = createDataStoreHandler({ historyStore, bookmarkStore, searchCache });

    const saveResult = await handler(
      {
        op: 'bookmark.save',
        entry: {
          kind: 'result',
          payload: { title: 'A bookmarked result', url: 'https://example.com' },
        },
      },
      liveSignal(),
    );
    expect(saveResult.ok).toBe(true);
    if (!saveResult.ok) throw new Error('bookmark.save failed');
    expect(Value.Check(DataStoreOutputContract, saveResult.value)).toBe(true);
    if (saveResult.value.op !== 'bookmark.save') throw new Error('expected bookmark.save');
    const id = saveResult.value.id;
    expect(id).toMatch(/^bm-/);

    const getResult = await handler({ op: 'bookmark.get', id }, liveSignal());
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) throw new Error('bookmark.get failed');
    expect(Value.Check(DataStoreOutputContract, getResult.value)).toBe(true);
    if (getResult.value.op !== 'bookmark.get') throw new Error('expected bookmark.get');
    expect(getResult.value.entry.id).toBe(id);
    expect(getResult.value.entry.kind).toBe('result');

    const listResult = await handler({ op: 'bookmark.list', page: 1 }, liveSignal());
    expect(listResult.ok).toBe(true);
    if (!listResult.ok) throw new Error('bookmark.list failed');
    expect(Value.Check(DataStoreOutputContract, listResult.value)).toBe(true);
    if (listResult.value.op !== 'bookmark.list') throw new Error('expected bookmark.list');
    expect(listResult.value.entries).toHaveLength(1);
    expect(listResult.value.entries[0]?.id).toBe(id);
  });

  it('bookmark.get for an unknown id surfaces validation "not-found" against a real store', async () => {
    const handler = createDataStoreHandler({ historyStore, bookmarkStore, searchCache });

    const result = await handler({ op: 'bookmark.get', id: 'bm-does-not-exist' }, liveSignal());

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'not-found' },
    });
  });
});

describe('FR-018 / NFR-004 — multi-chunk cache.read reports chunksRead strictly less than totalChunks (I-10)', () => {
  it('a 250-result write + page-2 read touches strictly fewer chunks than total', async () => {
    const handler = createDataStoreHandler({ historyStore, bookmarkStore, searchCache });

    // 250 results at chunk-size 100 → 3 chunks. Page 2 (results 26..50)
    // sits inside chunk 0; the read MUST touch 1 chunk, not 3.
    const results = Array.from({ length: 250 }, (_, i) => sampleResult(i));
    const writeResult = await handler(
      { op: 'cache.write', query: 'multi-chunk-q', results },
      liveSignal(),
    );
    expect(writeResult.ok).toBe(true);
    if (!writeResult.ok) throw new Error('cache.write failed');
    if (writeResult.value.op !== 'cache.write') throw new Error('expected cache.write');
    expect(writeResult.value.chunkIds.length).toBeGreaterThan(1);

    const readResult = await handler(
      { op: 'cache.read', query: 'multi-chunk-q', page: 2 },
      liveSignal(),
    );
    expect(readResult.ok).toBe(true);
    if (!readResult.ok) throw new Error('cache.read failed');
    if (readResult.value.op !== 'cache.read') throw new Error('expected cache.read');

    // I-10: strictly fewer than the total chunk count.
    expect(readResult.value.chunksRead).toBeLessThan(readResult.value.pagination.totalChunks);
    // The chunk-storage strategy is 100 results / chunk and 25 results / page,
    // so a single page read touches exactly 1 chunk regardless of total chunks.
    expect(readResult.value.chunksRead).toBe(1);
    expect(readResult.value.pagination.totalChunks).toBe(3);
  });
});

describe('FR-023 — store throws are caught at the facade and surface as terminal', () => {
  it('history.list with page=0 (RangeError from the store) surfaces as terminal, not a thrown exception', async () => {
    const handler = createDataStoreHandler({ historyStore, bookmarkStore, searchCache });

    // The history store throws RangeError on a non-positive page (defensive
    // boundary check). The wire validator (registry) would reject this
    // before the handler runs, but here we drive the handler directly to
    // exercise the throw-translation path against a REAL store.
    const result = await handler({ op: 'history.list', page: 0 }, liveSignal());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toMatch(/page MUST be a positive integer/);
  });
});

/**
 * STORY-005 integration tests for the indexed search cache (FR-016, FR-018,
 * NFR-004). These specs differ from `cache.test.ts` in two ways:
 *
 *   1. They exercise the full `largeResultSetFixture` (1000 results) end-to-end
 *      so the test asserts the system under real chunking + indexing, not a
 *      mocked subset.
 *   2. They cover the FR-016 acceptance criterion AC 6 — "the store MUST
 *      survive a process restart" — by tearing down the SQLite handle and
 *      re-opening on the same `dataDir`, then re-reading.
 *
 * The matching unit-tier file is `cache.test.ts`; the FR-coverage matrix in
 * `.design/technology/testing.md` cites this file as the FR-016 / FR-018 /
 * NFR-004 evidence.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { largeResultSetFixture, LARGE_RESULT_SET_COUNT } from '@neo-search/test-fixtures';
import { DEFAULT_PAGE_SIZE, createSearchCache, type SearchCache } from './index.js';

let dataDir: string;
let cache: SearchCache;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'neo-search-cache-spec-'));
});

afterEach(() => {
  try {
    cache.close();
  } catch {
    // ignore — some specs close the handle themselves
  }
  rmSync(dataDir, { recursive: true, force: true });
});

describe('FR-016 / FR-018 / NFR-004 — 1000-result fixture round-trip', () => {
  it('write(largeResultSetFixture) produces 10 chunks, page 1 returns first 25, chunksRead === 1', async () => {
    cache = createSearchCache({ dataDir });
    const { chunkIds } = await cache.write('large-fixture', largeResultSetFixture);
    expect(chunkIds).toHaveLength(10);

    const { results, chunksRead, pagination } = await cache.read('large-fixture', 1);
    expect(results).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(results).toEqual(largeResultSetFixture.slice(0, DEFAULT_PAGE_SIZE));
    expect(chunksRead).toBe(1);
    expect(pagination).toEqual({ page: 1, totalChunks: 10, hasMore: true });
  });

  it('reading a mid-range page (page=5) for a 10-chunk query touches 1 chunk (NFR-004 headroom)', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('large-fixture', largeResultSetFixture);

    const { results, chunksRead, pagination } = await cache.read('large-fixture', 5);
    expect(results).toEqual(largeResultSetFixture.slice(100, 125));
    expect(chunksRead).toBe(1);
    expect(chunksRead).toBeLessThan(pagination.totalChunks);
  });

  it('every page across the fixture concatenates back to the original 1000 results in order', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('large-fixture', largeResultSetFixture);

    const totalPages = LARGE_RESULT_SET_COUNT / DEFAULT_PAGE_SIZE; // 40
    const reassembled: typeof largeResultSetFixture = [];
    for (let page = 1; page <= totalPages; page++) {
      const { results, chunksRead } = await cache.read('large-fixture', page);
      // Each page MUST touch exactly 1 chunk — this is the structural property
      // NFR-004 demands the implementation hold.
      expect(chunksRead).toBe(1);
      reassembled.push(...results);
    }
    expect(reassembled).toEqual(largeResultSetFixture);
  });
});

describe('FR-016 — store survives a process restart (AC 6, I-12)', () => {
  it('write in store A, close, reopen on the same dataDir, read — the same results return', async () => {
    // ──────── First "process": write the fixture and tear the handle down. ────────
    const storeA: SearchCache = createSearchCache({ dataDir });
    await storeA.write('persistent-query', largeResultSetFixture);
    storeA.close();

    // ──────── Second "process": fresh handle on the same dataDir. ────────
    const storeB: SearchCache = createSearchCache({ dataDir });
    cache = storeB; // so afterEach can close it
    const { results, chunksRead, pagination } = await storeB.read('persistent-query', 1);
    expect(results).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(results).toEqual(largeResultSetFixture.slice(0, DEFAULT_PAGE_SIZE));
    expect(chunksRead).toBe(1);
    expect(pagination).toEqual({ page: 1, totalChunks: 10, hasMore: true });

    // The chunk-body files on disk must still be there (no cleanup ran on
    // close). Page 17 (results 400..424) sits inside chunk 4.
    const page17 = await storeB.read('persistent-query', 17);
    expect(page17.results).toEqual(largeResultSetFixture.slice(400, 425));
    expect(page17.chunksRead).toBe(1);
  });

  it('a third reopen still sees the entries — migration is idempotent', async () => {
    const storeA = createSearchCache({ dataDir });
    await storeA.write('idempotent', largeResultSetFixture);
    storeA.close();

    const storeB = createSearchCache({ dataDir });
    storeB.close();

    const storeC = createSearchCache({ dataDir });
    cache = storeC;
    const { pagination } = await storeC.read('idempotent', 1);
    expect(pagination.totalChunks).toBe(10);
  });
});

describe('FR-020 — the documented index lookup is what the implementation issues', () => {
  // FR-020 demands the README / data-layer doc state the index structure and
  // lookup method, AND the implementation match. The doc says:
  //   "a read for `(query, page)` issues a single SQL
  //    `SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?`"
  //
  // We cannot cheaply intercept SQL from outside `cache.ts`, but we can
  // assert the structural property the doc promises: the SQLite index for
  // `(query, page)` is the primary key of `cache_index`. SQLite serves
  // primary-key lookups via a b-tree index without a full scan; the schema
  // asserted below is the contract.
  it('cache_index has a primary key on (query, page) — the FR-020 lookup index', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('schema-check', largeResultSetFixture);

    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      // PRAGMA index_list shows every index on the table; PRAGMA index_info
      // describes the columns of one. The PK auto-index for `cache_index`
      // is named `sqlite_autoindex_cache_index_<n>`.
      const idxList = inspector.prepare(`PRAGMA index_list('cache_index')`).all() as Array<{
        name: string;
        origin: string;
        unique: number;
      }>;
      const pkIndex = idxList.find((entry) => entry.origin === 'pk');
      expect(pkIndex, 'cache_index MUST have a PRIMARY KEY index per FR-020').toBeDefined();

      // PRAGMA does not support parameter binding (SQLite quirk); inline the
      // index name we just learned. Safe because `pkIndex.name` came from
      // `PRAGMA index_list`, not user input.
      const pkColumns = inspector.prepare(`PRAGMA index_info('${pkIndex!.name}')`).all() as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;
      const columnNames = pkColumns.sort((a, b) => a.seqno - b.seqno).map((c) => c.name);
      expect(columnNames).toEqual(['query', 'page']);

      // The query plan for the FR-020 lookup MUST cite the PK index (not a
      // table scan). Vendoring the EXPLAIN QUERY PLAN output keeps the
      // structural assertion meaningful — if a future migration drops the PK
      // and adds a separate index, this asserts the plan still uses an index.
      const plan = inspector
        .prepare(`EXPLAIN QUERY PLAN SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?`)
        .all('schema-check', 1) as Array<{ detail: string }>;
      const detail = plan.map((row) => row.detail).join(' | ');
      expect(detail).toMatch(/USING (?:COVERING )?INDEX/i);
    } finally {
      inspector.close();
    }
  });

  it('cache_chunks has a secondary index on `query` so per-query DELETE is fast', async () => {
    cache = createSearchCache({ dataDir });
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const idxList = inspector.prepare(`PRAGMA index_list('cache_chunks')`).all() as Array<{
        name: string;
        origin: string;
      }>;
      const queryIdx = idxList.find((entry) => entry.name === 'cache_chunks_query_idx');
      expect(queryIdx).toBeDefined();
    } finally {
      inspector.close();
    }
  });
});

describe('NFR-006 / I-14 — schema carries no user/tenant/session column', () => {
  // Same posture as the history and bookmark stores' schema-introspection tests.
  // STORY-018 wires a repo-grep that catches the same mistake; this is the
  // SQLite-level structural guard.
  const FORBIDDEN_COLUMN_PATTERNS = [
    /user/i,
    /tenant/i,
    /session/i,
    /account/i,
    /owner/i,
    /principal/i,
  ];

  it('cache_chunks columns are exactly the documented set', () => {
    cache = createSearchCache({ dataDir });
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const cols = inspector.prepare(`PRAGMA table_info(cache_chunks)`).all() as Array<{
        name: string;
      }>;
      const names = cols.map((c) => c.name).sort();
      expect(names).toEqual([
        'byte_size',
        'chunk_id',
        'first_ordinal',
        'path',
        'query',
        'sequence',
      ]);
    } finally {
      inspector.close();
    }
  });

  it('cache_index columns are exactly (query, page, chunk_id)', () => {
    cache = createSearchCache({ dataDir });
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const cols = inspector.prepare(`PRAGMA table_info(cache_index)`).all() as Array<{
        name: string;
      }>;
      const names = cols.map((c) => c.name).sort();
      expect(names).toEqual(['chunk_id', 'page', 'query']);
    } finally {
      inspector.close();
    }
  });

  it('no column on either table matches user/tenant/session/account/owner/principal patterns', () => {
    cache = createSearchCache({ dataDir });
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      for (const table of ['cache_chunks', 'cache_index']) {
        const cols = inspector.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>;
        for (const col of cols) {
          for (const pattern of FORBIDDEN_COLUMN_PATTERNS) {
            expect(
              pattern.test(col.name),
              `${table}.${col.name} matches ${pattern} — see I-14, NFR-006`,
            ).toBe(false);
          }
        }
      }
    } finally {
      inspector.close();
    }
  });
});

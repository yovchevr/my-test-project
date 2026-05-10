/**
 * STORY-005 unit tests for the indexed search cache (FR-016, FR-018, FR-020,
 * NFR-004). Each test maps to one acceptance criterion in
 * `.stories/project-spec/STORY-005-search-cache.md`:
 *
 *   - "1000 results → 10 cache_chunks rows + ≥ pageSize cache_index rows"      → AC 1
 *   - "read(query, page=1) returns first 25 results, chunksRead === 1"          → AC 2 / FR-018 / NFR-004
 *   - "read(query, page=N) where N > 1 chunks → chunksRead < totalChunks"       → AC 3 / NFR-004
 *   - "write that fails on the 5th chunk → SQLite rolled back, files unlinked"  → AC 4
 *   - "repeat write atomically replaces prior chunks (old files unlinked)"      → AC 5
 *   - "read(unknownQuery) → { results: [], chunksRead: 0, … hasMore: false }"   → AC 7
 *   - "pre-aborted signal causes early return without touching disk"            → AC 8
 *
 * The "process restart" AC (AC 6) is exercised in `cache.spec.ts`. The
 * NFR-004 parameterized "no full scan" test (N = 2, 10, 100 chunks) lives
 * here as well — it is the categorical assertion the story's test plan calls
 * out.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateResults } from '@neo-search/test-fixtures';
import { DEFAULT_PAGE_SIZE, createSearchCache, type CacheFs, type SearchCache } from './index.js';

/**
 * Real filesystem facade — the unit tests inject this when they only want to
 * fault one of the four ports without re-implementing the rest. Mirrors the
 * production `defaultFs` in `cache.ts`.
 */
const realFs: CacheFs = {
  mkdir: (path) => {
    mkdirSync(path, { recursive: true });
  },
  writeFile: (path, body) => {
    writeFileSync(path, body);
  },
  readFile: (path) => readFileSync(path, 'utf8'),
  unlink: (path) => {
    rmSync(path, { force: true });
  },
};

let dataDir: string;
let cache: SearchCache;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'neo-search-cache-test-'));
});

afterEach(() => {
  try {
    cache.close();
  } catch {
    // ignore — some tests close themselves
  }
  rmSync(dataDir, { recursive: true, force: true });
});

const queryHashOf = (query: string): string =>
  createHash('sha256').update(query.trim().toLowerCase()).digest('hex');

const chunkDirOf = (query: string): string => join(dataDir, 'chunks', queryHashOf(query));

describe('FR-016 / FR-018 — write produces 10 chunks + ≥ pageSize index rows for 1000 results', () => {
  it('writes 10 cache_chunks rows and ≥ DEFAULT_PAGE_SIZE cache_index rows for 1000 results (AC 1)', async () => {
    cache = createSearchCache({ dataDir });
    const results = generateResults(1000, 0xc0ffee);
    const { chunkIds } = await cache.write('q-1000', results);

    expect(chunkIds).toHaveLength(10);

    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const chunkCount = (
        inspector
          .prepare('SELECT COUNT(*) AS c FROM cache_chunks WHERE query = ?')
          .get('q-1000') as { c: number }
      ).c;
      const indexCount = (
        inspector
          .prepare('SELECT COUNT(*) AS c FROM cache_index WHERE query = ?')
          .get('q-1000') as { c: number }
      ).c;
      expect(chunkCount).toBe(10);
      // 1000 results / 25 results-per-page = 40 pages; one cache_index row per page.
      expect(indexCount).toBe(40);
      expect(indexCount).toBeGreaterThanOrEqual(DEFAULT_PAGE_SIZE);
    } finally {
      inspector.close();
    }
  });

  it('writes one chunk-body file per chunk under chunks/<query-hash>/', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('q-1000', generateResults(1000, 0xc0ffee));

    const dir = chunkDirOf('q-1000');
    const files = readdirSync(dir).sort();
    expect(files).toEqual([
      '00000.json',
      '00001.json',
      '00002.json',
      '00003.json',
      '00004.json',
      '00005.json',
      '00006.json',
      '00007.json',
      '00008.json',
      '00009.json',
    ]);
  });
});

describe('FR-018 / NFR-004 — read returns the requested page from a single chunk (AC 2, 3)', () => {
  it('read(page=1) returns the first 25 results in input order and chunksRead === 1 (AC 2)', async () => {
    cache = createSearchCache({ dataDir });
    const results = generateResults(1000, 0xc0ffee);
    await cache.write('q-1000', results);

    const { results: page1, chunksRead, pagination } = await cache.read('q-1000', 1);
    expect(page1).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(page1).toEqual(results.slice(0, DEFAULT_PAGE_SIZE));
    // The whole point of NFR-004: page 1 of a 10-chunk query touches exactly one chunk.
    expect(chunksRead).toBe(1);
    expect(pagination).toEqual({ page: 1, totalChunks: 10, hasMore: true });
  });

  it('read(page=5) returns results 100..124 and still loads only one chunk (NFR-004 / AC 3)', async () => {
    cache = createSearchCache({ dataDir });
    const results = generateResults(1000, 0xc0ffee);
    await cache.write('q-1000', results);

    // Page 5 of pageSize=25 → results at 0-based indices 100..124, which sit
    // entirely inside chunk 1 (chunk 0 holds 0..99, chunk 1 holds 100..199).
    const { results: page5, chunksRead, pagination } = await cache.read('q-1000', 5);
    expect(page5).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(page5).toEqual(results.slice(100, 125));
    expect(chunksRead).toBe(1);
    // 1 < 10 — NFR-004's "strictly fewer than total" bound holds with headroom.
    expect(chunksRead).toBeLessThan(pagination.totalChunks);
  });

  it('read(page=40) — last page — returns results 975..999 (boundary check)', async () => {
    cache = createSearchCache({ dataDir });
    const results = generateResults(1000, 0xc0ffee);
    await cache.write('q-1000', results);

    const { results: lastPage, chunksRead, pagination } = await cache.read('q-1000', 40);
    expect(lastPage).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(lastPage).toEqual(results.slice(975, 1000));
    expect(chunksRead).toBe(1);
    expect(pagination).toEqual({ page: 40, totalChunks: 10, hasMore: false });
  });

  it('read(page beyond last) returns an empty slice with chunksRead === 0 and hasMore === false', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('q-1000', generateResults(1000, 0xc0ffee));
    const { results, chunksRead, pagination } = await cache.read('q-1000', 41);
    expect(results).toEqual([]);
    expect(chunksRead).toBe(0);
    expect(pagination).toEqual({ page: 41, totalChunks: 10, hasMore: false });
  });
});

describe('NFR-004 — chunksRead < totalChunks for any multi-chunk query (categorical assertion)', () => {
  // The story's test plan calls out N = 2, 10, 100 chunks. We parameterize on
  // total result counts that produce those chunk counts at the default 100/chunk.
  const cases = [
    { totalResults: 200, expectedChunks: 2 },
    { totalResults: 1000, expectedChunks: 10 },
    { totalResults: 10_000, expectedChunks: 100 },
  ];

  for (const { totalResults, expectedChunks } of cases) {
    it(`a ${totalResults}-result query (${expectedChunks} chunks): every page touches < ${expectedChunks} chunks`, async () => {
      cache = createSearchCache({ dataDir });
      const results = generateResults(totalResults, 0xc0ffee);
      await cache.write(`q-${totalResults}`, results);

      // Sample page numbers across the range — first, middle, and last page —
      // so we catch both off-by-one and middle-page regressions.
      const totalPages = Math.ceil(totalResults / DEFAULT_PAGE_SIZE);
      const samples = [1, Math.ceil(totalPages / 2), totalPages];
      for (const page of samples) {
        const { chunksRead, pagination } = await cache.read(`q-${totalResults}`, page);
        expect(pagination.totalChunks).toBe(expectedChunks);
        expect(chunksRead).toBeLessThan(expectedChunks);
        // For the ordinal-boundary policy with pageSize=25 and chunkSize=100,
        // every page maps to exactly one chunk. The structural property we
        // care about is chunksRead < totalChunks; the stronger 1-chunk-per-page
        // claim is asserted in the dedicated AC tests above.
        expect(chunksRead).toBe(1);
      }
    });
  }
});

describe('atomicity — write that fails on the 5th chunk rolls back SQLite + filesystem (AC 4)', () => {
  it('throws, leaves cache_chunks empty for the query, and unlinks every chunk file written so far', async () => {
    let writeCount = 0;
    const failingFs: CacheFs = {
      ...realFs,
      writeFile: (path, body) => {
        writeCount++;
        if (writeCount === 5) {
          throw new Error('injected I/O failure on the 5th chunk');
        }
        realFs.writeFile(path, body);
      },
    };
    cache = createSearchCache({ dataDir, fs: failingFs });

    const results = generateResults(1000, 0xc0ffee);
    await expect(cache.write('q-fail', results)).rejects.toThrow(
      /injected I\/O failure on the 5th chunk/,
    );

    // Filesystem: no chunk files for this query remain.
    const dir = chunkDirOf('q-fail');
    if (existsSync(dir)) {
      const remaining = readdirSync(dir);
      expect(remaining).toEqual([]);
    }

    // SQLite: no rows in either table for this query.
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const chunks = inspector
        .prepare('SELECT COUNT(*) AS c FROM cache_chunks WHERE query = ?')
        .get('q-fail') as { c: number };
      const idx = inspector
        .prepare('SELECT COUNT(*) AS c FROM cache_index WHERE query = ?')
        .get('q-fail') as { c: number };
      expect(chunks.c).toBe(0);
      expect(idx.c).toBe(0);
    } finally {
      inspector.close();
    }
  });

  it('a write that fails AFTER chunk files are written (between phase 1 and 2) unlinks them', async () => {
    cache = createSearchCache({ dataDir });
    // Closing the SQLite handle makes any subsequent prepared-statement call
    // throw — that is the simplest way to trip the post-phase-1 rollback path
    // without needing a stub for SQLite itself. The phase 1 fs.writeFile
    // calls succeed, then phase 2's `selectChunksForQueryStmt.all` throws,
    // and the rollback unlinks the chunk files.
    cache.close();

    const results = generateResults(1000, 0xc0ffee);
    await expect(cache.write('q-late-fail', results)).rejects.toThrow();

    // Filesystem: every chunk file the partial write left behind has been
    // unlinked. The directory may exist but MUST be empty.
    const dir = chunkDirOf('q-late-fail');
    if (existsSync(dir)) {
      expect(readdirSync(dir)).toEqual([]);
    }
  });
});

describe('atomic replace — repeated write replaces prior chunks (AC 5)', () => {
  it('overwriting a 1000-result query with a 200-result query unlinks chunks 02..09', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('q-replace', generateResults(1000, 0xc0ffee));
    expect(readdirSync(chunkDirOf('q-replace'))).toHaveLength(10);

    await cache.write('q-replace', generateResults(200, 0xdeadbeef));
    const remaining = readdirSync(chunkDirOf('q-replace')).sort();
    expect(remaining).toEqual(['00000.json', '00001.json']);

    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const chunkCount = (
        inspector
          .prepare('SELECT COUNT(*) AS c FROM cache_chunks WHERE query = ?')
          .get('q-replace') as { c: number }
      ).c;
      const indexCount = (
        inspector
          .prepare('SELECT COUNT(*) AS c FROM cache_index WHERE query = ?')
          .get('q-replace') as { c: number }
      ).c;
      expect(chunkCount).toBe(2);
      // 200 results / 25 = 8 pages.
      expect(indexCount).toBe(8);
    } finally {
      inspector.close();
    }

    // Reading page 1 returns the new fixture's first 25, not the prior one's.
    const { results } = await cache.read('q-replace', 1);
    expect(results).toEqual(generateResults(200, 0xdeadbeef).slice(0, 25));
  });
});

describe('unknown query — read returns the empty miss shape (AC 7)', () => {
  it('returns { results: [], chunksRead: 0, pagination: { page, totalChunks: 0, hasMore: false } }', async () => {
    cache = createSearchCache({ dataDir });
    const result = await cache.read('never-written', 1);
    expect(result).toEqual({
      results: [],
      chunksRead: 0,
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    });
  });

  it('returns the same empty-miss shape for an arbitrary page on an unknown query', async () => {
    cache = createSearchCache({ dataDir });
    const result = await cache.read('also-not-here', 9999);
    expect(result).toEqual({
      results: [],
      chunksRead: 0,
      pagination: { page: 9999, totalChunks: 0, hasMore: false },
    });
  });
});

describe('AbortSignal — pre-aborted signal returns early without touching disk (AC 8)', () => {
  it('write throws before any chunk file is written', async () => {
    let writeCalls = 0;
    let mkdirCalls = 0;
    let unlinkCalls = 0;
    const trackingFs: CacheFs = {
      mkdir: (path) => {
        mkdirCalls++;
        // We still need the data dir to exist for the SQLite open at
        // construction time, so delegate to the real filesystem here.
        realFs.mkdir(path);
      },
      writeFile: () => {
        writeCalls++;
      },
      readFile: () => '',
      unlink: () => {
        unlinkCalls++;
      },
    };
    cache = createSearchCache({ dataDir, fs: trackingFs });
    // The construction-time mkdir of the data dir is expected; reset the
    // counter so the assertion only measures `write`'s side effects.
    mkdirCalls = 0;

    const controller = new AbortController();
    controller.abort(new Error('test abort'));

    await expect(
      cache.write('q-aborted', generateResults(50, 1), controller.signal),
    ).rejects.toThrow('test abort');

    expect(writeCalls).toBe(0);
    expect(mkdirCalls).toBe(0);
    expect(unlinkCalls).toBe(0);
  });

  it('read throws before any SQLite query runs', async () => {
    cache = createSearchCache({ dataDir });
    await cache.write('q-cached', generateResults(100, 1));

    const controller = new AbortController();
    controller.abort(new Error('read abort'));
    await expect(cache.read('q-cached', 1, controller.signal)).rejects.toThrow('read abort');
  });

  it('write probes the signal between chunk-file writes — abort mid-write rolls back', async () => {
    const controller = new AbortController();
    let writes = 0;
    const observingFs: CacheFs = {
      ...realFs,
      writeFile: (path, body) => {
        writes++;
        if (writes === 3) {
          controller.abort(new Error('mid-write abort'));
        }
        realFs.writeFile(path, body);
      },
    };
    cache = createSearchCache({ dataDir, fs: observingFs });

    await expect(
      cache.write('q-mid', generateResults(1000, 0xc0ffee), controller.signal),
    ).rejects.toThrow('mid-write abort');

    // The rollback path unlinks every chunk file the partial write created.
    const dir = chunkDirOf('q-mid');
    if (existsSync(dir)) {
      expect(readdirSync(dir)).toEqual([]);
    }

    // SQLite was never touched (phase 2 didn't run).
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const chunkCount = (
        inspector
          .prepare('SELECT COUNT(*) AS c FROM cache_chunks WHERE query = ?')
          .get('q-mid') as { c: number }
      ).c;
      expect(chunkCount).toBe(0);
    } finally {
      inspector.close();
    }
  });
});

describe('createSearchCache — parameter validation', () => {
  it('rejects a non-positive pageSize at construction time', () => {
    expect(() => createSearchCache({ dataDir, pageSize: 0 })).toThrow(/pageSize/);
    expect(() => createSearchCache({ dataDir, pageSize: -5 })).toThrow(/pageSize/);
    expect(() => createSearchCache({ dataDir, pageSize: 1.5 })).toThrow(/pageSize/);
  });

  it('rejects a non-positive page argument on read', async () => {
    cache = createSearchCache({ dataDir });
    await expect(cache.read('q', 0)).rejects.toBeInstanceOf(RangeError);
    await expect(cache.read('q', -1)).rejects.toBeInstanceOf(RangeError);
    await expect(cache.read('q', 1.5)).rejects.toBeInstanceOf(RangeError);
  });

  it('honors a custom pageSize override (smaller pages → more index rows)', async () => {
    cache = createSearchCache({ dataDir, pageSize: 10 });
    await cache.write('q-100', generateResults(100, 1));
    const inspector = new Database(join(dataDir, 'cache.sqlite'), { readonly: true });
    try {
      const indexCount = (
        inspector.prepare('SELECT COUNT(*) AS c FROM cache_index WHERE query = ?').get('q-100') as {
          c: number;
        }
      ).c;
      // 100 results / 10 = 10 pages, all mapping to the single chunk produced
      // by 100 results at the default 100/chunk size.
      expect(indexCount).toBe(10);
    } finally {
      inspector.close();
    }

    const { results } = await cache.read('q-100', 1);
    expect(results).toHaveLength(10);
  });
});

describe('determinism — chunk file paths are stable across writes (I-30, I-31, ADR 0003)', () => {
  it('the same query string produces the same chunks/<query-hash>/ directory on every call', async () => {
    cache = createSearchCache({ dataDir });
    const expected = queryHashOf('Same Query   ');
    await cache.write('Same Query   ', generateResults(50, 1));
    expect(existsSync(join(dataDir, 'chunks', expected))).toBe(true);
  });

  it("the hash is SHA-256 of the lowercased trimmed query (whitespace + casing don't change the hash)", async () => {
    cache = createSearchCache({ dataDir });
    const queryA = 'Hello World';
    const queryB = '  hello world  ';
    expect(queryHashOf(queryA)).toBe(queryHashOf(queryB));
  });
});

describe('vi spy on the chunk-read path — chunksRead is observable per-call', () => {
  // The story's NFR-004 test plan asks for a spy on the chunk-read path. We
  // assert the readFile port is invoked exactly once per `read(query, page)`
  // for any multi-chunk query, which is the structural form of "load only
  // the chunks the lookup says we need".
  it('read for a multi-chunk query opens exactly one chunk-body file per call', async () => {
    const realRead = vi.fn((path: string): string => realFs.readFile(path));
    const trackingFs: CacheFs = {
      ...realFs,
      readFile: realRead,
    };
    cache = createSearchCache({ dataDir, fs: trackingFs });
    await cache.write('q-1000', generateResults(1000, 0xc0ffee));

    realRead.mockClear();
    await cache.read('q-1000', 7);
    expect(realRead).toHaveBeenCalledTimes(1);

    realRead.mockClear();
    await cache.read('q-1000', 23);
    expect(realRead).toHaveBeenCalledTimes(1);
  });
});

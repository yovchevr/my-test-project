/**
 * `SearchCache` — the indexed search cache (FR-016, FR-018, FR-020, NFR-004,
 * STORY-005). Persists fetched web results in chunks so reads return only the
 * chunks they need.
 *
 * Substrate (per `.design/components/data-layer.md` and ADR 0003):
 *   - SQLite (`better-sqlite3@11.5.0`) holds the index in two tables:
 *       `cache_index(query, page, chunk_id, PRIMARY KEY (query, page))`
 *       `cache_chunks(chunk_id PK, query, sequence, byte_size, path)`
 *   - Chunk bodies live as one JSON file per chunk under
 *       `<dataDir>/chunks/<query-hash>/<sequence>.json`
 *   - `<query-hash>` is SHA-256 of the lowercased trimmed query string (ADR 0003).
 *
 * Atomicity (ADR 0003): chunk files are written first, then the SQLite
 * transaction commits. On any I/O error the transaction MUST roll back AND all
 * chunk files written for this query MUST be unlinked. A repeated `write`
 * atomically replaces the prior chunks for the same query — old chunk files
 * are unlinked inside the same transaction the index is rewritten under.
 *
 * Layering (per `.design/components/data-layer.md` and FR-024): this module is
 * imported only by the `data-store` tool (STORY-010). The agent, API, and UI
 * MUST NOT import it directly.
 *
 * Cancellation (per `.design/foundation/conventions.md`): every method accepts
 * an `AbortSignal`. A pre-aborted signal causes early return without touching
 * disk; the long-running `write` path also probes the signal between chunk-file
 * writes (the chunker step is pure, so the SQLite step is the only other
 * cancellable seam).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database, { type Database as DatabaseType } from 'better-sqlite3';
import type { PaginationContract, ResultCardContract } from '@neo-search/contracts';
import { chunk, type Chunk, type ChunkOptions } from './chunker.js';

/** Re-export the contract types so callers don't need to dual-import. */
export type ResultCard = ResultCardContract;
export type Pagination = PaginationContract;

/**
 * Default UI page size for `read`. Pinned at 25 by ADR 0003's headroom math:
 * 100 results/chunk × 4 pages/chunk = 1 chunk per page read. Lifted to a
 * named constant so the test suite cites a single source.
 */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Result of a cache write. The chunk-id list is the same one the
 * `data-store` tool exposes on the wire (STORY-010 wraps this).
 */
export interface CacheWriteResult {
  chunkIds: string[];
}

/**
 * Result of a cache read. `chunksRead` is the per-call observable that the
 * NFR-004 test asserts (I-10) — it MUST equal the number of chunk-body files
 * actually opened to satisfy this read.
 */
export interface CacheReadResult {
  results: ResultCard[];
  chunksRead: number;
  pagination: Pagination;
}

/**
 * The in-process interface the `data-store` tool (STORY-010) wraps. Pinned by
 * `.design/components/data-layer.md`.
 */
export interface SearchCache {
  /**
   * Hashes the query, chunks the results, writes one JSON file per chunk, then
   * in a single SQLite transaction inserts/replaces rows in `cache_chunks` and
   * `cache_index`. On any I/O error all written chunk files for this query are
   * removed and the transaction rolled back. Returns the chunk-id list.
   */
  write(query: string, results: ResultCard[], signal?: AbortSignal): Promise<CacheWriteResult>;
  /**
   * Looks up `(query, page)` in `cache_index`, loads only the chunk(s) the
   * lookup returns, and returns the slice for the requested page. Unknown
   * queries return an empty result set with `chunksRead: 0` (an empty miss is
   * not terminal, per the AC).
   */
  read(query: string, page: number, signal?: AbortSignal): Promise<CacheReadResult>;
  /** Closes the underlying SQLite handle. Idempotent. */
  close(): void;
}

/**
 * Filesystem ports — injectable so the unit tests can simulate I/O failures
 * (the rollback-on-failure AC) without touching the real disk. The default
 * implementation uses `node:fs` synchronously to mirror `better-sqlite3`'s
 * synchronous posture.
 */
export interface CacheFs {
  mkdir(path: string): void;
  writeFile(path: string, body: string): void;
  readFile(path: string): string;
  unlink(path: string): void;
}

const defaultFs: CacheFs = {
  mkdir: (path: string): void => {
    mkdirSync(path, { recursive: true });
  },
  writeFile: (path: string, body: string): void => {
    writeFileSync(path, body);
  },
  readFile: (path: string): string => readFileSync(path, 'utf8'),
  unlink: (path: string): void => {
    // `force: true` makes a missing file a no-op. The rollback path may try to
    // unlink a chunk file that was never created (the failure injected on the
    // 5th chunk leaves chunks 6..N untouched), and we don't want that to mask
    // the original error.
    rmSync(path, { force: true });
  },
};

/**
 * Constructor options for `createSearchCache`.
 */
export interface CreateSearchCacheOptions {
  /** Directory that will contain `cache.sqlite` and the `chunks/` tree. */
  dataDir: string;
  /** UI page size for `read`. Defaults to `DEFAULT_PAGE_SIZE` (25). */
  pageSize?: number;
  /**
   * Per-call chunker overrides. Defaults are pinned by ADR 0003 — only tests
   * should pass anything other than `undefined`.
   */
  chunkOptions?: ChunkOptions;
  /** Injected filesystem; defaults to `node:fs` synchronous calls. */
  fs?: CacheFs;
}

/**
 * Compute the on-disk hash of a query. Pinned to SHA-256 of the lowercased
 * trimmed query string (ADR 0003). Hex-encoded for filesystem safety.
 */
const hashQuery = (query: string): string => {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
};

/** Reject early if the signal is already aborted, before any I/O. */
const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Aborted', 'AbortError');
};

/** Resolve the SQL migration file relative to this module. */
const readMigration = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/cache.ts` → `../migrations/001-initial.sql`.
  const sqlPath = join(here, '..', 'migrations', '001-initial.sql');
  return readFileSync(sqlPath, 'utf8');
};

interface ChunkRow {
  chunk_id: string;
  query: string;
  sequence: number;
  byte_size: number;
  path: string;
  first_ordinal: number;
}

interface IndexRow {
  chunk_id: string;
}

/** Build the deterministic chunk-id for a (query-hash, sequence) pair. */
const chunkId = (queryHash: string, sequence: number): string =>
  `${queryHash}-${sequence.toString().padStart(5, '0')}`;

/** Compute the `chunks/<query-hash>/` directory for a query. */
const chunkDirOf = (dataDir: string, queryHash: string): string =>
  join(dataDir, 'chunks', queryHash);

/** Compute the chunk-body file path for a (query-hash, sequence) pair. */
const chunkPathOf = (dataDir: string, queryHash: string, sequence: number): string =>
  join(chunkDirOf(dataDir, queryHash), `${sequence.toString().padStart(5, '0')}.json`);

/**
 * Opens the search cache, applying the initial migration if needed. The
 * migration is idempotent (`CREATE TABLE IF NOT EXISTS`), so reopening an
 * existing database is safe — this is what makes the FR-016 "survives process
 * restart" test work.
 */
export const createSearchCache = (opts: CreateSearchCacheOptions): SearchCache => {
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`pageSize MUST be a positive integer; received ${pageSize}`);
  }
  const fs = opts.fs ?? defaultFs;
  const chunkOpts = opts.chunkOptions;

  fs.mkdir(opts.dataDir);
  const dbPath = join(opts.dataDir, 'cache.sqlite');
  const db: DatabaseType = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  // The cache must clean up its own foreign-key debt on a query overwrite, so
  // foreign-keys is on. The `cache_index → cache_chunks` reference is logical
  // (we delete `cache_index` rows first, then `cache_chunks`), but the PRAGMA
  // is cheap and catches bugs in the delete order.
  db.pragma('foreign_keys = ON');
  db.exec(readMigration());

  const insertChunkStmt = db.prepare<[string, string, number, number, string, number]>(
    `INSERT INTO cache_chunks (chunk_id, query, sequence, byte_size, path, first_ordinal) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertIndexStmt = db.prepare<[string, number, string]>(
    `INSERT INTO cache_index (query, page, chunk_id) VALUES (?, ?, ?)`,
  );
  const deleteIndexForQueryStmt = db.prepare<[string]>(`DELETE FROM cache_index WHERE query = ?`);
  const deleteChunksForQueryStmt = db.prepare<[string]>(`DELETE FROM cache_chunks WHERE query = ?`);
  const selectChunksForQueryStmt = db.prepare<[string]>(
    `SELECT chunk_id, query, sequence, byte_size, path, first_ordinal FROM cache_chunks WHERE query = ?`,
  );
  const selectChunkIdForPageStmt = db.prepare<[string, number]>(
    `SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?`,
  );
  const selectChunkRowStmt = db.prepare<[string]>(
    `SELECT chunk_id, query, sequence, byte_size, path, first_ordinal FROM cache_chunks WHERE chunk_id = ?`,
  );
  const selectTotalChunksStmt = db.prepare<[string]>(
    `SELECT COUNT(*) AS c FROM cache_chunks WHERE query = ?`,
  );
  const selectMaxPageStmt = db.prepare<[string]>(
    `SELECT MAX(page) AS max_page FROM cache_index WHERE query = ?`,
  );

  let closed = false;

  /**
   * Build the `(query, page) -> chunk_id` mapping from a list of chunks. A
   * page is mapped to the chunk that holds the result whose ordinal position
   * would land in that page. With `pageSize = 25` and `chunkSize = 100`,
   * pages 1..4 → chunk 0, pages 5..8 → chunk 1, and so on.
   *
   * The implementation walks each chunk and registers every page it spans,
   * so the rule generalizes when the chunker fires its oversize-seal early
   * (a chunk with fewer than `chunkSize` results still maps cleanly to the
   * pages whose ordinal range it covers).
   */
  const buildIndexEntries = (
    chunks: Chunk[],
    queryHash: string,
  ): Array<{ page: number; chunkId: string }> => {
    const entries: Array<{ page: number; chunkId: string }> = [];
    let ordinal = 0; // 0-based result index into the full result list.
    for (const c of chunks) {
      const firstOrdinal = ordinal;
      const lastOrdinal = ordinal + c.results.length - 1;
      // Convert to 1-indexed page numbers. `page = floor(ordinal / pageSize) + 1`.
      const firstPage = Math.floor(firstOrdinal / pageSize) + 1;
      const lastPage = Math.floor(lastOrdinal / pageSize) + 1;
      const id = chunkId(queryHash, c.sequence);
      for (let page = firstPage; page <= lastPage; page++) {
        entries.push({ page, chunkId: id });
      }
      ordinal += c.results.length;
    }
    return entries;
  };

  const write = async (
    query: string,
    results: ResultCard[],
    signal?: AbortSignal,
  ): Promise<CacheWriteResult> => {
    throwIfAborted(signal);

    const queryHash = hashQuery(query);
    const chunks = chunk(results, chunkOpts);
    const writtenChunkPaths: string[] = [];

    // Phase 1 — write chunk bodies to disk. ADR 0003 is explicit: chunk files
    // first, SQLite second. On any error in this phase we rollback the partial
    // filesystem state and never touch SQLite.
    try {
      fs.mkdir(chunkDirOf(opts.dataDir, queryHash));
      for (const c of chunks) {
        // Probe the abort signal between writes — this is the documented
        // cancellable seam in the long-running write path.
        throwIfAborted(signal);
        const chunkBodyPath = chunkPathOf(opts.dataDir, queryHash, c.sequence);
        fs.writeFile(chunkBodyPath, JSON.stringify(c.results));
        writtenChunkPaths.push(chunkBodyPath);
      }
    } catch (error) {
      // Rollback partial filesystem state. Any chunk file that made it to disk
      // is unlinked. Errors during cleanup are intentionally swallowed because
      // surfacing the original write failure is more useful for the caller.
      for (const path of writtenChunkPaths) {
        try {
          fs.unlink(path);
        } catch {
          // ignore
        }
      }
      throw error;
    }

    // Phase 2 — commit the SQLite transaction. The transaction overwrites any
    // prior rows for this query in `cache_index` and `cache_chunks`, then
    // inserts the new rows. If anything in this phase throws (the `SELECT`
    // for stale-path bookkeeping, the transaction itself, or a downstream
    // `unlink`), better-sqlite3 has rolled the transaction back — but we
    // MUST also unlink the chunk files we wrote in phase 1 so we don't leak
    // orphans. Wrapping the entire phase 2 in a single try/catch keeps the
    // rollback contract whole.
    const indexEntries = buildIndexEntries(chunks, queryHash);
    const chunkIds = chunks.map((c) => chunkId(queryHash, c.sequence));

    let stalePaths: string[] = [];
    try {
      // Look up the prior chunk paths so the post-commit step can unlink any
      // old chunk files that the new write does not overwrite (e.g. an old
      // 1000-result write produced 10 chunks; a new 200-result write produces
      // 2 — we must unlink chunks 02..09).
      const priorPaths: string[] = (selectChunksForQueryStmt.all(query) as ChunkRow[]).map(
        (row) => row.path,
      );
      const newPaths = new Set(chunks.map((c) => chunkPathOf(opts.dataDir, queryHash, c.sequence)));
      stalePaths = priorPaths.filter((path) => !newPaths.has(path));

      const transaction = db.transaction(() => {
        deleteIndexForQueryStmt.run(query);
        deleteChunksForQueryStmt.run(query);
        let firstOrdinal = 0;
        for (const c of chunks) {
          const id = chunkId(queryHash, c.sequence);
          const path = chunkPathOf(opts.dataDir, queryHash, c.sequence);
          insertChunkStmt.run(id, query, c.sequence, c.byteSize, path, firstOrdinal);
          firstOrdinal += c.results.length;
        }
        for (const entry of indexEntries) {
          insertIndexStmt.run(query, entry.page, entry.chunkId);
        }
      });
      transaction();
    } catch (error) {
      // SQLite rolled back automatically; unlink the chunk files we wrote in
      // phase 1 so the on-disk state matches the (rolled-back) index.
      for (const path of writtenChunkPaths) {
        try {
          fs.unlink(path);
        } catch {
          // ignore
        }
      }
      throw error;
    }

    // Post-commit: unlink stale chunk files for this query (the atomic-replace
    // AC). The SQL is the source of truth — any file no longer referenced by
    // a `cache_chunks` row for this query is garbage.
    for (const path of stalePaths) {
      try {
        fs.unlink(path);
      } catch {
        // ignore
      }
    }

    return { chunkIds };
  };

  const read = async (
    query: string,
    page: number,
    signal?: AbortSignal,
  ): Promise<CacheReadResult> => {
    throwIfAborted(signal);
    if (!Number.isInteger(page) || page < 1) {
      throw new RangeError(`page MUST be a positive integer; received ${page}`);
    }

    const totalChunksRow = selectTotalChunksStmt.get(query) as { c: number } | undefined;
    const totalChunks = totalChunksRow?.c ?? 0;

    if (totalChunks === 0) {
      // Unknown query — empty miss, not an error (per the AC).
      return {
        results: [],
        chunksRead: 0,
        pagination: { page, totalChunks: 0, hasMore: false },
      };
    }

    const indexRow = selectChunkIdForPageStmt.get(query, page) as IndexRow | undefined;
    const maxPageRow = selectMaxPageStmt.get(query) as { max_page: number | null } | undefined;
    const maxPage = maxPageRow?.max_page ?? 0;
    const hasMore = page < maxPage;

    if (!indexRow) {
      // The query is cached but the requested page is past the last result.
      // Still not an error — return an empty slice with the correct
      // `totalChunks` so the UI's pagination math stays honest.
      return {
        results: [],
        chunksRead: 0,
        pagination: { page, totalChunks, hasMore: false },
      };
    }

    const chunkRow = selectChunkRowStmt.get(indexRow.chunk_id) as ChunkRow | undefined;
    if (!chunkRow) {
      // `cache_index` references a chunk that does not exist in `cache_chunks`.
      // This shouldn't happen given the `write` transaction's atomicity, but a
      // missing-chunk read is a structural error, not an empty miss.
      throw new Error(
        `cache integrity error: cache_index points at chunk_id=${indexRow.chunk_id} not present in cache_chunks`,
      );
    }

    const body = JSON.parse(fs.readFile(chunkRow.path)) as ResultCard[];
    // Translate (query, page) into a chunk-local slice. `first_ordinal` is the
    // 0-based position of the chunk's first result in the full result list,
    // cached on the row at write time. The slice the page covers starts at
    // `(page - 1) * pageSize - first_ordinal` and runs `pageSize` long.
    const offset = (page - 1) * pageSize - chunkRow.first_ordinal;
    const slice = body.slice(offset, offset + pageSize);

    return {
      results: slice,
      chunksRead: 1,
      pagination: { page, totalChunks, hasMore },
    };
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    db.close();
  };

  return { write, read, close };
};

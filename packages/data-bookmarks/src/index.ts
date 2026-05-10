/**
 * `@neo-search/data-bookmarks` — persistent bookmark store (FR-015, STORY-007).
 *
 * Public surface (per `.design/components/data-layer.md`):
 *   - `BookmarkStore` — `save`, `list`, `get`, `close`.
 *   - `createBookmarkStore({ dataDir, clock, idGenerator })` — opens (or
 *     creates) the SQLite database at `<dataDir>/bookmarks.sqlite`, applies
 *     the migration in `migrations/001-initial.sql`, and returns the store.
 *
 * Layering: this package MUST be imported only by the `data-store` tool
 * (`packages/tools-data-store`). The agent, API, and UI MUST NOT import it
 * directly — see `.design/components/data-layer.md` ("Layering") and FR-024.
 *
 * Design refs:
 *   - `.design/components/data-layer.md` — interface, schema, layering rules.
 *   - `.design/foundation/conventions.md` — clock injection, AbortSignal
 *     posture, error handling, file-size limits.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database, { type Database as DatabaseType } from 'better-sqlite3';

import type {
  BookmarkEntryContract,
  BookmarkSaveContract,
  PaginationContract,
} from '@neo-search/contracts';

/** Public re-exports of the contract types — package consumers should import these names. */
export type BookmarkEntry = BookmarkEntryContract;
export type BookmarkSave = BookmarkSaveContract;
export type Pagination = PaginationContract;

/**
 * `pageSize = 25` per STORY-007 acceptance criterion. Lifted to a const so the
 * test suite and any future caller share a single source.
 */
export const BOOKMARK_PAGE_SIZE = 25;

/**
 * Injected clock. Per `.design/foundation/conventions.md`, time MUST be
 * injected (not read from `Date.now()` inside business logic) so tests can
 * advance it deterministically — required by the I-13 "no auto-purge over
 * 365d" assertion.
 */
export interface Clock {
  now(): Date;
}

/**
 * Injected id generator. STORY-002 specifies that bookmark ids are
 * server-assigned (the `BookmarkSaveContract` carries no `id`); this delegate
 * lets tests pin ids deterministically and lets the `data-store` tool reuse a
 * process-wide generator.
 */
export interface IdGenerator {
  next(): string;
}

/**
 * Constructor options for `createBookmarkStore`.
 *
 * `dataDir` is the directory holding `bookmarks.sqlite`. It MUST exist OR be
 * creatable (the implementation `mkdir`s it on open). Per
 * `.design/components/data-layer.md`, the default top-level data dir is
 * `./.neo-search-data/` — but this package does not assume that default;
 * callers (the `data-store` tool, STORY-010) are responsible for resolving it.
 */
export interface CreateBookmarkStoreOptions {
  dataDir: string;
  /** Optional clock; defaults to `Date`-backed wall clock. */
  clock?: Clock;
  /** Optional id generator; defaults to a `randomUUID`-backed `bm-<uuid>`. */
  idGenerator?: IdGenerator;
}

/**
 * Persistent bookmark store. All async methods accept an optional `AbortSignal`
 * and MUST early-return when the signal is already aborted — see
 * `foundation/conventions.md` "Async posture".
 */
export interface BookmarkStore {
  /**
   * Persist a new bookmark. Returns the assigned `id`. Rejects with the
   * signal's `reason` (or an `AbortError` if no reason was given) when the
   * signal is already aborted, BEFORE any SQLite I/O occurs.
   */
  save(entry: BookmarkSave, signal?: AbortSignal): Promise<{ id: string }>;
  /**
   * List bookmarks by `ts DESC`, paginated at `BOOKMARK_PAGE_SIZE`.
   * `page` is 1-indexed. Out-of-range pages return an empty `entries` array
   * and a pagination block whose `totalChunks` reflects the true page count.
   */
  list(
    page: number,
    signal?: AbortSignal,
  ): Promise<{ entries: BookmarkEntry[]; pagination: Pagination }>;
  /**
   * Primary-key lookup. Returns `null` for an unknown id — does NOT throw,
   * per `foundation/conventions.md` ("Error handling": at-boundary errors
   * MUST be structured; an absence is not an error).
   */
  get(id: string, signal?: AbortSignal): Promise<BookmarkEntry | null>;
  /** Closes the underlying SQLite handle. Idempotent. */
  close(): void;
}

const DEFAULT_CLOCK: Clock = {
  now: () => new Date(),
};

const DEFAULT_ID_GENERATOR: IdGenerator = {
  // Prefix so a bookmark id is recognizable in logs and so collisions across
  // store types (history vs bookmark) are structurally impossible.
  next: () => `bm-${randomUUID()}`,
};

type Db = DatabaseType;

/**
 * Resolve the migration SQL bundled with this package. Using `import.meta.url`
 * keeps the lookup independent of the working directory — tests run from the
 * repo root but resolve the file relative to `src/index.ts`.
 */
const readMigration = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // `src/index.ts` → `../migrations/001-initial.sql`.
  const sqlPath = join(here, '..', 'migrations', '001-initial.sql');
  return readFileSync(sqlPath, 'utf8');
};

/**
 * Reject early if the signal is already aborted. Throws BEFORE the caller does
 * any SQLite I/O — this is what STORY-007's "pre-aborted signal" AC asserts.
 */
const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Aborted', 'AbortError');
};

/**
 * Internal row shape — matches the `bookmarks` table 1:1. `payload` is stored
 * as a JSON-encoded string (TEXT column) and parsed back on read.
 */
interface BookmarkRow {
  id: string;
  kind: 'result' | 'answer';
  payload: string;
  ts: string;
}

const rowToEntry = (row: BookmarkRow): BookmarkEntry => ({
  id: row.id,
  kind: row.kind,
  payload: JSON.parse(row.payload) as unknown,
  ts: row.ts,
});

/**
 * Opens the bookmark store, applying the initial migration if needed.
 *
 * The migration is idempotent (`CREATE TABLE IF NOT EXISTS`), so reopening an
 * existing database is safe — this is what makes the FR-015 "survives process
 * restart" test work.
 */
export const createBookmarkStore = (opts: CreateBookmarkStoreOptions): BookmarkStore => {
  const clock = opts.clock ?? DEFAULT_CLOCK;
  const idGen = opts.idGenerator ?? DEFAULT_ID_GENERATOR;

  mkdirSync(opts.dataDir, { recursive: true });
  const dbPath = join(opts.dataDir, 'bookmarks.sqlite');
  const db: Db = new Database(dbPath);

  // WAL is the standard `better-sqlite3` setting for a long-lived process; it
  // also keeps reopen-after-close fast for the restart round-trip test.
  db.pragma('journal_mode = WAL');

  db.exec(readMigration());

  const insertStmt = db.prepare<[string, string, string, string]>(
    `INSERT INTO bookmarks (id, kind, payload, ts) VALUES (?, ?, ?, ?)`,
  );
  const getStmt = db.prepare<[string]>(`SELECT id, kind, payload, ts FROM bookmarks WHERE id = ?`);
  const listStmt = db.prepare<[number, number]>(
    `SELECT id, kind, payload, ts FROM bookmarks ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`,
  );
  const countStmt = db.prepare(`SELECT COUNT(*) AS c FROM bookmarks`);

  let closed = false;

  return {
    async save(entry, signal) {
      throwIfAborted(signal);
      const id = idGen.next();
      const ts = clock.now().toISOString();
      // `payload` is `unknown` per the BookmarkSave contract; we stringify it
      // as JSON. Non-JSON-serializable inputs (functions, BigInt) would throw
      // here — that is the right boundary failure mode (the data-store tool,
      // STORY-010, validates against the contract before this is reached).
      const payloadJson = JSON.stringify(entry.payload);
      insertStmt.run(id, entry.kind, payloadJson, ts);
      return { id };
    },

    async list(page, signal) {
      throwIfAborted(signal);
      const safePage = Math.max(1, Math.trunc(page));
      const offset = (safePage - 1) * BOOKMARK_PAGE_SIZE;
      const rows = listStmt.all(BOOKMARK_PAGE_SIZE, offset) as BookmarkRow[];
      const entries = rows.map(rowToEntry);
      const totalRow = countStmt.get() as { c: number } | undefined;
      const total = totalRow?.c ?? 0;
      // `totalChunks` per `PaginationContract` is the total chunk count for
      // the underlying query. For an unchunked listing (FR-014/FR-015 stores),
      // we surface the total *page* count, which is what the UI consumes for
      // the "more pages?" affordance (FR-006).
      const totalChunks = Math.max(0, Math.ceil(total / BOOKMARK_PAGE_SIZE));
      const hasMore = safePage * BOOKMARK_PAGE_SIZE < total;
      return {
        entries,
        pagination: {
          page: safePage,
          totalChunks,
          hasMore,
        },
      };
    },

    async get(id, signal) {
      throwIfAborted(signal);
      const row = getStmt.get(id) as BookmarkRow | undefined;
      if (!row) return null;
      return rowToEntry(row);
    },

    close() {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
};

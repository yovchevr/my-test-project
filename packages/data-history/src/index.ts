/**
 * `@neo-search/data-history` — the persistent history store (FR-014, STORY-006).
 *
 * This package owns the SQLite-backed `HistoryStore` interface defined in
 * `.design/components/data-layer.md`. The store records every search request
 * the agent runs (LIVE/HISTORY/BOOKMARK) so the UI's HISTORY filter can list
 * prior queries (FR-003 → FR-014). Persistence is a single SQLite file under
 * `<dataDir>/history.sqlite`; the table is created from the migration file
 * `migrations/001-initial.sql` on first open.
 *
 * Design constraints honored here:
 *   - I-12: entries survive process restart (no in-memory state).
 *   - I-13: no auto-purge — the store keeps every entry forever by default.
 *   - I-14, NFR-006: schema carries no `user_id`, `tenant_id`, or session
 *     column. The list of columns is enumerated by the migration and
 *     asserted by the schema-introspection test in this package.
 *   - I-15: no auth gate; every legal call returns its result.
 *   - I-32 / `.design/foundation/conventions.md`: time and randomness are
 *     injected via the factory's `clock` and `idGenerator` parameters so the
 *     store is deterministic in tests.
 *   - Cancellation: every method accepts an `AbortSignal` and returns early
 *     without touching SQLite if the signal is already aborted at entry.
 *
 * The wire-shape contract for the agent ↔ data boundary lives in
 * `@neo-search/contracts` (`DataStoreInputContract` / `DataStoreOutputContract`).
 * STORY-010 wraps this in-process interface behind that tool — this package
 * intentionally does not import the wire contract; only the record types.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Database, { type Database as DatabaseHandle } from 'better-sqlite3';
import type { HistoryEntryContract, PaginationContract } from '@neo-search/contracts';

/**
 * Page size for `list`. The acceptance criterion in STORY-006 pins this at
 * 25 — matching the UI's typical results-per-page (FR-006). Callers that
 * want a different page size MUST not change this constant; a new requirement
 * to vary it would be a contract change.
 */
export const HISTORY_PAGE_SIZE = 25;

/**
 * The full record returned to callers — re-exported from `@neo-search/contracts`
 * so consumers can `import { HistoryEntry } from '@neo-search/data-history'`
 * without dragging the contracts package transitively. Per I-34 the type is
 * defined exactly once (in `@neo-search/contracts/data.ts`); this is a re-export,
 * not a redefinition.
 */
export type HistoryEntry = HistoryEntryContract;

/**
 * The input shape for `append`. The store stamps `id` (via `idGenerator`)
 * and `ts` (via `clock`) on insert per STORY-006's "id is a generated UUID"
 * and "append MUST use an injected clock" acceptance criteria, so callers
 * MUST NOT supply those fields.
 */
export type HistoryEntryAppendInput = Omit<HistoryEntryContract, 'id' | 'ts'>;

export type Pagination = PaginationContract;

/**
 * The in-process interface the `data-store` tool (STORY-010) wraps. This is
 * the verbatim shape pinned in `.design/components/data-layer.md`, with the
 * documented `AbortSignal` parameter made explicit (the design doc omitted
 * it "for brevity").
 */
export interface HistoryStore {
  /**
   * Inserts an entry, stamping a fresh `id` (via the factory's `idGenerator`)
   * and `ts` (via the factory's `clock`). Returns the generated id.
   *
   * Failure modes:
   *   - If `signal` is already aborted on entry, returns a rejected promise
   *     with the signal's reason without touching SQLite.
   *   - If the underlying SQLite write fails, the original error is thrown.
   */
  append(entry: HistoryEntryAppendInput, signal?: AbortSignal): Promise<{ id: string }>;

  /**
   * Returns up to `HISTORY_PAGE_SIZE` entries for the given (1-indexed) page,
   * ordered by `ts` descending so the most-recent search is first. Pagination
   * uses the shared `PaginationContract` shape — `totalChunks` is overloaded
   * here to mean the total entry count (per STORY-006's acceptance criterion).
   */
  list(
    page: number,
    signal?: AbortSignal,
  ): Promise<{ entries: HistoryEntry[]; pagination: Pagination }>;

  /**
   * Closes the SQLite handle. Tests use this to assert restart-survival — a
   * caller in production typically holds a single store for the process
   * lifetime and never closes it.
   */
  close(): void;
}

/**
 * Factory dependencies. `clock` and `idGenerator` are injectable so the
 * store is deterministic under test (`.design/foundation/conventions.md`).
 */
export interface CreateHistoryStoreOptions {
  /** Directory that will contain `history.sqlite`. Created if missing. */
  dataDir: string;
  /** Returns the timestamp the next `append` records. Defaults to wall-clock. */
  clock?: () => Date;
  /** Returns the id the next `append` writes. Defaults to UUID v4. */
  idGenerator?: () => string;
}

/**
 * Resolves the migrations directory relative to this module so it works under
 * both `tsx`/`vitest` (source layout) and a future built-package layout.
 */
const migrationsDir = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  // From `packages/data-history/src/`, migrations live at `../migrations/`.
  return resolve(here, '..', 'migrations');
};

const readMigration = (file: string): string => {
  return readFileSync(join(migrationsDir(), file), 'utf8');
};

const applyMigrations = (db: DatabaseHandle): void => {
  // The migration file is idempotent (CREATE TABLE IF NOT EXISTS) so a second
  // open on the same `dataDir` is a no-op. STORY-006's restart-survival test
  // exercises this path.
  db.exec(readMigration('001-initial.sql'));
};

interface HistoryRow {
  id: string;
  query: string;
  source_filter: 'LIVE' | 'HISTORY' | 'BOOKMARK';
  ts: string;
  result_chunk_ids: string;
}

const rowToEntry = (row: HistoryRow): HistoryEntry => ({
  id: row.id,
  query: row.query,
  sourceFilter: row.source_filter,
  ts: row.ts,
  // The column stores a JSON-encoded array. We decode here so callers get a
  // structured shape and never see SQLite-side encoding details. If the JSON
  // is malformed (corruption only — every write goes through `JSON.stringify`
  // below) we surface the parse error rather than silently returning `[]`.
  resultChunkIds: JSON.parse(row.result_chunk_ids) as string[],
});

const ensureNotAborted = (signal: AbortSignal | undefined): void => {
  // Mirrors `AbortSignal.throwIfAborted()` but works on Node 22.0+ and avoids
  // tying the package to a specific minor. Pre-aborted signals MUST cause an
  // early return without touching SQLite per STORY-006's acceptance criterion.
  if (signal?.aborted) {
    const reason = signal.reason as unknown;
    throw reason instanceof Error
      ? reason
      : new DOMException('The operation was aborted.', 'AbortError');
  }
};

/**
 * Creates a `HistoryStore` backed by a SQLite file under `dataDir`. The file
 * is opened (or created) on call; the migration in `migrations/001-initial.sql`
 * is applied unconditionally and is idempotent.
 */
export const createHistoryStore = (options: CreateHistoryStoreOptions): HistoryStore => {
  const clock = options.clock ?? ((): Date => new Date());
  const idGenerator = options.idGenerator ?? ((): string => randomUUID());

  // Materialize the data dir before SQLite tries to open the file — better-sqlite3
  // will throw `SQLITE_CANTOPEN` if a parent directory is missing. The migration
  // policy is "the store creates what it needs to function".
  mkdirSync(options.dataDir, { recursive: true });
  const dbPath = join(options.dataDir, 'history.sqlite');
  const db = new Database(dbPath);
  // WAL gives us crash-safe writes without losing read concurrency. Single-user
  // prototype scope means we don't need any further tuning.
  db.pragma('journal_mode = WAL');
  applyMigrations(db);

  const insertStmt = db.prepare<[string, string, string, string, string]>(
    'INSERT INTO history (id, query, source_filter, ts, result_chunk_ids) VALUES (?, ?, ?, ?, ?)',
  );
  const listStmt = db.prepare<[number, number]>(
    'SELECT id, query, source_filter, ts, result_chunk_ids FROM history ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?',
  );
  const countStmt = db.prepare('SELECT COUNT(*) AS count FROM history');

  const append = async (
    entry: HistoryEntryAppendInput,
    signal?: AbortSignal,
  ): Promise<{ id: string }> => {
    ensureNotAborted(signal);
    const id = idGenerator();
    const ts = clock().toISOString();
    insertStmt.run(id, entry.query, entry.sourceFilter, ts, JSON.stringify(entry.resultChunkIds));
    return { id };
  };

  const list = async (
    page: number,
    signal?: AbortSignal,
  ): Promise<{ entries: HistoryEntry[]; pagination: Pagination }> => {
    ensureNotAborted(signal);
    if (!Number.isInteger(page) || page < 1) {
      // Validation at the layer boundary per `.design/foundation/conventions.md`.
      // The data-store tool (STORY-010) revalidates with TypeBox on the wire; this
      // guard is a defensive in-process check so direct callers fail fast.
      throw new RangeError(`page MUST be a positive integer; received ${page}`);
    }
    const offset = (page - 1) * HISTORY_PAGE_SIZE;
    const rows = listStmt.all(HISTORY_PAGE_SIZE, offset) as HistoryRow[];
    const { count } = countStmt.get() as { count: number };
    return {
      entries: rows.map(rowToEntry),
      pagination: {
        page,
        totalChunks: count,
        hasMore: count > page * HISTORY_PAGE_SIZE,
      },
    };
  };

  const close = (): void => {
    db.close();
  };

  return { append, list, close };
};

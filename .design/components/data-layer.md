---
title: Data layer
read_when: implementing or modifying the history store, bookmark store, search cache, chunking, or indexing
boundary: core
requirements: [FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-024, NFR-003, NFR-004, NFR-006]
---

# Data layer

The persistent stores plus the chunking and indexing strategy. Lives in `packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`. Built on `better-sqlite3` (for indices and metadata) plus on-disk segmented JSON (for chunk bodies) per `technology/tech-stack.md`.

## Responsibilities

The data layer is three stores plus one shared chunking/indexing primitive:

1. **History store** (FR-014) — persists every search request along with its results (or a reference into the cache).
2. **Bookmark store** (FR-015) — persists user-saved items, retrievable by id or natural key.
3. **Indexed search cache** (FR-016) — persists fetched web results in chunked form so reads return only the chunks they need (FR-017, FR-018, NFR-003, NFR-004).
4. **Chunker + index** — the shared primitive used by the cache (and reusable by history if a history entry's results grow large). The chunking strategy and the indexing strategy are documented here per FR-019 and FR-020 and pinned in `decisions/0003-chunking-strategy.md`.

## What this component MUST NOT do

- It MUST NOT be called by the agent directly. The only legal entry point is the `data-store` tool (I-18, FR-022, FR-024).
- It MUST NOT carry user-id columns, per-user namespaces, session keys, or auth gating (I-14, I-15).
- It MUST NOT auto-purge entries (I-13).
- It MUST NOT store a query's full result set as a single monolithic blob (constraints.md, FR-017, I-9).
- It MUST NOT scan all chunks to satisfy a single-page or single-id read (FR-018, NFR-004, I-10, I-11).
- It MUST NOT rely on in-memory state for persistence — every store MUST survive a process restart (I-12).

## Public contract

The data layer is consumed by the `data-store` tool. The data-layer packages publish in-process interfaces; the wire-shape contract is the `data-store` tool's input/output union (`components/data-store-tool.md`).

```ts
// packages/data-history/src/index.ts
export interface HistoryStore {
  append(entry: HistoryEntry): Promise<{ id: string }>;
  list(page: number): Promise<{ entries: HistoryEntry[]; pagination: Pagination }>;
}

// packages/data-bookmarks/src/index.ts
export interface BookmarkStore {
  save(entry: BookmarkSave): Promise<{ id: string }>;
  list(page: number): Promise<{ entries: BookmarkEntry[]; pagination: Pagination }>;
  get(id: string): Promise<BookmarkEntry | null>;
}

// packages/data-cache/src/index.ts
export interface SearchCache {
  write(query: string, results: ResultCard[]): Promise<{ chunkIds: string[] }>;
  read(query: string, page: number): Promise<{ results: ResultCard[]; chunksRead: number; pagination: Pagination }>;
}
```

The `chunksRead` metric on `SearchCache.read` is intentional — it is the per-call observable that the NFR-004 test asserts (I-10).

The record types (`HistoryEntry`, `BookmarkEntry`, `ResultCard`, `Pagination`) MUST live in `@neo-search/contracts/data.ts` and MUST NOT be redefined per package (I-34).

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | Each store accepts records validated by the data-store tool before reaching the store. |
| Outputs | Each store returns typed records from `@neo-search/contracts/data.ts`. |
| Idempotency | `append`/`save`/`write` are idempotent within a 5s window via the API's `clientRequestId` (deduplication is upstream). Repeated `cache.write(query, ...)` overwrites the chunks for that query atomically (single SQLite transaction). |
| Versioning | The interface signatures version with the package; record shapes version with `@neo-search/contracts`. Storage-format changes (SQLite schema, on-disk JSON layout) require a migration script and an ADR if the change is not backward-compatible. |
| Cancellation | Each method accepts an `AbortSignal` (omitted from the illustrative TS for brevity). The implementation MUST honor it during long reads. |

## Storage substrate

The chosen substrate is **SQLite for the index + on-disk segmented JSON for chunk bodies**. Rationale:

- SQLite gives us indices and atomic transactions without a daemon — appropriate for OQ-002's local prototype scope.
- Segmented JSON for chunk bodies keeps the chunks human-inspectable (debuggable demos), keeps SQLite small (so the index stays fast), and matches the initiative's "store as segmented JSON or indexed structure" wording (FR-017).

| Concern | Where it lives |
| --- | --- |
| History entries | SQLite table `history(id PK, query, source_filter, ts, result_chunk_ids JSON)`. |
| Bookmark entries | SQLite table `bookmarks(id PK, kind, payload JSON, ts)`. |
| Search cache index | SQLite table `cache_index(query, page, chunk_id, FOREIGN KEY (chunk_id))` plus `cache_chunks(chunk_id PK, query, sequence INT, byte_size INT, path)`. |
| Chunk bodies | On-disk under `<data-dir>/chunks/<query-hash>/<sequence>.json`. |

The `<data-dir>` defaults to `./.neo-search-data/` in the working directory and MUST be configurable via the `NEO_SEARCH_DATA_DIR` env var.

## Chunking strategy (FR-019)

- **Chunk size policy**: a fixed **100 results per chunk**.
- **Chunk boundary criterion**: ordinal position in the parsed result list. Results 1–100 → chunk 0, results 101–200 → chunk 1, and so on. Boundaries are deterministic and reproducible from the input list.
- **Why 100**: it balances on-disk file count (1000 results → 10 files, manageable) against per-page cost (a typical UI page of 25 results spans at most 1 chunk, so a page read touches 1 chunk out of 10 — comfortably satisfies NFR-004's "strictly fewer than total" bound). Larger chunks would weaken NFR-004; smaller chunks would inflate file count and SQLite index size.
- **Override conditions**: if a result's parsed `Result` record exceeds 64 KB on its own (e.g. an unusually long snippet), the chunk it belongs to MAY be sealed early to keep individual files reasonable. This MUST NOT change the ordinal boundary policy — it is a safety valve, not a routing rule.
- See `decisions/0003-chunking-strategy.md` for the rationale, alternatives weighed, and override semantics.

## Indexing strategy (FR-020)

- **Index structure**: a SQLite table `cache_index(query TEXT, page INT, chunk_id TEXT, PRIMARY KEY (query, page))` plus a derived `cache_chunks(chunk_id PK, query, sequence INT)`.
- **Lookup method**: a read for `(query, page)` issues a single SQL `SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?`, which uses the primary-key index. The result is the chunk-id list to load.
- **Why a relational index over a hash map**: SQLite is already in the substrate; adding a separate hash map would duplicate state and break atomicity with `cache_chunks`. The primary-key index gives O(log n) lookups, which is well within budget for the prototype.
- **Cardinality**: for a 1000-result query at 100 results / chunk and a UI page size of 25, the index has 40 rows (10 chunks × 4 pages each) — trivial.
- **Determinism**: the same input result list MUST produce the same `(query, page) → chunk_id` mapping on every run (I-31).
- See `decisions/0003-chunking-strategy.md` for the joint chunking + indexing decision.

## Variation accommodated

- **Storage substrate** — SQLite + JSON today; could be replaced by an embedded DB (DuckDB, RocksDB) without changing the `HistoryStore` / `BookmarkStore` / `SearchCache` interfaces or the `data-store` tool contract. This is principle 3 in action — the contract is the stable core, the substrate is the periphery.
- **Chunk size** — `decisions/0003-chunking-strategy.md` pins the default at 100 but documents the override path. A different number would be a new ADR.

## Variation NOT accommodated

- **Per-user partitioning** — single-user prototype (OQ-005, I-14).
- **Encryption-at-rest** — no security regime (OQ-004).
- **Retention policies** — no retention (OQ-004, I-13).
- **Cross-process / multi-machine replication** — local prototype only (OQ-002).

## Layering

The data-layer packages are imported only by the `data-store` tool (`packages/tools-data-store`). They MUST NOT be imported by the agent, the API, or the UI (I-18, FR-024). CI MUST enforce this via the Nx `enforce-module-boundaries` rule (`technology/testing.md`).

# `@neo-search/data-cache`

The indexed search cache: stores fetched web results in chunks so reads return
only the chunks they need (FR-016, FR-017, FR-018, FR-020, NFR-003, NFR-004).

> Layering: this package is part of the data layer. Per
> `.design/foundation/architecture.md` and ADR 0001, the agent MUST NOT import
> this package directly — the only legal entry point is the `data-store` tool.

## Public surface

STORY-004 shipped the deterministic chunker primitive. STORY-005 adds the
SQLite-backed `SearchCache` that consumes it.

```ts
import {
  chunk,
  DEFAULT_MAX_CHUNK_SIZE,
  DEFAULT_OVERSIZE_BYTE_LIMIT,
  createSearchCache,
  DEFAULT_PAGE_SIZE,
  type SearchCache,
} from '@neo-search/data-cache';
```

| Export                        | Kind     | Notes                                                                                     |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `chunk(results, opts?)`       | function | Pure, deterministic. Partitions an ordered `ResultCardContract[]` into ordered `Chunk[]`. |
| `Chunk`                       | type     | `{ sequence: number; results: ResultCardContract[]; byteSize: number }`.                  |
| `ChunkOptions`                | type     | `{ maxChunkSize?: number; oversizeByteLimit?: number }`.                                  |
| `DEFAULT_MAX_CHUNK_SIZE`      | constant | Pinned at `100` per ADR 0003.                                                             |
| `DEFAULT_OVERSIZE_BYTE_LIMIT` | constant | Pinned at `64 * 1024` per ADR 0003.                                                       |
| `createSearchCache(opts)`     | function | Opens (or creates) the SQLite-backed cache under `opts.dataDir`.                          |
| `SearchCache`                 | type     | `{ write, read, close }` — the in-process interface STORY-010 wraps.                      |
| `DEFAULT_PAGE_SIZE`           | constant | Pinned at `25` per ADR 0003 (1 chunk per page read).                                      |

## Chunking strategy (FR-019)

The chunking strategy is pinned in ADR 0003
([`.design/decisions/0003-chunking-strategy.md`](../../.design/decisions/0003-chunking-strategy.md))
and re-stated here so any reader of this package can verify the strategy from
the chunks on disk.

- **Chunk size policy**: a fixed **100 results per chunk** (the default
  `maxChunkSize`). Larger chunks would weaken NFR-004's "strictly fewer than
  total" bound; smaller chunks would inflate the on-disk file count for a
  10000-result query.
- **Boundary criterion**: ordinal position in the parsed result list.
  Results 1..100 land in `sequence: 0`, 101..200 in `sequence: 1`, and so on.
  Boundaries are deterministic and reproducible from the input list alone —
  a reviewer can predict any chunk's contents by counting (I-30).
- **Override condition (safety valve)**: if a single result's serialized
  `byteSize` would push the in-flight chunk past **64 KB** AND the chunk
  already holds at least one result, the chunk is sealed early and a new
  chunk starts. A brand-new chunk MAY hold a single oversized result. This
  is the only way the size-100 boundary is broken; the **ordinal sequence
  numbering MUST stay contiguous** even when a seal fires — the override is
  about file size, not about routing.
- **Determinism (I-30, I-32)**: the chunker is a pure function — no clock
  reads, no `Math.random`, no global state. Same input → byte-identical
  output on every run. This is what makes FR-019's "documented strategy"
  verifiable from the chunks on disk: a reviewer can re-run the chunker on
  the same input and get the same chunks.

The 1000-result deterministic fixture used by this package's tests (and by
STORY-008's NFR-003 stress suite) lives at
`packages/test-fixtures/src/large-result-set.json`. The seeded generator that
produced it is `generateResults` from `@neo-search/test-fixtures`; the same
`(count, seed)` always yields byte-identical output.

## Indexing strategy (FR-020)

The cache uses a two-table SQLite schema (`migrations/001-initial.sql`):

| Table          | Columns                                                        | Role                                                                                                  |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `cache_chunks` | `chunk_id PK, query, sequence, byte_size, path, first_ordinal` | One row per on-disk chunk body. Records the chunk's `path` and the 0-based `first_ordinal` it covers. |
| `cache_index`  | `query, page, chunk_id, PRIMARY KEY (query, page)`             | One row per `(query, page)`. Maps a UI page to the chunk that holds it.                               |

The composite primary key on `cache_index` is the FR-020 index — SQLite serves
primary-key lookups via a b-tree without a full table scan.

### Lookup method (the FR-020 contract)

A read for `(query, page)` issues exactly one PK-served lookup:

```sql
SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?
```

The implementation then:

1. Reads the `cache_chunks` row for the returned `chunk_id` (a second
   PK-served lookup) to recover the chunk's on-disk `path` and
   `first_ordinal`.
2. Reads exactly that one chunk-body file from disk.
3. Slices the chunk body at `(page - 1) * pageSize - first_ordinal`, length
   `pageSize`, to return the page's results.

`SearchCache.read` reports the number of chunk-body files actually opened in
its `chunksRead` field — this is the per-call observable that NFR-004's
"strictly fewer than total" assertion measures (I-10). For a 1000-result
query (10 chunks, default `pageSize = 25`), every page read MUST report
`chunksRead === 1`; the contract enforced is `chunksRead < totalChunks` for
any query with `totalChunks > 1`.

### Why a relational index over a hash map

SQLite is already in the substrate (`technology/tech-stack.md`) for history
and bookmarks. A separate hash map would duplicate state and break atomicity
with the chunk-body writes. The primary-key b-tree is O(log n) — a 40-row
index for the NFR-003 floor (1000 results × `pageSize = 25` → 40 pages) is
trivial.

### Atomicity (ADR 0003)

A `write(query, results)` runs in two phases:

1. **Phase 1 — chunk bodies to disk**. Hashes the query (SHA-256 of the
   lowercased trimmed query string), creates `<dataDir>/chunks/<query-hash>/`,
   writes one JSON file per chunk. On any I/O error here, every chunk file
   that did make it to disk is unlinked, and SQLite is never touched.
2. **Phase 2 — SQLite transaction**. Inside a single `db.transaction(...)`,
   deletes the prior `cache_index` and `cache_chunks` rows for this query
   (`DELETE WHERE query = ?`), then inserts the new ones. On any error in
   this phase the transaction rolls back and the chunk files written in
   phase 1 are unlinked too.

A repeated `write` for the same query atomically replaces its chunks (the
"atomic replace" acceptance criterion); stale chunk files (those no longer
referenced by `cache_chunks` after the new write) are unlinked
post-commit.

`<query-hash>` is pinned to SHA-256 of the lowercased trimmed query string
(ADR 0003). Two queries that differ only in case or trailing whitespace MUST
hash to the same directory; changing the hash function would invalidate every
existing on-disk chunk and is a migration-grade change.

## Out of scope (this package)

- No cross-process locking (single-user prototype, OQ-005).
- No retention or eviction (I-13).
- No encryption-at-rest (OQ-004).
- No history or bookmark store concerns — those are `@neo-search/data-history`
  and `@neo-search/data-bookmarks`.
- Orphaned-file repair beyond the per-write rollback is deferred. A
  `verify()` helper that reconciles the on-disk tree with `cache_chunks` MAY
  be added later, but is out of scope for STORY-005.

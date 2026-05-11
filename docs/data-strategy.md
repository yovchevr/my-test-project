# Data Strategy

This document describes the data layer's chunking approach, indexing approach, and storage format.

## Chunking approach

The data layer partitions large result sets into **chunks** so a page-N read fetches only the chunks containing page N, not the entire result set (FR-017, FR-018, NFR-004).

### Chunk size policy

**100 results per chunk** (fixed).

At the NFR-003 floor of 1000 results per query and a typical UI page size of 25 results:

- 1000 results → 10 chunks.
- A page-1 read (results 1–25) touches chunk 0 only.
- A page-5 read (results 101–125) touches chunk 1 only.

A page read touches **1 chunk out of 10**, comfortably satisfying NFR-004's "strictly fewer than total" bound.

### Chunk boundary criterion

**Ordinal position** in the parsed result list.

- Results 1–100 → chunk 0.
- Results 101–200 → chunk 1.
- Results 201–300 → chunk 2.
- And so on.

Boundaries are deterministic and reproducible from the input list. A reviewer can predict where any given result lives by counting.

### Override condition

If a single parsed `Result` record exceeds 64 KB on its own (e.g. an unusually long snippet), the chunk it belongs to may be sealed early. This is a safety valve to keep individual files reasonable, not a routing rule. The ordinal boundary policy does not change.

### Why 100

Balances file count against per-page cost:

| Chunk size | Chunks for 1000 results | Chunks read for page 1 (25 results) | File count for 10k results |
| ---------- | ----------------------- | ----------------------------------- | -------------------------- |
| 10         | 100                     | 3                                   | 1000                       |
| 100        | 10                      | 1                                   | 100                        |
| 500        | 2                       | 1                                   | 20                         |

- **10**: Narrow reads (good for NFR-004), but 1000 files for a 10k-result query is hard to inspect on a developer machine.
- **100**: Narrow reads (1 chunk out of 10), manageable file count (100 files for 10k results).
- **500**: Reads are still narrow (1 of 2), but NFR-004 headroom is slim.

We chose 100 because it keeps both concerns balanced.

## Indexing approach

The data layer uses a **SQLite index** to map `(query, page)` to the list of chunk IDs that satisfy it (FR-020).

### Index structure

Two SQLite tables:

1. **`cache_index(query TEXT, page INT, chunk_id TEXT, PRIMARY KEY (query, page))`** — maps `(query, page)` to the chunk ID that contains the results for that page.

2. **`cache_chunks(chunk_id TEXT PRIMARY KEY, query TEXT, sequence INT, byte_size INT, path TEXT)`** — records the on-disk path for each chunk body.

### Lookup method

A read for `(query, page)` issues a single SQL query:

```sql
SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?
```

The primary-key index serves this in O(log n) time. For a 1000-result query at 100 results/chunk and a UI page size of 25, the index has 40 rows (10 chunks × 4 pages each) — trivial.

The cache implementation then reads the chunk body files named in the result.

### Determinism

The same input result list produces the same `(query, page) → chunk_id` mapping on every run. The chunk ID is derived from:

- The query (SHA-256 hash of the lowercased, trimmed query string).
- The chunk sequence number (0, 1, 2, …).

This makes the chunking and indexing strategies verifiable: feed the system a known 1000-result input, inspect the on-disk chunks and the SQLite index, confirm the boundaries match the spec.

### Why SQLite

SQLite is already in the substrate for history and bookmarks. Using it for the cache index too means:

- One storage daemon (zero, actually — `better-sqlite3` is in-process).
- One transaction model (atomic writes across index + chunk bodies).
- One backup strategy (copy the SQLite file + the chunk directory).

An in-memory hash map serialized to disk would duplicate state and break atomicity. An embedded KV store (RocksDB, LMDB) would add a new dependency for no clear gain.

## Storage format

The data layer uses **SQLite for metadata and indices** plus **on-disk segmented JSON for chunk bodies**.

### Where data lives

| Concern            | Storage                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| History entries    | SQLite table `history(id PK, query, source_filter, ts, result_chunk_ids JSON)`.                                     |
| Bookmark entries   | SQLite table `bookmarks(id PK, kind, payload JSON, ts)`.                                                            |
| Search cache index | SQLite tables `cache_index(query, page, chunk_id)` + `cache_chunks(chunk_id PK, query, sequence, byte_size, path)`. |
| Chunk bodies       | On-disk under `<data-dir>/chunks/<query-hash>/<sequence>.json`.                                                     |

The `<data-dir>` defaults to `./.neo-search-data/` in the working directory and is configurable via the `NEO_SEARCH_DATA_DIR` env var.

### Chunk body format

Each chunk is a JSON file containing an array of `ResultCard` records:

```json
[
  {
    "title": "Blue Bottle Coffee",
    "url": "https://bluebottlecoffee.com",
    "snippet": "Specialty coffee roaster...",
    "domain": "bluebottlecoffee.com"
  },
  ...
]
```

This format:

- Is human-inspectable (useful for debugging and demo defense).
- Keeps individual chunks small (100 results × ~500 bytes/result ≈ 50 KB/chunk).
- Decouples chunk size growth from SQLite page size.

### Why segmented JSON for bodies

The initiative's wording is "store as segmented JSON or indexed structure" (FR-017). We chose segmented JSON for chunk bodies because:

- **Human-inspectable** — a reviewer can `cat .neo-search-data/chunks/<hash>/0.json` and see the first 100 results. This is valuable for prototype evaluation.
- **Small SQLite file** — the index stays fast because the heavy payload (result bodies) lives on disk, not in SQLite blobs.
- **Debuggable** — if a chunk is corrupt or missing, the error is obvious (file not found, parse error). With SQLite blobs, debugging would require SQL queries.

The tradeoff is coordination: cache writes must write chunk files first, then commit the SQLite transaction. On rollback, partial chunk files must be cleaned up. This is more complex than a single-substrate design, but it's what gives us the human-inspectable format the initiative implies.

## Evidence for NFR-003 and NFR-004

STORY-008 (`packages/data-layer/src/large-set.spec.ts`) exercises the chunking and indexing strategies with 1000-, 5000-, and 10000-result fixtures:

- **NFR-003** — the test asserts no crash, peak heap stays under 256 MB, and page reads still satisfy NFR-004 at scale.
- **NFR-004** — the test spies on the chunk-read path and asserts the read count for page N is strictly less than the total chunk count (when total > 1).

For a 1000-result query:

- Total chunks: 10.
- Page-1 read: 1 chunk (1 < 10, passes).
- Page-5 read: 1 chunk (1 < 10, passes).

For a 10000-result query:

- Total chunks: 100.
- Page-1 read: 1 chunk (1 < 100, passes).
- Page-200 read: 1 chunk (1 < 100, passes).

The test runs in CI on every push and is the structural guard for "no full scans."

## Requirements covered

- **FR-016** — Indexed search cache: the data layer implements the search cache with chunking and indexing.
- **FR-017** — Chunked partitioning: result sets are split into 100-result chunks.
- **FR-018** — Targeted chunk retrieval: a page-N read touches only the chunks containing page N.
- **FR-019** — Document chunking strategy: this doc states the size policy (100) and boundary criterion (ordinal).
- **FR-020** — Document indexing strategy: this doc states the index structure (SQLite `cache_index`) and lookup method (primary-key SELECT).
- **NFR-003** — Large result set capacity: STORY-008's `large-set.spec.ts` proves the system handles 1000–10000 results without crash or unbounded heap.
- **NFR-004** — No full-scan retrieval: STORY-008's spy assertion proves a page read touches strictly fewer chunks than the total (when total > 1).

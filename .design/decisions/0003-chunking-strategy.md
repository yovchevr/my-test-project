---
title: Chunking strategy — fixed 100 results per chunk on ordinal boundary, indexed by SQLite
read_when: revisiting the chunk size, the boundary criterion, or the index structure
status: Accepted
date: 2026-05-09
---

# ADR 0003 — Chunking strategy: fixed 100 results per chunk on ordinal boundary, indexed by SQLite

## Status

Accepted (2026-05-09).

## Context

FR-017 requires partitioning a query's result set into chunks; FR-019 requires documenting the chunk size policy and chunk boundary criterion; FR-020 requires documenting the indexing strategy and lookup method; NFR-003 fixes the scale target (1000+ results per query); NFR-004 requires "no full scan" retrieval (a page-N read MUST touch strictly fewer chunks than the total chunk count when total > 1).

These four requirements together pin the design problem: pick a chunk size and an index structure that (a) keep the per-page read narrow, (b) keep the on-disk file count manageable, (c) make the boundaries deterministic and reviewable, and (d) work on a single developer machine (OQ-002) without a daemon.

The variation axes considered:

- **Chunk size policy**: fixed-N records per chunk vs. fixed-byte budget vs. domain-driven (e.g. by domain or by relevance score).
- **Boundary criterion**: ordinal position in the parsed result list vs. content-defined (e.g. hash-bound) vs. relevance-bucketed.
- **Index substrate**: in-memory hash map serialized to disk vs. SQLite vs. an embedded KV store.
- **Bodies**: same store as the index vs. separate (segmented JSON files).

## Decision

**Chunk size**: a fixed **100 results per chunk** as the default boundary policy.

**Boundary criterion**: ordinal position in the parsed result list. Results 1–100 → chunk 0, 101–200 → chunk 1, and so on. Boundaries are deterministic and reproducible from the input list.

**Override condition**: if a single parsed `Result` record exceeds 64 KB on its own, the chunk it lives in MAY be sealed early. This MUST NOT change the ordinal boundary policy — it is a safety valve to keep individual files reasonable, not a routing rule.

**Index substrate**: SQLite (`better-sqlite3`) with a primary key on `(query, page)` mapping to `chunk_id`. A second table `cache_chunks(chunk_id PK, query, sequence INT, byte_size INT, path)` records the on-disk path for each chunk body.

**Bodies**: on-disk segmented JSON files under `<NEO_SEARCH_DATA_DIR>/chunks/<query-hash>/<sequence>.json`. One file per chunk.

**Lookup method**: a read for `(query, page)` issues a single SQL `SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?`, served by the primary-key index. The result is the chunk-id list (typically one chunk for a small UI page); the cache implementation then reads the chunk body files.

### Why these specific picks

- **100 results / chunk**: at the NFR-003 floor of 1000 results per query and a typical UI page size of 25 results, the math works out to 10 chunks per query and a page spanning at most 1 chunk. A page read therefore touches 1 chunk out of 10, which comfortably satisfies NFR-004's "strictly fewer than total" bound (10× headroom). Larger chunks (say, 500) would weaken NFR-004 (a 25-result page would still touch 1 of 2 chunks at scale — the bound holds but the headroom is slim). Smaller chunks (say, 10) would inflate file count for a 10000-result query to 1000 files, which makes the directory listing unpleasant on a developer machine and grows the SQLite index unnecessarily.
- **Ordinal boundaries**: deterministic from the input alone (I-30); a reviewer can predict where any given chunk's results are by counting. Content-defined boundaries (hash-bound) would be unnecessarily clever for the prototype's needs and would make manual debugging harder. Relevance-bucketed boundaries would couple chunking to the synthesis ranking, breaking the boundary between "store" and "interpret".
- **SQLite for the index**: it is already in the substrate (`technology/tech-stack.md`) for history and bookmarks. Using it for the cache index too means one storage daemon (zero, actually — `better-sqlite3` is in-process), one transaction model, one backup strategy. An in-memory hash map serialized to disk would duplicate state and break atomicity with the chunk-body writes.
- **Segmented JSON for bodies**: matches the initiative's "store as segmented JSON or indexed structure" wording (FR-017), keeps individual chunks human-inspectable for debugging and demo defense (an evaluation criterion of FR-025: "Do you understand what you built?"), and decouples chunk size growth from SQLite page size.

## Consequences

**Positive**

- A page-N read for a 1000-result query touches at most 1 chunk file and exactly 1 SQLite index lookup. NFR-004 holds with comfortable headroom.
- The boundary criterion is trivial to test: feed the chunker a 1000-element list, assert chunks 0..9 contain 100 each (FR-017, FR-019). The implementation is verifiable from the chunks on disk.
- The index lookup is O(log n) at worst on a 40-row table for a 1000-result query — well within budget.
- Substrate is the same SQLite that history and bookmarks use, so backup, migration, and testing infrastructure is shared.
- Determinism (I-30, I-31) is by construction: ordinal boundaries + a primary-key index + an injected hash function.

**Negative**

- The 100-results constant is now part of the design and any change to it is an ADR moment (this one, superseded). For the current FR/NFR set there is no concrete second use case that wants a different number — applying principle 8, that is the right place to draw the line.
- Two storage substrates (SQLite + filesystem) means cache writes need to coordinate across both. The data-layer implementation MUST write chunk files first and then commit the SQLite transaction; on rollback, partial chunk files MUST be cleaned up. This is more complex than a single-substrate design but is what gives us the human-inspectable chunk format the initiative implies.

**Risks accepted**

- A chunk file lost or corrupted on disk while the SQLite index still points at it surfaces as a `terminal` data-store error at read time. Mitigation: the cache implementation MUST verify chunk file existence on write and MUST surface a structured error on read miss; there is no auto-repair (the prototype scope does not warrant it).
- The hash function used for `<query-hash>` in the on-disk path MUST be stable across runs. Pinned to SHA-256 of the lowercased trimmed query string. Changing the hash would invalidate every existing on-disk chunk — that would be a migration-grade change.

## References

- FR-017, FR-018, FR-019, FR-020, NFR-003, NFR-004.
- `components/data-layer.md` (chunking and indexing strategy sections).
- ADR 0001 (the four-layer boundary that places this decision inside the data layer).
- ADR 0002 (the contract source of truth that defines `ResultCard` and `Pagination`).

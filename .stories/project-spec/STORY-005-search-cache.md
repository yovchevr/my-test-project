---
id: STORY-005
title: Build the indexed search cache with SQLite plus segmented JSON
initiative: .initiatives/project_spec.md
requirements: [FR-016, FR-018, FR-020, NFR-004]
design_refs:
  - .design/components/data-layer.md
  - .design/decisions/0003-chunking-strategy.md
  - .design/foundation/conventions.md
status: ready
points: 5
depends_on: [STORY-002, STORY-004]
external_depends_on: []
wave: 4
---

## Goal / user value
Stand up the cache store that makes large queries usable: writes parse-then-chunk results to disk, reads return only the chunks the requested page actually touches, and the index makes that targeted retrieval cheap. This is the structural property NFR-004's "strictly fewer chunks than total when total > 1" demands; without it, FR-016/FR-018 are theatre.

## Context
Per `data-layer.md` the cache lives in `packages/data-cache/`. Substrate is `better-sqlite3@11.5.0` for the index (table `cache_index(query, page, chunk_id PK(query, page))` plus `cache_chunks(chunk_id PK, query, sequence, byte_size, path)`) and on-disk JSON under `<NEO_SEARCH_DATA_DIR>/chunks/<query-hash>/<sequence>.json`. ADR 0003 pins chunk bodies as one file per chunk; the hash is SHA-256 of the lowercased trimmed query. Writes MUST write chunk files first then commit the SQLite transaction; rollback MUST clean up partial files. Per FR-020 the README MUST document the index structure and lookup method.

## Scope
- New module `packages/data-cache/src/index.ts` exporting the `SearchCache` interface and a default factory `createSearchCache(opts: { dataDir: string; pageSize?: number })`.
- `SearchCache.write(query, results, signal)`: hashes the query, calls the chunker (STORY-004), writes one JSON file per chunk under `<dataDir>/chunks/<query-hash>/<sequence>.json`, then in a single SQLite transaction inserts/replaces rows in `cache_chunks` and `cache_index`. On any I/O error, ALL written chunk files for this query MUST be removed and the transaction rolled back. Returns `{ chunkIds: string[] }`.
- `SearchCache.read(query, page, signal)`: issues a single `SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?`, loads only those chunk files (typically one), returns `{ results: ResultCard[]; chunksRead: number; pagination: Pagination }`. The `chunksRead` field is the per-call observable that NFR-004's test asserts.
- Default `pageSize = 25` (per ADR 0003's headroom math: 100 results/chunk × 4 pages/chunk = 1 chunk per page read).
- Migrations under `packages/data-cache/migrations/` — a single `001-initial.sql` covering both tables.
- Document the index structure and lookup method in `packages/data-cache/README.md` (extends STORY-004's chunker README) per FR-020.
- All methods MUST accept and honor `AbortSignal` per `foundation/conventions.md`.
- Cancellation: a `signal.aborted` check before the SQLite call and between chunk-file writes is sufficient.
- Atomicity: chunk files written first, SQLite commit second. Crash between the two surfaces as orphaned chunk files; a separate `verify()` helper MAY be added to reconcile but is out of scope.

## Out of scope / non-goals
- No cross-process locking (OQ-005 single-user).
- No retention / eviction (I-13).
- No history / bookmark stores (STORY-006/007).
- No encryption (OQ-004).
- Orphaned-file repair beyond the per-write rollback above is deferred.

## Acceptance criteria
- A `SearchCache.write(query, results)` of 1000 deterministic results MUST produce 10 SQLite rows in `cache_chunks` and ≥ `pageSize` rows in `cache_index` (one per `(query, page)`).
- A subsequent `SearchCache.read(query, page=1)` MUST return the first 25 results in input order and MUST report `chunksRead === 1` (one chunk loaded out of 10) — this is the FR-018 / NFR-004 assertion.
- A `read(query, page=N)` for any N where the query has > 1 chunk MUST satisfy `chunksRead < totalChunks(query)` (NFR-004 acceptance criterion).
- A `write` that fails partway (simulated by an injected I/O error on the 5th chunk) MUST leave the SQLite transaction rolled back AND remove all written chunk files for that query.
- A repeated `write(query, newResults)` MUST atomically replace the prior chunks for that query (single SQLite transaction overwrites the index; old chunk files are unlinked).
- The store MUST survive a process restart: write, restart the process, read — the same results return (FR-016 acceptance criterion + I-12).
- `read(unknownQuery, anyPage)` MUST return `{ results: [], chunksRead: 0, pagination: { page, totalChunks: 0, hasMore: false } }` (no error — empty miss is not terminal).
- Every method MUST honor `AbortSignal` — a pre-aborted signal MUST cause the method to return early without touching disk.
- `packages/data-cache/README.md` MUST document the index structure (`cache_index` schema, primary key, lookup SQL) and the lookup method per FR-020.
- `tsc --noEmit`, `eslint`, and `vitest` MUST pass on the package.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- Migration script committed under `packages/data-cache/migrations/001-initial.sql` and applied automatically by `createSearchCache`.

## Test plan
- Unit (`packages/data-cache/src/cache.test.ts`): write/read round-trip with small fixtures (10, 100, 250 results); rollback-on-failure with an injected fs error; signal-aborted-before-write returns early.
- Integration (`packages/data-cache/src/cache.spec.ts`): the full 1000-result fixture from `packages/test-fixtures/`; assert `chunksRead === 1` for `page=1` and `chunksRead < totalChunks` for `page=5`; restart simulation by tearing down the SQLite handle, re-creating it on the same `dataDir`, and re-reading.
- E2E: not applicable here; STORY-019 covers full system smoke.
- Adversarial / NFR coverage:
  - **NFR-004**: spy on the chunk-read path; for queries with N = 2, 10, 100 chunks (parameterized fixtures), assert read count for any page is `< N`. This is the categorical "no full scan" assertion.
  - **NFR-003 underpin**: the 1000-result fixture exercises the ingest → chunk → store → page-read path; STORY-008 extends this to 5000 / 10000 with a heap-budget assertion.

## Affected design surface
- `.design/components/data-layer.md` — implements `SearchCache` interface and the SQLite + segmented JSON substrate.
- `.design/decisions/0003-chunking-strategy.md` — implements the pinned chunk size, boundary policy, and SHA-256 query hash.
- `.design/foundation/conventions.md` — async cancellation via `AbortSignal`, deterministic primitives.

## Dependencies
- **Depends on**: STORY-002 (`ResultCardContract`, `PaginationContract`), STORY-004 (`chunk` function and oversized seal).
- **Enables**: STORY-008 (NFR-003 large-set spec), STORY-010 (`data-store` tool's `cache.write` / `cache.read` ops).

## Risks & assumptions
- Risk: chunk-file/SQLite atomicity on power loss is not bulletproof (filesystem fsync semantics vary). Mitigation accepted per ADR 0003 — the prototype's local scope (OQ-002) does not warrant a journaling design; orphaned files surface as `terminal` cache reads.
- Assumption: SHA-256 of the lowercased trimmed query is collision-safe at prototype scale (a tens-of-thousands-of-queries scope makes collision probability negligible).
- Assumption: `better-sqlite3`'s synchronous API is acceptable in the prototype; the agent's `AbortSignal` checks happen between SQL calls, not mid-call.

## Source excerpts
> A page-N read for a 1000-result query touches at most 1 chunk file and exactly 1 SQLite index lookup. NFR-004 holds with comfortable headroom.

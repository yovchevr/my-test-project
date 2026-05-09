---
id: FR-016
title: Cache fetched web results in an indexed store
source: .initiatives/project_spec.md
status: approved
area: data
---

## Statement
The system MUST store fetched web results in an indexed cache that supports retrieval by query.

## Acceptance criteria
- Results returned by the web search tool (FR-012) MUST be written to the cache as part of handling a LIVE search.
- The cache MUST support retrieval keyed by query so that subsequent reads (history detail, pagination, re-rendering) do not require a fresh web search.
- The cache MUST be indexed — retrieval MUST NOT require scanning the full set (see FR-018 / NFR-004).
- The cache MUST persist across process restarts.
- The cache is a **single-user, local prototype** (per OQ-002, OQ-005): there MUST NOT be per-user partitioning, multi-user concurrency handling, or session isolation.
- There is **no auth requirement** on reading or writing cached results (per OQ-004); the API MUST NOT gate these operations behind authentication.
- There is **no encryption-at-rest requirement** for the cache (per OQ-004); plain on-disk persistence is acceptable.
- There is **no retention policy** (per OQ-004); the cache MUST NOT auto-evict entries on age, size, or count by default.

## Rationale
The initiative requires a third data-layer store for fetched results, with the property "must support retrieval by query". This is what enables both pagination over already-fetched data and the "no full scan" retrieval behavior.

## Source excerpts
> ### Data Layer
> Must include:
> ...
> 3. Indexed Search Cache
>   - Store fetched web results
>   - Must support retrieval by query

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

## Rationale
The initiative requires a third data-layer store for fetched results, with the property "must support retrieval by query". This is what enables both pagination over already-fetched data and the "no full scan" retrieval behavior.

## Source excerpts
> ### Data Layer
> Must include:
> ...
> 3. Indexed Search Cache
>   - Store fetched web results
>   - Must support retrieval by query

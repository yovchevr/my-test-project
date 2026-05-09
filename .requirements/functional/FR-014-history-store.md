---
id: FR-014
title: Persist all searches and results in a history store
source: .initiatives/project_spec.md
status: approved
area: data
---

## Statement
The system MUST persist every search, along with its results, in a history store that the user can later browse via the HISTORY source filter.

## Acceptance criteria
- Every search request that reaches the agent MUST be recorded in the history store, including queries that return zero results.
- Each history entry MUST capture the query, the timestamp, and the results (or a reference to the cached results — see FR-016).
- Selecting the HISTORY filter (FR-003) MUST retrieve entries from this store.
- History entries MUST survive a process restart (i.e. they MUST be persisted, not held in memory only).
- The store is a **single-user, local prototype** (per OQ-002, OQ-005): there MUST NOT be per-user partitioning, multi-user concurrency handling, or session isolation.
- There is **no auth requirement** on reading or writing history (per OQ-004); the API MUST NOT gate these operations behind authentication.
- There is **no encryption-at-rest requirement** for the history store (per OQ-004); plain on-disk persistence is acceptable.
- There is **no retention policy** (per OQ-004); the store MUST NOT auto-purge entries on age, size, or count by default.

## Rationale
The initiative names the History Store as the first required data-layer component and ties it to the HISTORY filter. Persistence is the load-bearing word — in-memory only would break the test case "History persists + retrieves".

## Source excerpts
> ### Data Layer
> Must include:
> 1. History Store
>   - Persist all searches + results

> 8. Test Cases
> - Must include:
>   - ...
>   - History persists + retrieves

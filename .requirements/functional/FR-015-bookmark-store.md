---
id: FR-015
title: Save and retrieve user bookmarks
source: .initiatives/project_spec.md
status: approved
area: data
---

## Statement
The system MUST allow the user to save bookmarks and MUST allow them to be retrieved later via the BOOKMARK source filter.

## Acceptance criteria
- The UI MUST expose an action to save a result (or an answer) as a bookmark.
- Saved bookmarks MUST be persisted in a bookmark store and MUST survive a process restart.
- Selecting the BOOKMARK filter (FR-003) MUST retrieve the saved bookmarks.
- It MUST be possible to retrieve a bookmark by its identifier or natural key.
- The store is a **single-user, local prototype** (per OQ-002, OQ-005): there MUST NOT be per-user partitioning, multi-user concurrency handling, or session isolation.
- There is **no auth requirement** on reading or writing bookmarks (per OQ-004); the API MUST NOT gate these operations behind authentication.
- There is **no encryption-at-rest requirement** for the bookmark store (per OQ-004); plain on-disk persistence is acceptable.
- There is **no retention policy** (per OQ-004); the store MUST NOT auto-purge bookmarks on age, size, or count by default.

## Rationale
The initiative lists the Bookmark Store as a required data-layer component and the BOOKMARK filter is one of the three named source types. Without persistence and retrieval, the BOOKMARK tab cannot satisfy its test case.

## Source excerpts
> ### Data Layer
> Must include:
> ...
> 2. Bookmark Store
>   - Allow saving + retrieving bookmarks

> 8. Test Cases
> - Must include:
>   - ...
>   - Bookmarks persist + retrieve

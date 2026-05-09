---
id: STORY-006
title: Build the persistent history store
initiative: .initiatives/project_spec.md
requirements: [FR-014]
design_refs:
  - .design/components/data-layer.md
  - .design/foundation/conventions.md
status: ready
points: 3
depends_on: [STORY-002]
external_depends_on: []
wave: 3
---

## Goal / user value
Persist every search request (query, source filter, timestamp, and a reference to the cached results) so the user can browse prior searches via the HISTORY filter (FR-003 → FR-014). Local-disk SQLite, single-user, no auth, no retention — the prototype scope per OQ-002/OQ-004/OQ-005. The store survives process restart by construction.

## Context
Per `data-layer.md` the history store lives in `packages/data-history/` and is backed by SQLite table `history(id PK, query, source_filter, ts, result_chunk_ids JSON)`. The agent appends one row per LIVE search, including zero-result searches (I-8). HISTORY reads return entries paginated by recency. The store MUST NOT hold a per-user namespace (I-14), gate access (I-15), or auto-purge (I-13). All access goes through the `data-store` tool (STORY-010); this story ships only the in-process interface the tool wraps.

## Scope
- New module `packages/data-history/src/index.ts` exporting `HistoryStore` interface and `createHistoryStore({ dataDir })`.
- `HistoryStore.append(entry: HistoryEntry, signal): Promise<{ id: string }>` — inserts a row; `id` is a generated UUID (injected `idGenerator` parameter to keep tests deterministic per `foundation/conventions.md`).
- `HistoryStore.list(page: number, signal): Promise<{ entries: HistoryEntry[]; pagination: Pagination }>` — returns entries ordered by `ts DESC`, paginated at `pageSize = 25`.
- Migration `packages/data-history/migrations/001-initial.sql` creating the `history` table.
- `HistoryEntry` MUST be the `HistoryEntryContract` shape from `@neo-search/contracts` — no per-package redefinition (I-34).
- Time injection: `append` MUST use an injected `clock: () => Date` parameter on the factory; defaults to `() => new Date()` but tests override with a fixed clock.
- All methods accept and honor `AbortSignal`.

## Out of scope / non-goals
- No per-user partitioning (I-14, OQ-005).
- No auth gating (I-15, OQ-004).
- No retention / TTL (I-13, OQ-004).
- No `data-store` tool wiring (STORY-010 owns that).
- No bookmark or cache concerns (STORY-005 / STORY-007).

## Acceptance criteria
- `append(entry)` MUST insert a row and return `{ id }`; the returned id MUST be a UUID v4 string (or whatever the injected `idGenerator` returns).
- `list(page=1)` after N appends MUST return up to `pageSize` entries in `ts DESC` order with `pagination: { page: 1, totalChunks: N, hasMore: N > pageSize }` (treating `totalChunks` as the entry count for the contract — the contract's `Pagination` is reused here).
- A zero-result `append` (entry whose `result_chunk_ids` is `[]`) MUST succeed and MUST appear in the next `list` (per FR-014 acceptance criterion + I-8).
- The store MUST survive a process restart: append, tear down the handle, re-create on the same `dataDir`, list — the entries are returned (FR-014 + I-12).
- The schema MUST NOT contain a `user_id`, `tenant_id`, or session column (asserted by a repo-grep test in STORY-018; this story MUST simply not create such a column).
- The store MUST NOT auto-purge — a test that appends an entry, advances the injected clock by 365 days, and lists MUST still see the entry (I-13).
- A pre-aborted `AbortSignal` to any method MUST cause the method to return early without touching SQLite.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass on the package.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- Migration committed and applied by `createHistoryStore`.

## Test plan
- Unit (`packages/data-history/src/history-store.test.ts`): `append` returns expected id; `list` ordering; zero-result append round-trip; pre-aborted signal early-return; schema-no-user-id structural test (introspect `PRAGMA table_info(history)` and assert no user/tenant/session columns).
- Integration (`packages/data-history/src/history-store.spec.ts`): the FR-014 restart round-trip — append, close, reopen on same `dataDir`, list, assert entries persist.
- E2E: not applicable; STORY-019 covers system-level history persistence.
- Adversarial / NFR coverage: NFR-006 — the schema-introspection test asserts no user-id / tenant / session columns even exist; an attempt to add one would fail. (NFR-006 acceptance criterion: zero hardcoded query branches AND single-user data shape.)

## Affected design surface
- `.design/components/data-layer.md` — implements the `HistoryStore` interface verbatim.
- `.design/foundation/conventions.md` — clock injection, async cancellation.

## Dependencies
- **Depends on**: STORY-002 (`HistoryEntryContract`, `PaginationContract`).
- **Enables**: STORY-010 (`data-store` tool's `history.append` / `history.list` ops).

## Risks & assumptions
- Risk: a future requirement asks for retention. Mitigation: I-13 makes that a superseding-ADR moment; this story builds the simplest correct shape.
- Assumption: SQLite write throughput is comfortably above the prototype's per-search rate; no batching or queue is needed.

## Source excerpts
> Every search request that reaches the agent MUST be recorded in the history store, including queries that return zero results. History entries MUST survive a process restart.

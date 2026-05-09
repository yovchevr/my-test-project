---
id: STORY-007
title: Build the persistent bookmark store
initiative: .initiatives/project_spec.md
requirements: [FR-015]
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
Persist user bookmarks (saved results or saved answer summaries) so the user can retrieve them via the BOOKMARK source filter (FR-003 → FR-015). Survives process restart, retrievable by id, no auth, no retention. Single-user prototype semantics — same scope rules as the history store (STORY-006).

## Context
Per `data-layer.md` the bookmark store lives in `packages/data-bookmarks/` and is backed by SQLite table `bookmarks(id PK, kind, payload JSON, ts)`. `kind` is a closed enum at the contract layer (`"result" | "answer"`); `payload` carries the saved record (a `ResultCard` for `kind: "result"`; the full `UiApiAnswerContract` value for `kind: "answer"`). Lookup by id resolves directly via the primary key — the index is the PK. All access goes through the `data-store` tool (STORY-010); this story ships only the in-process interface.

## Scope
- New module `packages/data-bookmarks/src/index.ts` exporting `BookmarkStore` and `createBookmarkStore({ dataDir })`.
- `BookmarkStore.save(entry: BookmarkSave, signal): Promise<{ id: string }>` — inserts a row; `id` from injected `idGenerator`.
- `BookmarkStore.list(page, signal): Promise<{ entries: BookmarkEntry[]; pagination: Pagination }>` — entries by `ts DESC`, `pageSize = 25`.
- `BookmarkStore.get(id, signal): Promise<BookmarkEntry | null>` — primary-key lookup; returns `null` for unknown id (NOT throw — per `foundation/conventions.md`).
- Migration `packages/data-bookmarks/migrations/001-initial.sql` creating the `bookmarks` table with PK on `id`.
- `BookmarkEntry`, `BookmarkSave`, etc., MUST be the contract shapes from `@neo-search/contracts` (I-34).
- Clock injection per `foundation/conventions.md`; `AbortSignal` honored on every method.

## Out of scope / non-goals
- No per-user partitioning (I-14).
- No auth (I-15).
- No retention / TTL (I-13).
- No "delete bookmark" operation (not in any FR/AC; deferred to a future story if user ever asks for it).
- No `data-store` tool wiring (STORY-010).

## Acceptance criteria
- `save({ kind: "result", payload: <ResultCard> })` MUST insert a row and return `{ id }`.
- `save({ kind: "answer", payload: <UiApiAnswerContract value> })` MUST insert a row and return `{ id }`.
- `get(id)` for an existing id MUST return the saved `BookmarkEntry` with the same `kind` and structurally-equal `payload`.
- `get(unknownId)` MUST return `null` (not throw).
- `list(page=1)` MUST return entries by `ts DESC`, paginated at `pageSize = 25`.
- The store MUST survive a process restart: save, tear down, reopen, get-by-id and list both succeed (FR-015 + I-12).
- The schema MUST NOT contain a `user_id`, `tenant_id`, or session column (introspection test).
- The store MUST NOT auto-purge (advance clock 365 days, `get(id)` still succeeds — I-13).
- A pre-aborted `AbortSignal` to any method MUST cause early return without SQLite I/O.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- Migration committed and applied by `createBookmarkStore`.

## Test plan
- Unit (`packages/data-bookmarks/src/bookmark-store.test.ts`): both `kind` variants round-trip via `save` → `get`; `get(unknownId)` returns `null`; `list` ordering; pre-aborted signal early-return; schema-no-user-id introspection.
- Integration (`packages/data-bookmarks/src/bookmark-store.spec.ts`): the FR-015 restart round-trip — save, close, reopen on same `dataDir`, get-by-id, list.
- E2E: not applicable here.
- Adversarial / NFR coverage: NFR-006 — schema introspection test asserts no user/tenant/session columns. (Same posture as STORY-006.)

## Affected design surface
- `.design/components/data-layer.md` — implements the `BookmarkStore` interface verbatim.
- `.design/foundation/conventions.md` — id/clock injection, async cancellation.

## Dependencies
- **Depends on**: STORY-002 (`BookmarkEntryContract`, `BookmarkSaveContract`, `PaginationContract`).
- **Enables**: STORY-010 (`data-store` tool's `bookmark.save` / `bookmark.list` / `bookmark.get` ops).

## Risks & assumptions
- Risk: a `kind: "answer"` payload could grow large (full answer + references) and bloat the row. Mitigation accepted at prototype scale; if it ever matters, a follow-up moves answer payloads to chunked storage.
- Assumption: a single SQLite table with a JSON column is sufficient at the prototype scale (no need for normalized tables).

## Source excerpts
> The UI MUST expose an action to save a result (or an answer) as a bookmark. Saved bookmarks MUST be persisted in a bookmark store and MUST survive a process restart.

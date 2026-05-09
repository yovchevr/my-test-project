---
id: STORY-010
title: Implement the data-store tool facade
initiative: .initiatives/project_spec.md
requirements: [FR-022, FR-023, FR-014, FR-015, FR-016, FR-018, NFR-006]
design_refs:
  - .design/components/data-store-tool.md
  - .design/components/tools-layer.md
  - .design/components/data-layer.md
  - .design/decisions/0001-layer-boundaries.md
  - .design/foundation/conventions.md
status: ready
points: 3
depends_on: [STORY-003, STORY-005, STORY-006, STORY-007]
external_depends_on: []
wave: 5
---

## Goal / user value
Provide the second of the two FR-022-required tools: `data-store`, a thin op-discriminated facade over the three data-layer stores. This is the structural seam ADR 0001 mandates — the agent reaches the data layer ONLY through this tool, never via direct imports. With `web-search` (STORY-009) and `data-store` registered, the registry hits the FR-022 floor of two tools and the FR-024 boundary "no agent → data direct import" becomes lint-enforceable (STORY-018).

## Scope
- New module `packages/tools-data-store/src/index.ts` exporting `dataStoreTool` (a `defineTool` registration wired to the seven ops).
- `createDataStoreHandler({ historyStore, bookmarkStore, searchCache })` factory — explicit dependency injection so unit tests can swap stores for fakes.
- Op routing by lookup table (NOT a `switch` per NFR-006 / I-22): `Record<DataStoreOp, OpHandler>` mapping each op literal to its handler. Adding a new op = a new entry, not a control-flow change.
- The seven ops, each delegating to the right store method:
  - `history.append` → `historyStore.append(entry, signal)`
  - `history.list` → `historyStore.list(page, signal)`
  - `bookmark.save` → `bookmarkStore.save(entry, signal)`
  - `bookmark.list` → `bookmarkStore.list(page, signal)`
  - `bookmark.get` → `bookmarkStore.get(id, signal)` — returns `{ kind: "validation", message: "not-found" }` if `null`, since a missing-by-id read is a contract-shape mismatch on the output union (the output requires `entry`, not `entry | null`)
  - `cache.write` → `searchCache.write(query, results, signal)`
  - `cache.read` → `searchCache.read(query, page, signal)`
- Failure translation: any thrown exception from a store method → `{ ok: false, error: { kind: "terminal", message } }` per `data-store-tool.md`. Schema-shape violations on output (e.g. the output union discriminant doesn't match the input op) MUST surface as `terminal` (this is the tool's bug).
- Cancellation: `signal` forwarded unchanged to every store method.
- This package is the ONLY package outside the data-layer packages permitted to import `@neo-search/data-history`, `@neo-search/data-bookmarks`, `@neo-search/data-cache`. STORY-018's `enforce-module-boundaries` rule MUST encode this.

## Out of scope / non-goals
- No business logic (per `data-store-tool.md`: thin facade only).
- No caching layer in front of the stores (the cache IS one of the stores).
- No per-user logic (I-14, OQ-005).
- No `delete` ops (no FR/AC asks for them; YAGNI per principle 8).

## Acceptance criteria
- The tool MUST register with the registry under `name: "data-store"`.
- The op routing MUST be implemented as a lookup table — a repo-grep MUST find no `switch (op)` block in this package (asserted by an AST scan in STORY-018).
- Each of the seven ops MUST round-trip end-to-end against real (in-memory or temp-dir) stores: input → handler → store → output validates against the matching output-union variant.
- A `bookmark.get` for an unknown id MUST return `{ ok: false, error: { kind: "validation", message: "not-found" } }` (not throw, not return `null`).
- A simulated store throw (e.g. SQLite I/O error) MUST be caught and surface as `{ kind: "terminal", message }` — the registry MUST NOT see a throw across this boundary (I-26).
- A pre-aborted `AbortSignal` MUST cause the handler to return early without invoking any store method.
- The package MUST NOT import or re-export anything from `services/agent`, `services/api`, or `apps/ui` (boundary discipline; asserted in STORY-018).
- Adding a new op MUST be possible by adding one entry to the routing table and one matching variant in `DataStoreInputContract` / `DataStoreOutputContract` — no other file in the package needs to change. (Demonstrated by a no-op "add an op" test in this story's spec; serves as a regression guard for NFR-006 / I-23.)
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.

## Test plan
- Unit (`packages/tools-data-store/src/data-store.test.ts`): each of the seven ops with fake stores; the `bookmark.get` not-found path; the throw-translation path; pre-aborted signal early-return; the "add an op" regression test (a synthetic 8th op proves the lookup table extension shape).
- Integration (`packages/tools-data-store/src/data-store.spec.ts`): end-to-end against real stores with a temp `dataDir` — write a cache entry, read it back via `cache.read`, append a history entry referencing the cache chunk ids, list it back, save and list bookmarks. This composition test covers FR-014, FR-015, FR-016 from the agent's perspective without actually wiring the agent.
- E2E: not applicable here.
- Adversarial / NFR coverage:
  - **NFR-006**: the no-`switch` AST scan + the "add an op" test together prove the lookup-table discipline. (NFR-006 acceptance criterion: adding tooling without rewriting flow.)
  - **FR-023**: the throw-translation test asserts the `terminal` `kind` flows through correctly.
  - **FR-018 / NFR-004**: the integration test asserts `cache.read`'s `chunksRead` field is propagated through the tool unchanged (so the agent and the API can surface it for verifiability).

## Affected design surface
- `.design/components/data-store-tool.md` — implements the op union and facade verbatim.
- `.design/components/tools-layer.md` — registers via `defineTool`.
- `.design/components/data-layer.md` — the in-process consumers of the store interfaces.
- `.design/decisions/0001-layer-boundaries.md` — this tool is what makes the ADR's "agent reaches data only through a tool" enforceable.

## Dependencies
- **Depends on**: STORY-003 (registry + `defineTool`), STORY-005 (`SearchCache`), STORY-006 (`HistoryStore`), STORY-007 (`BookmarkStore`).
- **Enables**: STORY-011 (agent's source-filter route handlers call this tool for every read/write).

## Risks & assumptions
- Risk: the op union grows past ~10 entries (per ADR 0001 negative consequence). Mitigation: monitor at planning time; if we approach the threshold, that's a decomposition signal.
- Assumption: stores expose the interfaces from STORY-005/006/007 unchanged; if any signature shifts mid-flight, this story's wiring follows.

## Source excerpts
> Provide a single tool the agent invokes for all data-layer reads and writes. Per FR-022, this is the second of the two required tools (alongside web-search).

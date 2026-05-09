---
id: STORY-002
title: Author the four boundary contracts in TypeBox
initiative: .initiatives/project_spec.md
requirements: [FR-010, FR-021]
design_refs:
  - .design/foundation/architecture.md
  - .design/foundation/naming-conventions.md
  - .design/components/search-api.md
  - .design/components/agent.md
  - .design/components/tools-layer.md
  - .design/components/data-store-tool.md
  - .design/components/data-layer.md
  - .design/decisions/0001-layer-boundaries.md
  - .design/decisions/0002-typescript-end-to-end.md
  - .design/domain/glossary.md
status: ready
points: 5
depends_on: [STORY-001]
external_depends_on: []
wave: 2
---

## Goal / user value
Define the spine that every other layer hangs off: the four FR-021 boundary contracts authored exactly once in TypeBox under `@neo-search/contracts`, plus the shared record types (`ResultCard`, `Pagination`, `HistoryEntry`, `BookmarkEntry`, `ReferenceEntry`, `Result<T,E>`). With this in place, any pair of producer/consumer packages can import the same shape and FR-021's "reusable / single definition" clause becomes a structural property of the codebase.

## Context
ADR 0002 picks TypeBox 0.33.17 specifically so Fastify can consume the JSON Schema natively without a translator. ADR 0001 makes the Agent ↔ Data contract a specialization of the Agent ↔ Tools contract (the `data-store` tool's input/output union). Per `naming-conventions.md`, every contract type ends in `Contract`, lives only under `@neo-search/contracts`, and a `no-restricted-imports` ESLint rule (wired in STORY-018) MUST forbid any other package from defining a `Contract`-suffixed type. The four contract modules already exist as empty placeholders from STORY-001; this story fills them.

## Scope
- `packages/contracts/src/ui-api.ts`: `SearchRequestContract`, `UiApiAnswerContract`, `ResultCardContract`, `ReferenceEntryContract`, `PaginationContract`, `BookmarkSaveRequestContract`, `BookmarkSaveResponseContract`, `BookmarkListResponseContract`, `HistoryListResponseContract`. Field shapes per `components/search-api.md`.
- `packages/contracts/src/api-agent.ts`: `AgentSearchRequestContract`, `AgentSearchResponseContract`, `AgentErrorContract`, `SourceFilterEnum` (closed enum LIVE/HISTORY/BOOKMARK), `SearchResponseValueContract`. Per `components/agent.md`.
- `packages/contracts/src/agent-tools.ts`: `ToolDescriptorContract`, `ToolErrorContract`, `ToolHandler<I,O>` type alias, `Result<T,E>` discriminated union (`{ ok: true, value: T } | { ok: false, error: E }`). Per `components/tools-layer.md`.
- `packages/contracts/src/tools/web-search.ts`: `WebSearchInputContract`, `WebSearchOutputContract`. Per `components/web-search-tool.md`.
- `packages/contracts/src/tools/data-store.ts`: `DataStoreInputContract` and `DataStoreOutputContract` as discriminated unions over the seven ops (`history.append`, `history.list`, `bookmark.save`, `bookmark.list`, `bookmark.get`, `cache.write`, `cache.read`). Per `components/data-store-tool.md`.
- `packages/contracts/src/data.ts`: `HistoryEntryContract`, `BookmarkEntryContract`, `BookmarkSaveContract`. Per `components/data-layer.md`.
- `packages/contracts/src/index.ts`: re-export every `Contract` and the `Result<T,E>` helper. Public surface SHOULD stay ≤ ~25 names.
- A frozen example payload for the FR-010 deliverable: a JSON file `packages/contracts/src/__fixtures__/example-ui-api-answer.json` that validates against `UiApiAnswerContract`.
- Vitest contract tests under `packages/contracts/src/__tests__/`: one spec file per boundary (`ui-api.spec.ts`, `api-agent.spec.ts`, `agent-tools.spec.ts`, `data-store.spec.ts`) that round-trips example payloads through the validator and asserts both directions (a malformed payload MUST fail validation, a well-formed payload MUST pass).

## Out of scope / non-goals
- No producer or consumer code yet — Fastify wiring is STORY-013, agent wiring is STORY-011, etc.
- No `enforce-module-boundaries` lint rule yet (STORY-018 owns that).
- No streaming variant of `UiApiAnswerContract` (deferred per `components/synthesis.md`).

## Acceptance criteria
- The four FR-021 boundary contracts MUST each be defined exactly once in `@neo-search/contracts`; a repo-grep MUST find no other file declaring a type whose name ends in `Contract`.
- `UiApiAnswerContract` MUST contain `answer_summary: string (min 1)` and `references: ReferenceEntryContract[]` per FR-010 acceptance criteria.
- `ReferenceEntryContract` MUST require non-empty `title`, non-empty `url` (format `uri`), non-empty `context` per FR-009 (referenced by FR-010).
- `SourceFilterEnum` MUST be a closed enum of exactly `"LIVE" | "HISTORY" | "BOOKMARK"` per `domain/glossary.md`.
- The example payload in `__fixtures__/example-ui-api-answer.json` MUST validate against `UiApiAnswerContract`; a contract test MUST assert this.
- Every contract MUST be importable from `@neo-search/contracts` (the package's public `index.ts`) — direct deep imports from another package MUST NOT be required.
- `Result<T, E>` MUST be a discriminated union on `ok: boolean` per `foundation/conventions.md`.
- The `DataStoreInputContract` MUST be a discriminated union on `op` covering the seven ops listed in Scope; the `DataStoreOutputContract`'s `op` discriminant MUST match the input's per op (one-to-one).
- `tsc --noEmit` MUST pass on `packages/contracts/`.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The example-payload fixture is committed and is referenced by the FR-025 deliverable docs (STORY-020).

## Test plan
- Unit: none specific (TypeBox schemas need no unit tests beyond the contract tests below).
- Integration: not applicable for a pure-types package.
- E2E: not applicable.
- Adversarial / NFR coverage: per FR-021, contract tests MUST exercise both producer and consumer perspectives — feed each schema a deliberately-malformed payload and assert validation rejects it; feed it a well-formed payload and assert it accepts. This is the structural test that makes "drift between layers" impossible to ship silently.

## Affected design surface
- `.design/components/search-api.md` — `UiApiAnswerContract` shape lives here.
- `.design/components/agent.md` — `AgentSearchRequestContract` / `AgentSearchResponseContract` shape.
- `.design/components/tools-layer.md` — `ToolDescriptorContract`, `ToolErrorContract`, `ToolHandler` shape.
- `.design/components/data-store-tool.md` — the `DataStoreInputContract` / `DataStoreOutputContract` op union.
- `.design/components/data-layer.md` — `HistoryEntry`, `BookmarkEntry`, `ResultCard`, `Pagination` record shapes.
- `.design/decisions/0001-layer-boundaries.md` — confirms the Agent ↔ Data contract is the data-store tool's input/output union.
- `.design/decisions/0002-typescript-end-to-end.md` — pins TypeBox as the schema author tool.

## Dependencies
- **Depends on**: STORY-001 (needs the workspace and the `@neo-search/contracts` package skeleton).
- **Enables**: STORY-003 (registry consumes `ToolDescriptorContract`), STORY-004 (chunker consumes `ResultCardContract`), STORY-005..STORY-007 (data layer record types), STORY-009/STORY-010 (tool input/output schemas), STORY-011 (agent request/response), STORY-012 (synthesis input/output), STORY-013 (API wire validation), STORY-015..STORY-017 (UI consumes types), STORY-018 (contract test gate).

## Risks & assumptions
- Risk: TypeBox's schema syntax is more verbose than Zod's; reviewers MUST be comfortable per ADR 0002. Mitigation: examples in `components/agent.md` and `components/synthesis.md` are illustrative; the developer agent should follow the design doc shapes verbatim.
- Assumption: the seven `data-store` ops listed in `components/data-store-tool.md` are sufficient for the prototype's needs; ADR 0001 notes any new op is a non-breaking addition.

## Source excerpts
> The system MUST define explicit, structured, reusable input/output contracts at every layer boundary: UI ↔ Backend/API, Backend/API ↔ Agent, Agent ↔ Tools, and Agent ↔ Data layer.

---
id: STORY-020
title: Author the FR-025 deliverable docs in Neo workflow vocabulary
initiative: .initiatives/project_spec.md
requirements: [FR-025]
design_refs:
  - .design/foundation/architecture.md
  - .design/components/agent.md
  - .design/components/synthesis.md
  - .design/components/data-layer.md
  - .design/components/tools-layer.md
  - .design/components/communication.md
  - .design/decisions/0001-layer-boundaries.md
  - .design/decisions/0002-typescript-end-to-end.md
  - .design/decisions/0003-chunking-strategy.md
  - .design/domain/glossary.md
  - .design/technology/testing.md
status: ready
points: 3
depends_on: [STORY-017, STORY-019]
external_depends_on: []
wave: 12
---

## Goal / user value
Produce the eight deliverable artifacts FR-025 names — architecture, problem-decomposition, agent-design, data-strategy, contracts (with example payloads), design-patterns (Neo workflow vocabulary), test-cases, and the runnable prototype gate — under `docs/`. These are not optional appendices; they are how the rubric judges the work. The "design-patterns" doc specifically MUST use **Neo workflow design patterns** (contract binding, agent orchestration, data partitioning, tool abstraction) per constraints.md, NOT generic GoF or framework patterns. The "working prototype" gate (FR-025 first acceptance) was already proved by STORY-019's smoke; this story crystallizes the documentation that lets a reviewer defend "Do you understand what you built?" without re-reading the whole `.design/` tree.

## Context
Per `.requirements/constraints.md` "Required pattern vocabulary", the design-patterns deliverable MUST be expressed in Neo workflow patterns; substituting GoF patterns is non-conformant. Per `domain/glossary.md` (design) and `domain/glossary.md` (requirements), the four named patterns are contract binding, agent orchestration, data partitioning, tool abstraction. Per `technology/testing.md`'s FR coverage matrix, the test-cases doc MUST list the seven specific cases the initiative names. The example payload for FR-010 already lives at `packages/contracts/src/__fixtures__/example-ui-api-answer.json` (STORY-002); this story references it from the contracts deliverable. The architecture doc condenses `.design/foundation/architecture.md` + `communication.md` for an external reader.

## Scope
- New folder `docs/` at the repo root with these files (each a single Markdown doc):
  - `docs/architecture.md` — system diagram (lifted from `foundation/architecture.md`), data flow (read STORY-013/STORY-011 for the live shape), agent interactions (STORY-011), tool interactions (STORY-009/STORY-010). Cross-references FR-024.
  - `docs/problem-decomposition.md` — explicitly documents (a) how the problem was broken down (the four-layer split + the registry-as-single-seam choice), (b) why this architecture was chosen (synthesize ADR 0001's Context + Decision sections for an external reader), (c) tradeoffs considered (Option A vs B from ADR 0001; polyglot vs single-language from ADR 0002; chunk-size alternatives from ADR 0003). Cross-references the three ADRs.
  - `docs/agent-design.md` — agent responsibilities, how decisions are made (the lookup-table routing per source filter, NOT a switch — pull from `agent.md`), how orchestration works (the five-step loop), the `runWithBudget` discipline (NFR-005). Cross-references FR-011, FR-013.
  - `docs/data-strategy.md` — chunking approach (lifted from ADR 0003 + `data-layer.md`), indexing approach (the SQLite primary-key lookup), storage format (segmented JSON + SQLite). Includes the NFR-003 / NFR-004 evidence (link to STORY-008's spec). Cross-references FR-019, FR-020.
  - `docs/contracts.md` — defined schemas (the four FR-021 contracts, named and linked to `packages/contracts/src/`), example payloads (the JSON fixture at `packages/contracts/src/__fixtures__/example-ui-api-answer.json`, embedded inline). Cross-references FR-010, FR-021.
  - `docs/design-patterns.md` — explicitly framed in Neo workflow design patterns. The four named patterns each get a section: **contract binding** (FR-021 across four boundaries; pinned by ADR 0002), **agent orchestration** (FR-011 / FR-013; the LangGraph state machine), **data partitioning** (FR-017 / FR-019 / FR-020; the chunker + index), **tool abstraction** (FR-022 / FR-023; the registry). The doc MUST NOT mention GoF patterns or framework patterns by name (constraints.md "Required pattern vocabulary").
  - `docs/test-cases.md` — lists each of the seven cases the initiative names — live web results (FR-012 + STORY-019 smoke), summary + cited references (FR-007/008/009 + STORY-012 + STORY-017), history persists+retrieves (FR-014 + STORY-006), bookmarks persist+retrieve (FR-015 + STORY-007), chunked data retrieval (FR-018 + STORY-005), large dataset (NFR-003 + STORY-008), UI source-filters/search-bar/pagination (FR-001..FR-006 + STORY-019). Each case lists the test file path and the assertion summary.
  - Update repo `README.md` with a "Deliverables" section linking all eight `docs/*.md` files plus pointing at the `pnpm e2e:smoke` gate as evidence the prototype runs.
- Each doc MUST be self-contained enough that a reviewer doesn't need to read the `.design/` tree to evaluate it — but MUST cross-reference `.design/` for the source of truth.
- Each doc MUST cite the FR / NFR / ADR IDs it covers in a `## Requirements covered` section at the bottom.
- The design-patterns doc MUST contain a `## Pattern vocabulary` section that names the four Neo patterns as the only vocabulary used.
- A markdownlint config MAY be added (OPTIONAL); not required.

## Out of scope / non-goals
- No tutorial or how-to content (these are reference deliverables).
- No video or screenshot artifacts (would be nice; not required by FR-025).
- No changelog or release notes.
- No translation / localization.

## Acceptance criteria
- All eight deliverable files in Scope MUST exist under `docs/` (or referenced equivalents — the `pnpm e2e:smoke` gate is the runnable-prototype evidence).
- `docs/architecture.md` MUST contain a system diagram, the data flow, agent interactions, and tool interactions per FR-025 acceptance criterion (b).
- `docs/problem-decomposition.md` MUST contain sections labeled "How we broke down the problem", "Why this architecture", and "Tradeoffs considered" per FR-025 (c).
- `docs/agent-design.md` MUST contain sections labeled "Responsibilities", "How decisions are made", and "How orchestration works" per FR-025 (d).
- `docs/data-strategy.md` MUST contain sections labeled "Chunking approach", "Indexing approach", and "Storage format" per FR-025 (e).
- `docs/contracts.md` MUST embed at least one example payload (lifted from the FR-010 fixture) and MUST list the four FR-021 contract names per FR-025 (f).
- `docs/design-patterns.md` MUST be framed in **Neo workflow design patterns** — a grep MUST confirm zero mentions of "Singleton", "Factory", "Adapter", "Observer", "Strategy", or other GoF pattern names (per constraints.md "Required pattern vocabulary"); the four named Neo patterns (contract binding, agent orchestration, data partitioning, tool abstraction) MUST each appear at least once. FR-025 (g).
- `docs/test-cases.md` MUST list every one of the seven cases the initiative names, each with a test file path and an assertion summary per FR-025 (h).
- The repo `README.md` MUST link every `docs/*.md` file from a "Deliverables" section.
- The `pnpm e2e:smoke` gate (STORY-019) MUST pass — this IS the FR-025 (a) "runnable from a clean checkout" evidence.
- A repo-grep CI test MUST assert no GoF pattern name appears in `docs/design-patterns.md`.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- A "Deliverables" section in repo `README.md` links all `docs/*.md` files with a one-line description of each.

## Test plan
- Unit: not applicable (these are docs).
- Integration: a small `tools/docs-lint/` script asserts (a) every required heading exists in each doc; (b) no GoF pattern name appears in `design-patterns.md`; (c) every FR/NFR ID listed in `.requirements/index.md` appears at least once across the `docs/` set; (d) the embedded example payload in `contracts.md` validates against `UiApiAnswerContract` (using the contract validator from STORY-002). All run as a CI job extension of STORY-018's gate set.
- E2E: `pnpm e2e:smoke` is the runnable-prototype gate (FR-025 a); STORY-019 owns the harness.
- Adversarial / NFR coverage:
  - **FR-025 g**: the GoF-pattern-name grep is the structural guard for "Required pattern vocabulary". A reviewer who substitutes "Strategy pattern" for "agent orchestration" would have a doc that reads natural to a non-Neo audience but fails the deliverable.
  - **FR-025 a**: the `pnpm e2e:smoke` gate is the structural guard for "end-to-end functional prototype" — without smoke passing, the deliverable is broken.

## Affected design surface
- `.design/foundation/architecture.md` — `docs/architecture.md` is its external-facing condensation.
- `.design/components/*` — surfaced in `docs/agent-design.md`, `docs/data-strategy.md`, `docs/contracts.md`.
- `.design/decisions/*` — surfaced in `docs/problem-decomposition.md` (tradeoffs section).
- `.design/domain/glossary.md` — the Neo pattern vocabulary lives here and is the source for `docs/design-patterns.md`.
- `.design/technology/testing.md` — the test-cases doc cross-references the test surface.

## Dependencies
- **Depends on**: STORY-017 (the answer/references rendering is what the smoke + the docs describe as the user-facing payload), STORY-019 (the runnable-prototype gate IS FR-025 a).
- **Enables**: nothing downstream — this is the terminal story for the deliverable surface.

## Risks & assumptions
- Risk: a reviewer interprets "Neo workflow design patterns" differently from the four named patterns. Mitigation: the constraints.md "Required pattern vocabulary" section lists the four examples; the docs MUST stick to those four exactly.
- Risk: docs go stale as the implementation evolves. Mitigation accepted at prototype scope; a follow-up could add a "doc freshness" check that asserts the docs were updated when the cited FR/NFR was last touched.
- Assumption: Markdown is sufficient for the deliverables; no PDF or slide rendering required.

## Source excerpts
> A "design patterns used" write-up MUST be expressed in Neo workflow design patterns (e.g. contract binding, agent orchestration, data partitioning, tool abstraction) and MUST NOT substitute generic application architecture patterns.

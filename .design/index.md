---
title: .design/ index
read_when: starting any design or implementation pass — read this first
---

# .design/ index

## How to use this index

Downstream agents MUST scan the entries below and load only the files whose `read_when` matches the current task. The index itself is short enough to load in full on every invocation. Directories group files that share a load posture — you can skip a whole directory when its topic is irrelevant.

The goal this design pass satisfies (synthesized in `.requirements/index.md`):

> Build a demo-ready, agent-driven web search product whose primary user-facing response is a summarized, citation-grounded answer (not a link dump), backed by an MCP-style tooling layer, with persistent History and Bookmark stores plus an indexed cache that can chunk and retrieve 1000+ results per query without full scans. Every layer boundary (UI ↔ API, API ↔ Agent, Agent ↔ Tools, Agent ↔ Data) MUST be governed by explicit, structured contracts, and the architecture MUST separate UI, agent orchestration, and the data layer behind clear boundaries.

## Always load — foundation/

- [foundation/architecture.md](foundation/architecture.md) — stable core, periphery, variation axes, four-layer system shape
- [foundation/conventions.md](foundation/conventions.md) — code style, formatting, error handling, async / determinism rules
- [foundation/naming-conventions.md](foundation/naming-conventions.md) — files, modules, packages, vars, branches, commits, tests

## Load on demand

| File | read_when | Requirements |
| --- | --- | --- |
| [domain/glossary.md](domain/glossary.md) | encountering a domain term, naming an entity, or modeling a payload | (vocabulary; touches all FRs) |
| [domain/invariants.md](domain/invariants.md) | changing rules the system must preserve, or modifying a contract | FR-007, FR-008, FR-009, FR-010, FR-012, FR-014, FR-015, FR-016, FR-017, FR-018, FR-021, FR-022, FR-023, FR-024, NFR-003, NFR-004, NFR-005, NFR-006 |
| [technology/tech-stack.md](technology/tech-stack.md) | adding a dependency, pinning a version, or wiring a new package | FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-021, FR-022, NFR-002, NFR-005 |
| [technology/testing.md](technology/testing.md) | writing or running tests, or wiring a new quality gate | every FR-* and every NFR-* |
| [components/ui-shell.md](components/ui-shell.md) | implementing or modifying UI behavior, layout, or visual treatment | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, NFR-001, NFR-002 |
| [components/search-api.md](components/search-api.md) | implementing or modifying the HTTP surface, request/response shaping, or the UI ↔ API contract | FR-005, FR-010, FR-021, FR-023, FR-024 |
| [components/agent.md](components/agent.md) | implementing or modifying the orchestration loop, tool selection, source-filter routing, or the request budget | FR-011, FR-013, FR-021, FR-022, FR-023, FR-024, NFR-005, NFR-006 |
| [components/synthesis.md](components/synthesis.md) | implementing or modifying the answer-summary / citations generation | FR-007, FR-008, FR-009, FR-013 |
| [components/tools-layer.md](components/tools-layer.md) | registering a new tool, modifying the tool registry, or changing the tool invocation contract | FR-021, FR-022, FR-023, NFR-006 |
| [components/web-search-tool.md](components/web-search-tool.md) | implementing or modifying the live web search integration | FR-012, FR-022, FR-023, NFR-005 |
| [components/data-store-tool.md](components/data-store-tool.md) | implementing or modifying how the agent reads/writes history, bookmarks, or the search cache | FR-014, FR-015, FR-016, FR-018, FR-022, FR-023, NFR-006 |
| [components/data-layer.md](components/data-layer.md) | implementing or modifying the history store, bookmark store, search cache, chunking, or indexing | FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-024, NFR-003, NFR-004, NFR-006 |
| [components/communication.md](components/communication.md) | wiring or modifying communication between components | (edges; cross-cuts FR-021, FR-022, FR-024, NFR-005) |

## Decisions (load when revisiting a prior decision)

- [decisions/0001-layer-boundaries.md](decisions/0001-layer-boundaries.md) — 2026-05-09 — four-layer boundary with the agent reaching data through a tool
- [decisions/0002-typescript-end-to-end.md](decisions/0002-typescript-end-to-end.md) — 2026-05-09 — TypeScript end-to-end with TypeBox as the single contract source
- [decisions/0003-chunking-strategy.md](decisions/0003-chunking-strategy.md) — 2026-05-09 — chunking strategy: fixed 100 results / chunk on ordinal boundary, indexed by SQLite

## FR / NFR coverage map (quick reference)

This table maps each requirement to the design doc(s) that cover it. The full traceability check is recorded in the design pass's report; this table is here so a downstream agent doesn't have to re-derive it.

| Requirement | Source file | Primary doc(s) |
| --- | --- | --- |
| FR-001 | [.requirements/functional/FR-001-app-shell-top-bar.md](../.requirements/functional/FR-001-app-shell-top-bar.md) | components/ui-shell.md |
| FR-002 | [.requirements/functional/FR-002-primary-search-controls.md](../.requirements/functional/FR-002-primary-search-controls.md) | components/ui-shell.md |
| FR-003 | [.requirements/functional/FR-003-source-filter-controls.md](../.requirements/functional/FR-003-source-filter-controls.md) | components/ui-shell.md, components/agent.md |
| FR-004 | [.requirements/functional/FR-004-results-list-cards.md](../.requirements/functional/FR-004-results-list-cards.md) | components/ui-shell.md |
| FR-005 | [.requirements/functional/FR-005-empty-and-error-states.md](../.requirements/functional/FR-005-empty-and-error-states.md) | components/ui-shell.md, components/search-api.md |
| FR-006 | [.requirements/functional/FR-006-pagination-or-progressive-loading.md](../.requirements/functional/FR-006-pagination-or-progressive-loading.md) | components/ui-shell.md |
| FR-007 | [.requirements/functional/FR-007-summarized-answer-response.md](../.requirements/functional/FR-007-summarized-answer-response.md) | components/synthesis.md |
| FR-008 | [.requirements/functional/FR-008-grounded-citations.md](../.requirements/functional/FR-008-grounded-citations.md) | components/synthesis.md |
| FR-009 | [.requirements/functional/FR-009-structured-reference-entries.md](../.requirements/functional/FR-009-structured-reference-entries.md) | components/synthesis.md |
| FR-010 | [.requirements/functional/FR-010-ui-api-answer-contract.md](../.requirements/functional/FR-010-ui-api-answer-contract.md) | components/search-api.md |
| FR-011 | [.requirements/functional/FR-011-agent-driven-orchestration.md](../.requirements/functional/FR-011-agent-driven-orchestration.md) | components/agent.md |
| FR-012 | [.requirements/functional/FR-012-live-web-search-integration.md](../.requirements/functional/FR-012-live-web-search-integration.md) | components/web-search-tool.md |
| FR-013 | [.requirements/functional/FR-013-synthesis-step.md](../.requirements/functional/FR-013-synthesis-step.md) | components/synthesis.md, components/agent.md |
| FR-014 | [.requirements/functional/FR-014-history-store.md](../.requirements/functional/FR-014-history-store.md) | components/data-layer.md, components/data-store-tool.md |
| FR-015 | [.requirements/functional/FR-015-bookmark-store.md](../.requirements/functional/FR-015-bookmark-store.md) | components/data-layer.md, components/data-store-tool.md |
| FR-016 | [.requirements/functional/FR-016-indexed-search-cache.md](../.requirements/functional/FR-016-indexed-search-cache.md) | components/data-layer.md, components/data-store-tool.md |
| FR-017 | [.requirements/functional/FR-017-chunked-partitioning.md](../.requirements/functional/FR-017-chunked-partitioning.md) | components/data-layer.md, decisions/0003-chunking-strategy.md |
| FR-018 | [.requirements/functional/FR-018-targeted-chunk-retrieval.md](../.requirements/functional/FR-018-targeted-chunk-retrieval.md) | components/data-layer.md, components/data-store-tool.md |
| FR-019 | [.requirements/functional/FR-019-document-chunking-strategy.md](../.requirements/functional/FR-019-document-chunking-strategy.md) | components/data-layer.md, decisions/0003-chunking-strategy.md |
| FR-020 | [.requirements/functional/FR-020-document-indexing-strategy.md](../.requirements/functional/FR-020-document-indexing-strategy.md) | components/data-layer.md, decisions/0003-chunking-strategy.md |
| FR-021 | [.requirements/functional/FR-021-explicit-layer-contracts.md](../.requirements/functional/FR-021-explicit-layer-contracts.md) | components/search-api.md, components/agent.md, components/tools-layer.md, decisions/0002-typescript-end-to-end.md |
| FR-022 | [.requirements/functional/FR-022-mcp-tooling-layer.md](../.requirements/functional/FR-022-mcp-tooling-layer.md) | components/tools-layer.md, components/web-search-tool.md, components/data-store-tool.md |
| FR-023 | [.requirements/functional/FR-023-tool-error-handling.md](../.requirements/functional/FR-023-tool-error-handling.md) | components/tools-layer.md, components/agent.md, components/web-search-tool.md, components/search-api.md |
| FR-024 | [.requirements/functional/FR-024-architectural-separation.md](../.requirements/functional/FR-024-architectural-separation.md) | foundation/architecture.md, decisions/0001-layer-boundaries.md, components/data-layer.md |
| FR-025 | [.requirements/functional/FR-025-deliverable-artifacts.md](../.requirements/functional/FR-025-deliverable-artifacts.md) | technology/testing.md (test-cases doc), foundation/architecture.md (architecture doc), components/* (Neo workflow patterns) |
| NFR-001 | [.requirements/non-functional/NFR-001-responsive-min-width.md](../.requirements/non-functional/NFR-001-responsive-min-width.md) | components/ui-shell.md, technology/testing.md |
| NFR-002 | [.requirements/non-functional/NFR-002-visual-polish.md](../.requirements/non-functional/NFR-002-visual-polish.md) | components/ui-shell.md, technology/testing.md |
| NFR-003 | [.requirements/non-functional/NFR-003-large-result-set-capacity.md](../.requirements/non-functional/NFR-003-large-result-set-capacity.md) | components/data-layer.md, decisions/0003-chunking-strategy.md, technology/testing.md |
| NFR-004 | [.requirements/non-functional/NFR-004-no-full-scan-retrieval.md](../.requirements/non-functional/NFR-004-no-full-scan-retrieval.md) | components/data-layer.md, decisions/0003-chunking-strategy.md, technology/testing.md |
| NFR-005 | [.requirements/non-functional/NFR-005-search-failure-resilience.md](../.requirements/non-functional/NFR-005-search-failure-resilience.md) | components/agent.md, components/web-search-tool.md, technology/testing.md |
| NFR-006 | [.requirements/non-functional/NFR-006-scalable-not-hardcoded-flows.md](../.requirements/non-functional/NFR-006-scalable-not-hardcoded-flows.md) | components/agent.md, components/tools-layer.md, technology/testing.md |

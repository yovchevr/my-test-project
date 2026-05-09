---
title: Requirements index
read_when: starting any design or implementation pass
---

# .requirements/ index

## Goal

Build a demo-ready, agent-driven web search product whose primary user-facing response is a summarized, citation-grounded answer (not a link dump), backed by an MCP-style tooling layer, with persistent History and Bookmark stores plus an indexed cache that can chunk and retrieve 1000+ results per query without full scans. Every layer boundary (UI ↔ API, API ↔ Agent, Agent ↔ Tools, Agent ↔ Data) MUST be governed by explicit, structured contracts, and the architecture MUST separate UI, agent orchestration, and the data layer behind clear boundaries.

## Processed initiatives

| Path | Last-commit-time | Commit SHA | Mode |
| --- | --- | --- | --- |
| .initiatives/project_spec.md | 2026-05-09 18:11 (file mtime; not yet committed in source repo) | uncommitted | initial |

## Functional requirements

| ID | Title | Status | Source |
| --- | --- | --- | --- |
| [FR-001](functional/FR-001-app-shell-top-bar.md) | Provide app shell with persistent top bar | approved | .initiatives/project_spec.md |
| [FR-002](functional/FR-002-primary-search-controls.md) | Expose primary search controls with submit and loading | approved | .initiatives/project_spec.md |
| [FR-003](functional/FR-003-source-filter-controls.md) | Provide source filter controls for LIVE HISTORY BOOKMARK | approved | .initiatives/project_spec.md |
| [FR-004](functional/FR-004-results-list-cards.md) | Render results as scrollable card-style list | approved | .initiatives/project_spec.md |
| [FR-005](functional/FR-005-empty-and-error-states.md) | Provide designed empty and error states | approved | .initiatives/project_spec.md |
| [FR-006](functional/FR-006-pagination-or-progressive-loading.md) | Provide pagination or progressive loading with fetch indicators | approved | .initiatives/project_spec.md |
| [FR-007](functional/FR-007-summarized-answer-response.md) | Return a summarized answer per search not a link dump | approved | .initiatives/project_spec.md |
| [FR-008](functional/FR-008-grounded-citations.md) | Ground every summary claim in a cited source | approved | .initiatives/project_spec.md |
| [FR-009](functional/FR-009-structured-reference-entries.md) | Provide structured reference entries for cited sources | approved | .initiatives/project_spec.md |
| [FR-010](functional/FR-010-ui-api-answer-contract.md) | Define UI to API contract for summary and citations | approved | .initiatives/project_spec.md |
| [FR-011](functional/FR-011-agent-driven-orchestration.md) | Drive search execution through agent orchestration | approved | .initiatives/project_spec.md |
| [FR-012](functional/FR-012-live-web-search-integration.md) | Integrate a real web search tool with live results | approved | .initiatives/project_spec.md |
| [FR-013](functional/FR-013-synthesis-step.md) | Synthesize raw hits into summary plus references | approved | .initiatives/project_spec.md |
| [FR-014](functional/FR-014-history-store.md) | Persist all searches and results in a history store | approved | .initiatives/project_spec.md |
| [FR-015](functional/FR-015-bookmark-store.md) | Save and retrieve user bookmarks | approved | .initiatives/project_spec.md |
| [FR-016](functional/FR-016-indexed-search-cache.md) | Cache fetched web results in an indexed store | approved | .initiatives/project_spec.md |
| [FR-017](functional/FR-017-chunked-partitioning.md) | Partition large result sets into chunks | approved | .initiatives/project_spec.md |
| [FR-018](functional/FR-018-targeted-chunk-retrieval.md) | Retrieve only relevant chunks on read | approved | .initiatives/project_spec.md |
| [FR-019](functional/FR-019-document-chunking-strategy.md) | Document the chunking strategy | approved | .initiatives/project_spec.md |
| [FR-020](functional/FR-020-document-indexing-strategy.md) | Document the indexing strategy | approved | .initiatives/project_spec.md |
| [FR-021](functional/FR-021-explicit-layer-contracts.md) | Define explicit contracts at all four layer boundaries | approved | .initiatives/project_spec.md |
| [FR-022](functional/FR-022-mcp-tooling-layer.md) | Provide an MCP tooling layer with at least two tools | approved | .initiatives/project_spec.md |
| [FR-023](functional/FR-023-tool-error-handling.md) | Handle tool invocation errors explicitly | approved | .initiatives/project_spec.md |
| [FR-024](functional/FR-024-architectural-separation.md) | Separate UI agent and data layers behind clear boundaries | approved | .initiatives/project_spec.md |
| [FR-025](functional/FR-025-deliverable-artifacts.md) | Produce the required deliverable artifacts | approved | .initiatives/project_spec.md |

## Non-functional requirements

| ID | Title | Category | Target | Status | Source |
| --- | --- | --- | --- | --- | --- |
| [NFR-001](non-functional/NFR-001-responsive-min-width.md) | Stay readable from 320px viewport upward | usability | ≥ 320px | approved | .initiatives/project_spec.md |
| [NFR-002](non-functional/NFR-002-visual-polish.md) | Apply coherent visual system across the UI | usability | checklist coverage | approved | .initiatives/project_spec.md |
| [NFR-003](non-functional/NFR-003-large-result-set-capacity.md) | Handle 1000-plus results per query without failure | performance | ≥ 1000 results/query | approved | .initiatives/project_spec.md |
| [NFR-004](non-functional/NFR-004-no-full-scan-retrieval.md) | Retrieve without full scans of stored data | performance | chunks read < total chunks | approved | .initiatives/project_spec.md |
| [NFR-005](non-functional/NFR-005-search-failure-resilience.md) | Recover from web search tool failures with retries | availability | open — see OQ-001 | draft | .initiatives/project_spec.md |
| [NFR-006](non-functional/NFR-006-scalable-not-hardcoded-flows.md) | Avoid hardcoded flows in agent and orchestration design | maintainability | zero hardcoded query branches | approved | .initiatives/project_spec.md |

## Supporting docs

- [constraints.md](constraints.md) — non-acceptable outcomes, architectural prohibitions, required pattern vocabulary, deployment scope
- [glossary.md](glossary.md) — domain terms (agent, MCP, contract, chunking, indexing, citation, LIVE / HISTORY / BOOKMARK, Neo workflow design patterns, synthesis step, answer summary)
- [assumptions.md](assumptions.md) — open questions: retry policy (OQ-001), deployment scope (OQ-002), latency target (OQ-003), security regime (OQ-004), concurrency model (OQ-005)

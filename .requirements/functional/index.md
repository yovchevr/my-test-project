---
title: Functional requirements index
read_when: enumerating or selecting functional requirements
---

<!-- regenerated on every run by business_analyst. Do not edit by hand. -->

# Functional requirements index

## ui

- [FR-001](FR-001-app-shell-top-bar.md) — Provide app shell with persistent top bar
- [FR-002](FR-002-primary-search-controls.md) — Expose primary search controls with submit and loading
- [FR-003](FR-003-source-filter-controls.md) — Provide source filter controls for LIVE HISTORY BOOKMARK
- [FR-004](FR-004-results-list-cards.md) — Render results as scrollable card-style list
- [FR-005](FR-005-empty-and-error-states.md) — Provide designed empty and error states
- [FR-006](FR-006-pagination-or-progressive-loading.md) — Provide pagination or progressive loading with fetch indicators

## answers

- [FR-007](FR-007-summarized-answer-response.md) — Return a summarized answer per search not a link dump
- [FR-008](FR-008-grounded-citations.md) — Ground every summary claim in a cited source
- [FR-009](FR-009-structured-reference-entries.md) — Provide structured reference entries for cited sources

## contracts

- [FR-010](FR-010-ui-api-answer-contract.md) — Define UI to API contract for summary and citations
- [FR-021](FR-021-explicit-layer-contracts.md) — Define explicit contracts at all four layer boundaries

## agent

- [FR-011](FR-011-agent-driven-orchestration.md) — Drive search execution through agent orchestration
- [FR-013](FR-013-synthesis-step.md) — Synthesize raw hits into summary plus references

## tooling

- [FR-012](FR-012-live-web-search-integration.md) — Integrate a real web search tool with live results
- [FR-022](FR-022-mcp-tooling-layer.md) — Provide an MCP tooling layer with at least two tools
- [FR-023](FR-023-tool-error-handling.md) — Handle tool invocation errors explicitly

## data

- [FR-014](FR-014-history-store.md) — Persist all searches and results in a history store
- [FR-015](FR-015-bookmark-store.md) — Save and retrieve user bookmarks
- [FR-016](FR-016-indexed-search-cache.md) — Cache fetched web results in an indexed store
- [FR-017](FR-017-chunked-partitioning.md) — Partition large result sets into chunks
- [FR-018](FR-018-targeted-chunk-retrieval.md) — Retrieve only relevant chunks on read
- [FR-019](FR-019-document-chunking-strategy.md) — Document the chunking strategy
- [FR-020](FR-020-document-indexing-strategy.md) — Document the indexing strategy

## architecture

- [FR-024](FR-024-architectural-separation.md) — Separate UI agent and data layers behind clear boundaries

## deliverables

- [FR-025](FR-025-deliverable-artifacts.md) — Produce the required deliverable artifacts

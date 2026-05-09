---
title: Stories — project-spec
read_when: enumerating or selecting stories from this initiative
---

<!-- regenerated on every run by story_planner. Do not edit by hand. -->

# Stories — project-spec

| ID | Title | Status | Points | Wave | Requirements | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| [STORY-001](STORY-001-monorepo-scaffold.md) | Scaffold the Nx pnpm TypeScript monorepo | ready | 5 | 1 | FR-024, FR-025 | — |
| [STORY-002](STORY-002-contracts-package.md) | Author the four boundary contracts in TypeBox | ready | 5 | 2 | FR-010, FR-021 | STORY-001 |
| [STORY-003](STORY-003-tool-registry.md) | Build the MCP-style tool registry | ready | 3 | 3 | FR-021, FR-022, FR-023 | STORY-002 |
| [STORY-004](STORY-004-chunker.md) | Implement the deterministic chunker | ready | 3 | 3 | FR-017, FR-019 | STORY-002 |
| [STORY-005](STORY-005-search-cache.md) | Build the indexed search cache with SQLite plus segmented JSON | ready | 5 | 4 | FR-016, FR-018, FR-020, NFR-004 | STORY-002, STORY-004 |
| [STORY-006](STORY-006-history-store.md) | Build the persistent history store | ready | 3 | 3 | FR-014 | STORY-002 |
| [STORY-007](STORY-007-bookmark-store.md) | Build the persistent bookmark store | ready | 3 | 3 | FR-015 | STORY-002 |
| [STORY-008](STORY-008-large-result-set-stress.md) | Adversarially stress the cache at one thousand plus results | ready | 3 | 5 | NFR-003 | STORY-005 |
| [STORY-009](STORY-009-web-search-tool.md) | Implement the web-search tool over Tavily | ready | 5 | 4 | FR-012, FR-022, FR-023, NFR-005 | STORY-003 |
| [STORY-010](STORY-010-data-store-tool.md) | Implement the data-store tool facade | ready | 3 | 5 | FR-022, FR-023, FR-014, FR-015, FR-016, FR-018, NFR-006 | STORY-003, STORY-005, STORY-006, STORY-007 |
| [STORY-011](STORY-011-agent-loop.md) | Build the LangGraph agent loop with budgeted retries | ready | 5 | 6 | FR-011, FR-021, FR-022, FR-023, FR-024, NFR-005, NFR-006 | STORY-002, STORY-003, STORY-009, STORY-010 |
| [STORY-012](STORY-012-synthesis-step.md) | Implement the synthesis step with citation validator | ready | 5 | 7 | FR-007, FR-008, FR-009, FR-013 | STORY-002, STORY-011 |
| [STORY-013](STORY-013-search-api.md) | Stand up the Fastify search API service | ready | 5 | 8 | FR-005, FR-010, FR-021, FR-023, FR-024 | STORY-002, STORY-011, STORY-012 |
| [STORY-014](STORY-014-ui-shell-and-tokens.md) | Stand up the UI shell with top bar and visual tokens | ready | 5 | 2 | FR-001, NFR-001, NFR-002 | STORY-001 |
| [STORY-015](STORY-015-search-controls-and-source-filter.md) | Render search controls and the source filter bar | ready | 3 | 3 | FR-002, FR-003 | STORY-002, STORY-014 |
| [STORY-016](STORY-016-results-list-and-states.md) | Render results list with empty error and pagination states | ready | 5 | 9 | FR-004, FR-005, FR-006 | STORY-002, STORY-014, STORY-013 |
| [STORY-017](STORY-017-answer-summary-and-bookmarks-ui.md) | Render the answer summary references and bookmark UI | ready | 3 | 10 | FR-007, FR-008, FR-009, FR-015 | STORY-013, STORY-016 |
| [STORY-018](STORY-018-quality-gates-and-boundary-lint.md) | Wire boundary lint coverage gates and AST scans | ready | 3 | 4 | FR-021, FR-024, NFR-006 | STORY-002, STORY-003 |
| [STORY-019](STORY-019-e2e-and-smoke-suite.md) | Build the Playwright E2E smoke and NFR suites | ready | 5 | 11 | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-012, FR-025, NFR-001, NFR-002, NFR-005 | STORY-013, STORY-017 |
| [STORY-020](STORY-020-deliverable-docs.md) | Author the FR-025 deliverable docs in Neo workflow vocabulary | ready | 3 | 12 | FR-025 | STORY-017, STORY-019 |

See [dag.md](dag.md) for the full graph, waves, and critical path.

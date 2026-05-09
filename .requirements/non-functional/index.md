---
title: Non-functional requirements index
read_when: enumerating or selecting non-functional requirements
---

<!-- regenerated on every run by business_analyst. Do not edit by hand. -->

# Non-functional requirements index

- [NFR-001](NFR-001-responsive-min-width.md) — Stay readable from 320px viewport upward — usability — ≥ 320px
- [NFR-002](NFR-002-visual-polish.md) — Apply coherent visual system across the UI — usability — checklist coverage
- [NFR-003](NFR-003-large-result-set-capacity.md) — Handle 1000-plus results per query without failure — performance — ≥ 1000 results/query
- [NFR-004](NFR-004-no-full-scan-retrieval.md) — Retrieve without full scans of stored data — performance — chunks read < total chunks
- [NFR-005](NFR-005-search-failure-resilience.md) — Recover from web search tool failures with retries — availability — 2 retries, 500ms fixed backoff, 10s budget
- [NFR-006](NFR-006-scalable-not-hardcoded-flows.md) — Avoid hardcoded flows in agent and orchestration design — maintainability — zero hardcoded query branches

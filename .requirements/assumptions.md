---
title: Assumptions and open questions
read_when: a draft requirement is unclear or an NFR has no target
---

# Assumptions and open questions

This file records (a) decisions taken on behalf of the user where the initiative was silent, and (b) questions the analyst would have asked but could not, because `AskUserQuestion` was not available in this run.

Every entry MUST cite the FR / NFR IDs it informs so the `solution_designer` knows which requirement to revisit when an answer arrives.

## Resolved

_(No interactive clarifications were taken in this run — see "Open questions" below.)_

## Open questions

The following questions remained open at the end of this run. Dependent requirements that hinge on a numeric or categorical answer are flagged in the "Status" column of the FR/NFR file. Resolve by editing the relevant requirement and re-running the analyst.

### OQ-001 — Retry policy for the web search tool

- **Date logged**: 2026-05-09
- **Question**: How many retries on transient web search failures? What backoff strategy (none, fixed, exponential)? What total timeout budget per user request?
- **Suggested options**: (a) 0 retries, fail fast; (b) up to 2 retries, fixed 500ms backoff, 10s total budget; (c) up to 3 retries, exponential backoff with jitter, 15s total budget.
- **Dependent requirements**: NFR-005, FR-012, FR-023.
- **Reason still open**: `AskUserQuestion` not available; the initiative requires retry behavior but does not pin a number.

### OQ-002 — Deployment scope

- **Date logged**: 2026-05-09
- **Question**: Is the deliverable expected to run as a local prototype only, or will it be deployed to a hosted environment (single-region, multi-region, HA)?
- **Suggested options**: (a) local only — single machine, no SLA; (b) hosted single-region best-effort; (c) hosted with availability target.
- **Dependent requirements**: All NFRs implicitly; constraints.md "Deployment scope" section explicitly.
- **Reason still open**: The initiative is silent on deployment topology. The constraints file currently assumes (a) until told otherwise.

### OQ-003 — User request latency target

- **Date logged**: 2026-05-09
- **Question**: Is there a target for end-to-end search latency (user submit → answer rendered)? E.g. p95 < 5s, p95 < 10s, no target?
- **Suggested options**: (a) no target — best effort; (b) p95 < 5s on a 1000-result query; (c) p95 < 10s on a 1000-result query.
- **Dependent requirements**: NFR-003, FR-006 (loading affordances are visible while waiting).
- **Reason still open**: The initiative requires a visible loading state but does not pin a latency target. Current draft NFRs assume no numeric target until clarified.

### OQ-004 — Security and data-handling regime

- **Date logged**: 2026-05-09
- **Question**: Are there security or privacy constraints (PII handling, data-at-rest encryption, auth on the API, retention limits on history / bookmarks)?
- **Suggested options**: (a) none — open prototype, single user; (b) local auth + encryption-at-rest for stored data; (c) hosted-grade auth + per-user isolation + retention policy.
- **Dependent requirements**: FR-014 (history persistence), FR-015 (bookmark persistence), FR-016 (indexed cache).
- **Reason still open**: The initiative does not mention security, auth, or privacy. Solution_designer should not introduce these without an answer.

### OQ-005 — Concurrency / multi-user expectations

- **Date logged**: 2026-05-09
- **Question**: Is the system single-user (one local user at a time) or multi-user concurrent? Does the data layer need per-user partitioning?
- **Suggested options**: (a) single-user prototype; (b) multi-user but no isolation (shared history / bookmarks); (c) multi-user with per-user isolation.
- **Dependent requirements**: FR-014, FR-015, FR-016, NFR-006.
- **Reason still open**: The initiative does not name users or sessions explicitly. Current requirements assume a single-user prototype.

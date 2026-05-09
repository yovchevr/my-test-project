---
title: Assumptions and open questions
read_when: a draft requirement is unclear or an NFR has no target
---

# Assumptions and open questions

This file records (a) decisions taken on behalf of the user where the initiative was silent, and (b) questions the analyst would have asked but could not, because `AskUserQuestion` was not available in this run.

Every entry MUST cite the FR / NFR IDs it informs so the `solution_designer` knows which requirement to revisit when an answer arrives.

## Resolved

### OQ-001 — Retry policy for the web search tool

- **Date logged**: 2026-05-09
- **Date resolved**: 2026-05-09
- **Question**: How many retries on transient web search failures? What backoff strategy (none, fixed, exponential)? What total timeout budget per user request?
- **Answer**: Up to **2 retries**, **fixed 500ms backoff** between attempts, **10s total per-request timeout budget** (option (b) from the suggested options).
- **Rationale**: User answer via assess checkpoint.
- **Dependent requirements**: NFR-005, FR-012, FR-023.

### OQ-002 — Deployment scope

- **Date logged**: 2026-05-09
- **Date resolved**: 2026-05-09
- **Question**: Is the deliverable expected to run as a local prototype only, or will it be deployed to a hosted environment (single-region, multi-region, HA)?
- **Answer**: **Local prototype only** — single machine, no SLA, no hosted infra (option (a) from the suggested options).
- **Rationale**: User answer via assess checkpoint.
- **Dependent requirements**: All NFRs implicitly; constraints.md "Deployment scope" section explicitly.

### OQ-003 — User request latency target

- **Date logged**: 2026-05-09
- **Date resolved**: 2026-05-09
- **Question**: Is there a target for end-to-end search latency (user submit → answer rendered)? E.g. p95 < 5s, p95 < 10s, no target?
- **Answer**: **No numeric target — best effort** (option (a) from the suggested options). Loading affordances (FR-002, FR-006) remain mandatory; only the numeric latency ceiling is unset.
- **Rationale**: User answer via assess checkpoint.
- **Dependent requirements**: NFR-003, FR-006.

### OQ-004 — Security and data-handling regime

- **Date logged**: 2026-05-09
- **Date resolved**: 2026-05-09
- **Question**: Are there security or privacy constraints (PII handling, data-at-rest encryption, auth on the API, retention limits on history / bookmarks)?
- **Answer**: **None — open prototype, single user** (option (a) from the suggested options). No auth on the API, no encryption-at-rest for stored data, no retention policy.
- **Rationale**: User answer via assess checkpoint.
- **Dependent requirements**: FR-014, FR-015, FR-016.

### OQ-005 — Concurrency / multi-user expectations

- **Date logged**: 2026-05-09
- **Date resolved**: 2026-05-09
- **Question**: Is the system single-user (one local user at a time) or multi-user concurrent? Does the data layer need per-user partitioning?
- **Answer**: **Single-user prototype** — one local user at a time, no per-user partitioning (option (a) from the suggested options).
- **Rationale**: User answer via assess checkpoint.
- **Dependent requirements**: FR-014, FR-015, FR-016, NFR-006.

## Open questions

_(No open questions remain. All five clarifications logged in this initiative were resolved on 2026-05-09 via the assess checkpoint.)_

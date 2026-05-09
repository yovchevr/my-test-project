---
title: Constraints
read_when: scoping any design or implementation pass
---

# Constraints

These are explicit non-goals, prohibitions, and scoping pins lifted from the initiative. The `solution_designer` and `developer` agents MUST treat them as binding alongside the FR / NFR set.

## Non-acceptable outcomes

The following classes of solution MUST NOT be delivered. Producing any of them constitutes a non-conformant build, regardless of how many FRs are satisfied:

- Pure "vibe-coded" outputs with no reasoning behind the architecture or implementation.
- Hardcoded mock-only systems (no real web search; see FR-012).
- Systems with no agent orchestration (no FR-011 implementation).
- Systems with no chunking / indexing (no FR-017 / FR-020 implementation).
- Systems with no contracts (no FR-021 implementation).
- Broken or non-functional pull requests (a build that does not run end-to-end).

## Architectural prohibitions

- The agent layer MUST NOT be implemented as a "thin wrapper" API that pretends to be agentic — see FR-011.
- The data layer MUST NOT store a query's results as a single monolithic blob — see FR-017.
- Cross-layer code MUST NOT bypass the contracts defined in FR-021 by reaching into another layer's internals.

## Required pattern vocabulary

The "Design Patterns Used" deliverable refers specifically to **Neo workflow design patterns**, not general application architecture patterns. Examples called out by the initiative:

- Contract binding
- Agent orchestration
- Data partitioning
- Tool abstraction

Any pattern claims in the architecture document MUST be expressed in this vocabulary; generic GoF or framework-specific patterns SHOULD NOT be substituted.

## Deployment scope

The deployment scope is **local prototype only** — single machine, single user, no SLA, no hosted infrastructure (resolved via OQ-002, 2026-05-09). Design and implementation passes MUST treat this as binding:

- The system MUST run on one developer machine end-to-end (UI, API, agent, tooling, data layer).
- There MUST NOT be a hosted-environment deployment target, a single-region or multi-region topology, or an availability SLA in the design.
- HA infrastructure (load balancers, replicated databases, multi-region failover, container orchestrators) MUST NOT be introduced — they are out of scope for this prototype.
- Persistence MAY be a local filesystem store, embedded database, or equivalent; nothing requires a managed cloud service.
- The system is **single-user** (resolved via OQ-005): no per-user partitioning, no session isolation, no multi-user concurrency handling.
- There is **no security regime** (resolved via OQ-004): no auth on the API, no encryption-at-rest for stored data, no retention policy. This is acceptable specifically because the deliverable is an open local prototype.

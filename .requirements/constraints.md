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

The initiative does not pin a deployment scope (local-only, single-region, multi-region, hosted, etc.). This is logged as an open question in `assumptions.md`. Until resolved, design decisions SHOULD assume a single-environment prototype suitable for evaluation, and SHOULD NOT introduce multi-region or HA infrastructure that is unjustified by the initiative.

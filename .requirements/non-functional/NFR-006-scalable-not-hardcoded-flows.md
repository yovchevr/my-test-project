---
id: NFR-006
title: Avoid hardcoded flows in agent and orchestration design
source: .initiatives/project_spec.md
status: approved
category: maintainability
metric: hardcoded-branch presence in agent / orchestration code (categorical)
target: zero hardcoded query-specific or result-shape-specific branches in the agent control flow
---

## Statement
The agent orchestration and data flow MUST be implemented as a scalable, generalized design — not as hardcoded, query-specific, or result-shape-specific branches.

## Acceptance criteria
- The agent's control flow (FR-011, FR-013) MUST NOT contain hardcoded branches keyed on specific query strings or specific known result shapes.
- Adding a new tool to the tooling layer (FR-022) MUST be possible without rewriting the agent's main loop.
- Adding a new source filter (FR-003) MUST be possible without modifying the synthesis step (FR-013).
- A code review MUST be able to confirm the absence of demo-only fast paths; presence of any such path MUST fail this NFR.
- The system is a **single-user prototype** with **no per-user partitioning** (per OQ-005). The data layer (FR-014, FR-015, FR-016) MUST NOT include user-id columns, per-user namespaces, or session-keyed isolation. Generality applies to tools and source filters, not to multi-tenancy.

## Rationale
The initiative requires "scalable design (not hardcoded flows)" and explicitly disqualifies "vibe-coded" or "hardcoded mock-only" systems. This is what stops the prototype from being a brittle demo.

## Source excerpts
> ### Architecture
> Must demonstrate:
> - Separation of concerns:
>   - UI
>   - Agent orchestration
>   - Data layer
> - Clear system boundaries
> - Scalable design (not hardcoded flows)

> ## 🚫 NON-ACCEPTABLE
> - Pure "vibe-coded" outputs with no reasoning
> - Hardcoded mock-only systems
> - No agent orchestration
> - No chunking/indexing
> - No contracts
> - Broken or non-functional PRs

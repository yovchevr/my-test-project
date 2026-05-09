---
title: Four-layer boundary with the agent reaching data through a tool
read_when: revisiting how the layers are partitioned, or proposing a cross-layer shortcut
status: Accepted
date: 2026-05-09
---

# ADR 0001 — Four-layer boundary with the agent reaching data through a tool

## Status

Accepted (2026-05-09).

## Context

The initiative requires (FR-024) "separation of concerns: UI / agent orchestration / data layer", "clear system boundaries", and "scalable design (not hardcoded flows)". It separately requires (FR-021) explicit, structured contracts at four named boundaries — UI ↔ Backend/API, Backend/API ↔ Agent, Agent ↔ Tools, Agent ↔ Data layer.

There are two natural ways to honor "four contracts":

- **A.** Treat `Agent ↔ Data` as a direct in-process import: the agent imports the data-layer modules and the contract is the function signatures.
- **B.** Treat `Agent ↔ Data` as a tool-mediated edge: the agent reaches the data layer **only** through a `data-store` tool registered in the tooling layer (FR-022). The `Agent ↔ Tools` and `Agent ↔ Data` contracts are then the same shape (the tool's input/output union), with the data-store tool's input union encoding all data-layer operations.

Option A is simpler initially but has two downsides:

1. It opens a second seam through which the agent talks to the world (tools for external services, direct imports for storage). Two seams means two retry stories, two error taxonomies, and two cancellation paths — which violates principle 6 (compose primitives, don't sprawl).
2. It makes "replace one layer's implementation without modifying the others" (FR-024) harder: a swap of the data substrate becomes a coordinated change across the agent and the data-layer packages, not just a tool re-registration.

## Decision

Adopt **Option B**. The agent reaches the data layer **only** through the `data-store` tool registered with the tooling layer.

Concretely:

- The agent layer MUST NOT import data-layer modules directly. Lint enforces this.
- The `data-store` tool's input is a discriminated union over `op` (history.append, history.list, bookmark.save, bookmark.list, bookmark.get, cache.write, cache.read). The tool delegates to the appropriate data-layer package internally.
- This makes the `Agent ↔ Tools` contract the single shape governing all of the agent's reach into the rest of the system — for both external services and storage.
- The `Agent ↔ Data` contract from FR-021 is then satisfied by the data-store tool's input/output union (a documented, structured, reusable schema that both sides import).

The four boundaries become:

| Boundary | Contract module | Components on either side |
| --- | --- | --- |
| UI ↔ API | `@neo-search/contracts/ui-api.ts` | `apps/ui` ↔ `services/api` |
| API ↔ Agent | `@neo-search/contracts/api-agent.ts` | `services/api` ↔ `services/agent` |
| Agent ↔ Tools | `@neo-search/contracts/agent-tools.ts` | `services/agent` ↔ `packages/tools` registry |
| Agent ↔ Data | `@neo-search/contracts/tools/data-store.ts` (the data-store tool's input/output union, which is itself a specialization of the Agent ↔ Tools contract) | `services/agent` ↔ `packages/tools-data-store` ↔ `packages/data-*` |

## Consequences

**Positive**

- Single seam for everything the agent reaches: tools. One retry helper, one error taxonomy, one cancellation path. Honors principle 6 and principle 7.
- Replacing the data substrate is a swap behind the `data-store` tool — the agent and the API are unchanged. This is what gives FR-024's "replacing one layer's implementation MUST be possible without modifying the others" its operational meaning.
- The agent's surface area shrinks: it sees a registry of tools, not two unrelated module trees.

**Negative**

- An extra in-process indirection per data access (agent → registry → data-store tool → data-layer package). For the prototype's workload, the cost is negligible.
- The `data-store` tool grows a discriminated union as new data-layer operations are added. The team MUST keep the union from sprawling — if it ever exceeds ~10 ops, that is a sign the data layer wants further decomposition (principle 9 — co-changing things together, others apart).

**Risks accepted**

- Lint must reliably catch `agent → data-layer` imports. If the lint rule misfires, the discipline is unenforced. Mitigation: a CI test (`services/agent/src/swap-data-layer.spec.ts` per `technology/testing.md`) swaps the data-layer implementation behind the contract and asserts the agent and API tests still pass — a regression here would catch a bypass even if lint missed it.

## References

- FR-021, FR-022, FR-024, NFR-006.
- `foundation/architecture.md` (the layered diagram).
- `components/agent.md`, `components/tools-layer.md`, `components/data-store-tool.md`, `components/data-layer.md`.

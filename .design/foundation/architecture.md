---
title: Architecture
read_when: starting any change — read first, on every task
---

# Architecture

This document fixes the high-level shape of the system: the layers, the stable core, the volatile periphery, and the variation axes the design accommodates. Every component doc and ADR refines this picture; nothing in `.design/` MAY contradict it without a superseding ADR.

## System layers

The system MUST be partitioned into four layers, in this order from user to data:

1. **UI layer** — the browser-facing app shell, search controls, source filter, results list, and answer renderer. See `components/ui-shell.md`.
2. **API layer** — the HTTP surface the UI talks to. Owns request/response shaping, the UI ↔ API contract, and nothing else. See `components/search-api.md`.
3. **Agent layer** — the orchestrator that drives a search end-to-end: tool selection, pagination, chunk retrieval, and synthesis. See `components/agent.md` and `components/synthesis.md`.
4. **Data layer** — the three persistent stores (history, bookmarks, search cache) plus the chunking and indexing strategy, all behind one component. See `components/data-layer.md`.

A separate **tooling layer** sits beside the agent and exposes invocable tools through a uniform interface. See `components/tools-layer.md`, `components/web-search-tool.md`, and `components/data-store-tool.md`.

The four layer boundaries (UI ↔ API, API ↔ Agent, Agent ↔ Tools, Agent ↔ Data) MUST each be governed by an explicit, structured contract per FR-021. Cross-layer code MUST NOT bypass these contracts by reaching into another layer's internals.

## Stable core vs. volatile periphery

Per principle 3, the design names what is expected to change slowly and what is expected to change often.

**Stable core** (changes rarely, breaking changes require an ADR):

- The four layer contracts (FR-021, FR-010): field names, types, and semantics.
- The agent's orchestration loop shape: select tool → invoke → react to result/error → optionally synthesize → return.
- The chunk + index abstraction at the data-layer boundary: callers ask the index "which chunks for this read?" and read only those chunks (FR-018, NFR-004).
- The tool interface (input schema, output schema, error shape) (FR-022, FR-021).

**Volatile periphery** (expected to evolve; changes do not require an ADR if they preserve the core contracts):

- The concrete web search tool implementation (provider, transport).
- The chunk storage format on disk (segmented JSON today; could be SQLite blobs tomorrow).
- The synthesis prompt and model.
- The UI's visual treatment (palette, typography, spacing).
- The set of registered tools — adding a new tool MUST be possible without modifying the agent's main loop (NFR-006).

Each component doc MUST declare itself `boundary: core` or `boundary: periphery` in its frontmatter so downstream agents can tell at a glance how cautious to be when changing it.

## Variation axes (explicit)

Per principle 2, the axes the design accommodates — and the axes it explicitly does NOT — are named here.

| Axis | Posture | Notes |
| --- | --- | --- |
| Source type (LIVE / HISTORY / BOOKMARK) | accommodated as **data**, not code | Three concrete instances (FR-003, FR-014, FR-015) clear the rule-of-three. Treated as a closed enum at the contract layer; routing is a lookup table on the agent side, not a switch statement. Adding a fourth source type is an ADR-worthy change. |
| Tool type | accommodated as **registered handlers** | Two concrete instances (FR-012, FR-022). NFR-006 mandates that new tools be addable without rewriting the agent loop. Tools register themselves with the tooling layer; the agent discovers them through the registry. |
| Storage backend | accommodated as a **swappable implementation** behind the data-layer contract | One concrete instance today (segmented JSON files + an on-disk index). The data-layer contract is what stays; the implementation MAY be replaced with an embedded DB without touching the agent. |
| Tenant / per-user partitioning | **NOT accommodated, by design** | OQ-005 resolved the system as single-user. Data-layer code MUST NOT carry user-id columns, per-user namespaces, or session-keyed isolation (NFR-006 acceptance criterion). |
| Region / multi-region topology | **NOT accommodated, by design** | OQ-002 resolved the deployment as local prototype. No HA infrastructure (load balancers, replicated DBs, multi-region failover) MUST be introduced. |
| Auth / security regime | **NOT accommodated, by design** | OQ-004 resolved no auth, no encryption-at-rest, no retention policy. The API MUST NOT gate any operation behind authentication. |
| Latency SLO | **NOT pinned** | OQ-003 resolved best-effort. Loading affordances (FR-002, FR-006) remain mandatory regardless. |

If a future requirement introduces a new axis (e.g. multi-tenant, multi-region, auth), that is a superseding-ADR moment, not a quiet edit.

## Layering rules

- The UI layer MUST only call the API layer. It MUST NOT import agent code or data-layer code directly.
- The API layer MUST only call the agent layer. It MUST NOT touch the data layer or call tools directly.
- The agent layer MUST only reach the data layer through the data storage/retrieval tool exposed via the tooling layer (FR-022). It MUST NOT import data-layer modules directly.
- The agent layer MUST only call external services through the tooling layer. It MUST NOT bypass the tool registry to issue raw HTTP calls.
- The tooling layer MUST be the only component permitted to talk to external APIs (web search) or to the data-layer modules.
- There MUST be no cyclic imports between layers.
- Every cross-layer call MUST go through the contract definitions referenced in FR-021.

## System diagram

```
+---------------------------------------------------------+
|                       UI Layer                          |
|  app shell · search bar · source filter · results list  |
+----------------------------+----------------------------+
                             | UI ↔ API contract (FR-010)
+----------------------------v----------------------------+
|                      API Layer                          |
|       HTTP surface; request/response shaping            |
+----------------------------+----------------------------+
                             | API ↔ Agent contract (FR-021)
+----------------------------v----------------------------+
|                     Agent Layer                         |
|   orchestration loop · synthesis step · tool selection  |
+--------------+----------------------------+-------------+
               | Agent ↔ Tools (FR-022)     | Agent ↔ Data (FR-021)
+--------------v---------+      +-----------v-------------+
|     Tooling Layer       |     |       Data Layer        |
|  · web search tool      |     |  · history store        |
|  · data storage tool    +<--->+  · bookmark store       |
|                         |     |  · indexed search cache |
+-------------------------+     +-------------------------+
```

The agent talks to the data layer **through the data storage/retrieval tool** exposed in the tooling layer (FR-022); the diagram shows the tooling layer as the access path. This is what gives FR-024 ("replacing one layer's implementation MUST be possible without modifying the others") its bite — see `decisions/0001-layer-boundaries.md`.

## Requirements covered by this document

FR-021, FR-024, NFR-006 (architectural posture).

---
title: Domain glossary
read_when: encountering a domain term, naming an entity, or modeling a payload
---

# Domain glossary

Project-specific definitions used across the design. When a term in this glossary appears in a design doc, ADR, or contract, it carries this meaning unless the document explicitly says otherwise. This file mirrors the project's ubiquitous language as fixed by `.requirements/glossary.md`; design-only refinements are marked **(design)**.

## Core domain entities

### Search request

A user-initiated query plus the source filter and pagination parameters that scope it. The agent receives a search request, decides what tools to invoke, and returns a search response. The contract for this entity lives at the API ↔ Agent boundary (FR-021); see `packages/contracts/src/api-agent.ts`.

### Search response

The shape returned to the UI for a single search. Composed of an `answer_summary` (FR-007), a `citations` / `references` list (FR-009), the underlying `results` (FR-004), and pagination metadata. The contract for this entity lives at the UI ↔ API boundary (FR-010, FR-021).

### Result (a.k.a. raw hit)

A single entry returned by the web search tool — title, snippet, domain, URL. A result becomes a card-style row in the UI (FR-004) and a candidate citation source for the synthesis step (FR-013). Results are stored in chunks in the search cache (FR-016, FR-017).

### Reference entry

A structured record about a cited source: `title`, `url`, `context`. Always non-empty in all three fields (FR-009). A reference entry MUST be derived from one or more results that backed a claim in the answer summary; opaque references not tied to a result MUST NOT be emitted.

### Citation marker **(design)**

The mechanism (chosen by the implementation) that ties a material claim or bullet in the answer summary to one or more reference entries. The design fixes this as inline numeric markers — `[1]`, `[2]` — pointing into the references list. Other forms (footnotes, "Sources" block) MUST NOT be substituted, so reviewers always know what to look for. See FR-008.

## Source-type vocabulary

The three named source types from `.requirements/glossary.md`. The design treats them as a closed enum at the contract layer (per principle 5: variants are data, not code). Routing for each source type is a lookup table on the agent side, not a switch statement.

### LIVE

Results produced by a fresh invocation of the web search tool (FR-012). On every LIVE search the agent MUST also write the parsed results into the indexed search cache (FR-016) and append a history entry (FR-014).

### HISTORY

A previously persisted search and its results, retrieved from the history store (FR-014). HISTORY reads MUST NOT trigger a fresh web search and MUST NOT update the history store as a side effect.

### BOOKMARK

A user-saved item, retrieved from the bookmark store (FR-015). BOOKMARK reads MUST NOT trigger a fresh web search.

## Storage units

### Chunk

A bounded partition of a query's result set (FR-017). The design pins the chunk size at **100 results per chunk** as the default boundary policy; the rationale and override conditions live in `decisions/0003-chunking-strategy.md`. Chunks are addressable individually so a page-N read fetches only the chunks containing page N (FR-018, NFR-004).

### Index entry

A single row in the search cache index that maps `(query, page-or-range)` to the list of chunk IDs that satisfy it (FR-020). Index entries MUST be readable without scanning the chunk bodies themselves.

### History entry

A persisted record of a search request: query text, timestamp, source filter, and a reference (chunk-ID list or query key) into the search cache for the results. History entries MUST survive process restart (FR-014).

### Bookmark entry

A persisted record of a user-saved item — either a single result or a whole answer summary. Identified by a stable `id` so it can be retrieved by key (FR-015).

## Agent vocabulary

### Tool

A unit of work the agent can invoke through the tooling layer (FR-022). Each tool MUST have a documented input schema, output schema, and error shape (FR-021, FR-023). The design fixes the initial registry at two tools — `web-search` and `data-store` — with room to register more without touching the agent loop (NFR-006).

### Tool invocation

A single call by the agent to one of the registered tools, governed by the agent ↔ tools contract. A tool invocation MUST be cancellable via `AbortSignal` and MUST return a structured `Result<T, E>` (see `foundation/conventions.md`).

### Orchestration loop **(design)**

The agent's main control structure: select tool → invoke → react to result/error → optionally synthesize → return. The loop MUST be the same shape regardless of source filter; per-source behavior is a lookup, not a branch (NFR-006).

### Synthesis step

The agent activity that converts raw results into the answer summary plus citations payload (FR-013). The design treats it as a discrete unit of work invoked by the agent for every search, including HISTORY and BOOKMARK reads — so the answer-quality contract stays uniform across source types.

### Agent budget **(design)**

The total time the agent has to satisfy a single search request, including all tool invocations and retries. Pinned at **10s** by NFR-005 / OQ-001 for the `web-search` tool. Other tools MAY adopt the same default but MUST document any deviation per FR-023.

## Contract vocabulary

### Contract

An explicit, structured, reusable input/output schema at a layer boundary (FR-021). The design fixes four contracts — UI ↔ API, API ↔ Agent, Agent ↔ Tools, Agent ↔ Data — and pins their type names in `foundation/naming-conventions.md`.

### Result wrapper **(design)**

The shared `Result<T, E>` type from `@neo-search/contracts`. Every cross-boundary call returns one. The discriminant is `ok: boolean`; the error variant carries a `kind` field (`"transient"`, `"terminal"`, `"validation"`) per `foundation/conventions.md`.

## Pattern vocabulary

The design uses the **Neo workflow design patterns** named in `.requirements/constraints.md`. They MUST be referenced by these names, not by GoF or framework-specific equivalents:

- **Contract binding** — the discipline of pinning every layer boundary to an explicit, reusable schema. Implemented by FR-021 across four boundaries.
- **Agent orchestration** — the agent-driven control discipline that decides the next step, rather than a fixed procedural pipeline. Implemented by FR-011, FR-013.
- **Data partitioning** — splitting large result sets into chunks plus an index for targeted retrieval. Implemented by FR-017, FR-018, FR-019, FR-020, NFR-003, NFR-004.
- **Tool abstraction** — a uniform interface over invocable tools, exposed through the tooling layer with input/output/error schemas. Implemented by FR-022, FR-023.

## Out-of-scope vocabulary

These terms appear in adjacent products but MUST NOT enter this design's vocabulary, contracts, or code:

- **Tenant**, **organization**, **workspace** — the system is single-user (OQ-005). Per-user partitioning MUST NOT be modeled.
- **Session**, **principal**, **identity** — there is no auth (OQ-004). Sessions and principals MUST NOT be modeled.
- **Region**, **availability zone**, **failover** — the deployment is local prototype only (OQ-002). Topology terms MUST NOT enter the design.
- **TTL**, **eviction**, **retention window** — there is no retention policy (OQ-004). Stores MUST NOT auto-purge.

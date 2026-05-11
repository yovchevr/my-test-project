# Design Patterns

This document describes the design patterns used in the neo-search system, expressed in **Neo workflow design patterns**.

## Pattern vocabulary

The design uses the four Neo workflow design patterns named in the initiative's constraints and domain glossary. These are the only patterns referenced in this document:

1. **Contract binding** — the discipline of pinning every layer boundary to an explicit, reusable schema.
2. **Agent orchestration** — the agent-driven control discipline that decides the next step, rather than a fixed procedural pipeline.
3. **Data partitioning** — splitting large result sets into chunks plus an index for targeted retrieval.
4. **Tool abstraction** — a uniform interface over invocable tools, exposed through the tooling layer with input/output/error schemas.

These patterns are the project's ubiquitous language. They align with the design principle of naming what varies explicitly (principle 2: variation axes are data, not code) and the principle of composing primitives (principle 6: reduce duplication through shared abstractions).

## Contract binding

### What it is

Contract binding is the practice of defining each layer boundary with a single, explicit, reusable schema that both sides import. The schema is the contract: it specifies the shape of requests and responses, the valid values for each field, and the error variants.

### How neo-search implements it

Neo-search applies contract binding at four boundaries (FR-021):

| Boundary       | Contract module                             | Imported by                                   |
| -------------- | ------------------------------------------- | --------------------------------------------- |
| UI ↔ API      | `@neo-search/contracts/ui-api.ts`           | `apps/ui`, `services/api`                     |
| API ↔ Agent   | `@neo-search/contracts/api-agent.ts`        | `services/api`, `services/agent`              |
| Agent ↔ Tools | `@neo-search/contracts/agent-tools.ts`      | `services/agent`, `packages/tools` (registry) |
| Agent ↔ Data  | `@neo-search/contracts/tools/data-store.ts` | `services/agent`, `packages/tools-data-store` |

Every contract is authored once in TypeBox and lives in `@neo-search/contracts`. Both sides of each boundary import the same module. There is no duplication, no drift, and no manual sync.

For example:

- The UI imports `UiApiAnswerContract` to type its API client.
- The API imports `UiApiAnswerContract` to validate its response at the wire boundary.

If the contract changes, both sides see the change immediately because they reference the same source.

### Why this pattern matters

Without contract binding, each side of a boundary would define its own types and hope they match. Drift would be invisible until runtime. With contract binding, drift is a compile-time type error — the system won't build if the two sides disagree.

Contract binding also makes the boundaries explicit and reviewable. A reviewer can read `@neo-search/contracts` and know exactly what the UI expects from the API, what the API expects from the agent, and so on.

### Where it's applied

- **FR-021** — the requirement for explicit, structured contracts at all four boundaries.
- **ADR 0002** — the decision to use TypeBox as the single contract source, so one schema produces both static TS types and runtime JSON Schema.
- **STORY-002** — the story that wired the UI ↔ API contract tests, validating that both sides honor the same schema.

## Agent orchestration

### What it is

Agent orchestration is the control discipline where an agent decides the next step based on inputs, results, and errors — rather than following a fixed procedural pipeline. The agent is not a thin wrapper that blindly forwards requests; it selects tools, reacts to tool results, retries transient failures, and surfaces terminal failures.

### How neo-search implements it

Neo-search's agent (FR-011) drives a search end-to-end through a five-step loop:

1. **Validate** — validate the incoming request contract.
2. **Route** — look up the route handler for the source filter in a routing table.
3. **Invoke tools** — call registered tools through the tool registry, wrapped by the `runWithBudget` retry helper.
4. **Synthesize** — invoke the synthesis step to produce the answer summary and references.
5. **Return** — return a structured response contract.

The agent's routing is a **lookup table** keyed by source filter, not a `switch` statement:

```typescript
const routes: Record<SourceFilter, RouteHandler> = {
  LIVE: handleLiveSearch,
  HISTORY: handleHistoryRead,
  BOOKMARK: handleBookmarkRead,
};
```

Adding a new source filter (e.g. `STARRED`) is a lookup-table entry and a route handler — the agent loop body does not change.

Tool selection is also registry-based:

```typescript
const result = await registry.invoke('web-search', input, signal);
```

The agent does not import tool modules directly. It invokes them through the registry, which resolves the name to a registered handler. Adding a new tool (e.g. `calculator`) is a registration call, not a modification to the agent loop.

### Why this pattern matters

Agent orchestration keeps the system from hardcoding flows (NFR-006). Without this pattern, adding a new source filter or a new tool would require editing the agent's main loop — a brittle design that sprawls as the system grows.

With agent orchestration, the agent's loop stays stable. New behaviors are registered, not wired.

### Where it's applied

- **FR-011** — the requirement for agent-driven orchestration (not a thin wrapper API).
- **FR-013** — the synthesis step, invoked uniformly by the agent on every search.
- **NFR-006** — the requirement for scalable design (not hardcoded flows).
- **STORY-011** — the story that wired the agent's orchestration loop and routing table.

## Data partitioning

### What it is

Data partitioning is the practice of splitting large result sets into bounded chunks, then indexing those chunks so a read operation retrieves only the chunks it needs — not the entire result set.

### How neo-search implements it

Neo-search partitions search results into **100-result chunks** at fixed ordinal boundaries (FR-017):

- Results 1–100 → chunk 0.
- Results 101–200 → chunk 1.
- Results 201–300 → chunk 2.
- And so on.

Each chunk is stored as a separate JSON file under `<data-dir>/chunks/<query-hash>/<sequence>.json`.

An index maps `(query, page)` to the chunk IDs that satisfy it (FR-020):

```sql
SELECT chunk_id FROM cache_index WHERE query = ? AND page = ?
```

For a 1000-result query:

- Total chunks: 10.
- A page-1 read (results 1–25) touches chunk 0 only.
- A page-5 read (results 101–125) touches chunk 1 only.

A page read touches **1 chunk out of 10**, satisfying NFR-004's "no full scans" bound.

### Why this pattern matters

Without data partitioning, reading page N of a 1000-result query would require loading the entire 1000-result set into memory, scanning to skip N-1 pages, and returning the Nth page. For a 10000-result query, this is untenable.

Data partitioning makes reads narrow: the system consults the index, fetches only the chunks containing the requested page, and returns the results. The rest of the data stays on disk.

This pattern also makes the data layer swappable: the agent doesn't know whether results are stored as JSON files, SQLite blobs, or something else. It asks the `data-store` tool for "page N of query Q" and gets back the results. The chunking and indexing strategies are hidden behind the tool contract.

### Where it's applied

- **FR-017** — chunked partitioning (result sets split into bounded chunks).
- **FR-018** — targeted chunk retrieval (a page-N read touches only the chunks containing page N).
- **FR-019** — document chunking strategy (the chunk size policy and boundary criterion).
- **FR-020** — document indexing strategy (the index structure and lookup method).
- **NFR-003** — large result set capacity (the system handles 1000+ results without crash or unbounded heap).
- **NFR-004** — no full-scan retrieval (a page read touches strictly fewer chunks than the total).
- **ADR 0003** — the decision to use fixed 100-result chunks on ordinal boundaries, indexed by SQLite.
- **STORY-008** — the story that wired the chunking and indexing strategies and the NFR-003/004 tests.

## Tool abstraction

### What it is

Tool abstraction is the practice of wrapping every external API call and every data-layer operation behind a uniform interface. The agent doesn't call external services directly or import data-layer modules directly — it invokes tools through the tool registry. Every tool handler implements the same contract: accept an input, return a structured result or error, honor the cancellation signal.

### How neo-search implements it

Neo-search's tooling layer (FR-022) exposes two tools:

1. **`web-search`** — wraps the Tavily API. Input: `{ query, maxResults }`. Output: an array of `ResultCard` records.
2. **`data-store`** — wraps the data-layer packages. Input: a discriminated union over `op` (history.append, cache.read, etc.). Output: depends on `op`.

Both tools are registered with the tool registry (`@neo-search/tools`). The agent invokes them through:

```typescript
const result = await registry.invoke(toolName, input, signal);
```

The registry resolves `toolName` to a registered handler and invokes it. The handler returns a structured `Result<T, E>` where `E` is a `ToolErrorContract`:

```typescript
{ ok: true, value: T }
// or
{ ok: false, error: { kind: "transient" | "terminal" | "validation", message, details } }
```

Every tool invocation:

- Accepts an `AbortSignal` so it can be cancelled when the 10s NFR-005 budget elapses.
- Returns a structured result where errors are classified by `kind`.
- Is wrapped by the `runWithBudget` helper, which retries transient errors and surfaces terminal errors immediately.

### Why this pattern matters

Tool abstraction gives the agent a single seam for reaching the rest of the world. Whether it needs to fetch live web results or read from the cache, it goes through a registered tool.

This makes the agent's surface area small and testable. To test the agent, inject fake tools into the registry and assert the agent invokes them correctly. The agent doesn't need to know whether it's hitting the real Tavily API or a test fixture — that's the tool's responsibility.

Tool abstraction also makes the system swappable. To replace Tavily with a different web search provider:

1. Write a new `web-search` tool that wraps the new provider.
2. Register it with the same name.
3. The agent and API are unchanged.

The tool contract stays stable; the implementation behind it swaps.

### Where it's applied

- **FR-022** — the requirement for an MCP-style tooling layer with input/output/error schemas.
- **FR-023** — the requirement for structured tool error handling (transient vs terminal).
- **NFR-005** — the retry policy (shared `runWithBudget` helper wraps every tool invocation).
- **ADR 0001** — the decision to make the agent reach the data layer through the `data-store` tool, not via direct imports.
- **STORY-009** — the story that wired the `web-search` tool.
- **STORY-010** — the story that wired the `data-store` tool.

## How these patterns compose

The four patterns work together:

- **Contract binding** pins the boundaries so each pattern operates in a well-defined space. The agent knows what contracts to honor; the tools know what contracts to implement.
- **Agent orchestration** uses **tool abstraction** to stay swappable and testable. The agent invokes tools through the registry; the registry resolves names to handlers.
- **Tool abstraction** wraps **data partitioning** behind the `data-store` tool. The agent doesn't know whether results are chunked or how the index works — it asks the tool for "page N of query Q" and gets back the results.
- **Data partitioning** makes large result sets tractable without changing the agent or the tool contract. The agent still calls `registry.invoke('data-store', { op: 'cache.read', query, page })` — the chunking and indexing happen inside the data layer, hidden from the caller.

Together, they give the system clear boundaries, swappable layers, narrow reads, and no hardcoded flows.

## Requirements covered

- **FR-011** — Agent-driven orchestration (agent orchestration pattern).
- **FR-013** — Synthesis step (agent orchestration pattern).
- **FR-017** — Chunked partitioning (data partitioning pattern).
- **FR-018** — Targeted chunk retrieval (data partitioning pattern).
- **FR-019** — Document chunking strategy (data partitioning pattern).
- **FR-020** — Document indexing strategy (data partitioning pattern).
- **FR-021** — Explicit layer contracts (contract binding pattern).
- **FR-022** — MCP-style tooling layer (tool abstraction pattern).
- **FR-023** — Tool error handling (tool abstraction pattern).
- **NFR-003** — Large result set capacity (data partitioning pattern).
- **NFR-004** — No full-scan retrieval (data partitioning pattern).
- **NFR-005** — Search failure resilience (tool abstraction pattern, retry helper).
- **NFR-006** — Scalable design (agent orchestration pattern, tool abstraction pattern).

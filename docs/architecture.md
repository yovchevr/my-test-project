# Architecture

This document describes the high-level structure of the neo-search system: the layers, the boundaries, the data flow, and the interactions between components.

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

The agent reaches the data layer **through the data storage/retrieval tool** exposed in the tooling layer (FR-022), not via direct imports. This indirection is what enables replacing one layer's implementation without modifying the others (FR-024).

## Four-layer system

The system is partitioned into four layers:

1. **UI layer** — the browser-facing app shell, search controls, source filter, results list, and answer renderer. Built with Vite + React + Tailwind + Radix. Lives in `apps/ui`.

2. **API layer** — the HTTP surface the UI talks to. Owns request/response shaping and the UI ↔ API contract. Nothing else. Built with Fastify. Lives in `services/api`.

3. **Agent layer** — the orchestrator that drives a search end-to-end: tool selection, pagination, chunk retrieval, and synthesis. Built with LangGraph + Anthropic SDK. Lives in `services/agent`.

4. **Data layer** — the three persistent stores (history, bookmarks, indexed search cache) plus the chunking and indexing strategy. Built with SQLite (`better-sqlite3`) for indices and on-disk segmented JSON for chunk bodies. Lives in `packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`.

A separate **tooling layer** sits beside the agent and exposes invocable tools through a uniform interface. Built with the MCP SDK pattern. Lives in `packages/tools`, `packages/tools-web-search`, `packages/tools-data-store`.

## Layer boundaries and contracts

The four contractually-governed boundaries (FR-021) are:

| Boundary       | Contract module                                  | Components                                                           |
| -------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| UI ↔ API      | `@neo-search/contracts/ui-api.ts`                | `apps/ui` ↔ `services/api`                                          |
| API ↔ Agent   | `@neo-search/contracts/api-agent.ts`             | `services/api` ↔ `services/agent`                                   |
| Agent ↔ Tools | `@neo-search/contracts/agent-tools.ts`           | `services/agent` ↔ `packages/tools` registry                        |
| Agent ↔ Data  | `@neo-search/contracts/tools/data-store.ts` (\*) | `services/agent` ↔ `packages/tools-data-store` ↔ `packages/data-*` |

(\*) The Agent ↔ Data contract is satisfied by the data-store tool's input/output union, which is itself a specialization of the Agent ↔ Tools contract.

Every cross-layer call goes through these contracts. Cross-layer code cannot bypass the contracts by reaching into another layer's internals — this is enforced by ESLint's `@nx/enforce-module-boundaries` rule.

## Data flow

A typical LIVE search flows through the system like this:

1. User enters a query in the search bar and clicks submit (UI layer).
2. UI sends `POST /api/search` with `{ query, sourceFilter: "LIVE", page }` (UI ↔ API boundary).
3. API validates the request and forwards it to the agent (API ↔ Agent boundary).
4. Agent invokes the `web-search` tool through the registry (Agent ↔ Tools boundary).
5. The `web-search` tool hits the Tavily API, parses the response, and returns structured results.
6. Agent invokes the `data-store` tool to write results to the search cache and append a history entry (Agent ↔ Tools boundary).
7. Agent invokes the synthesis step, which calls the Anthropic API to produce an `answer_summary` and `references` from the raw results.
8. Agent returns the search response to the API (API ↔ Agent boundary).
9. API shapes the response and returns JSON to the UI (UI ↔ API boundary).
10. UI renders the answer summary, references, and results list.

For HISTORY or BOOKMARK searches, steps 4–5 are replaced by a `data-store` tool read, but the synthesis step (step 7) still runs — the answer-quality contract stays uniform across source types.

## Agent interactions

The agent is the orchestrator. It does not contain hardcoded flows (NFR-006). Instead:

- **Tool selection** happens via a lookup table keyed by source filter (`LIVE` → `web-search` + `data-store`; `HISTORY` → `data-store`; `BOOKMARK` → `data-store`). Adding a new source filter is a lookup-table entry, not a switch-statement branch.
- **Orchestration** is a five-step loop: validate → route → invoke tools → synthesize → return. The loop shape stays the same regardless of source filter.
- **Retry handling** for transient tool errors is delegated to a shared `runWithBudget` helper that applies the NFR-005 policy (2 retries, 500ms backoff, 10s budget).
- **Synthesis** is invoked once per search request, even for HISTORY and BOOKMARK reads, so the answer format is consistent.

## Tool interactions

The tooling layer exposes two tools:

1. **`web-search`** — wraps the Tavily API. Input: `{ query, maxResults }`. Output: an array of `ResultCard` records. Errors are classified as `transient` (network, 5xx, 429) or `terminal` (4xx, malformed response).

2. **`data-store`** — wraps the data-layer packages. Input: a discriminated union over `op` (history.append, history.list, bookmark.save, bookmark.list, bookmark.get, cache.write, cache.read). Output: depends on `op`.

Both tools are registered with the tool registry (`@neo-search/tools`). The agent invokes them through `registry.invoke(name, input, signal)` — never via direct imports. This is what makes the agent's surface area small and swappable (FR-024).

Every tool invocation:

- Accepts an `AbortSignal` so it can be cancelled when the 10s NFR-005 budget elapses.
- Returns a structured `Result<T, E>` where `E` carries a `kind` discriminant (`transient`, `terminal`, `validation`).
- Is wrapped by the `runWithBudget` helper, which retries transient errors and surfaces terminal errors immediately.

## Separation of concerns

Each layer has a single responsibility:

- **UI** — presents data and captures user intent. Does not contain orchestration logic or data-access code.
- **API** — shapes requests and responses. Does not contain business logic.
- **Agent** — decides what to do next based on results and errors. Does not contain UI code or data-access code.
- **Tooling** — wraps external APIs and data-layer operations behind a uniform interface. Does not contain orchestration logic.
- **Data** — persists and retrieves records. Does not contain orchestration logic or external API calls.

Replacing one layer's implementation is possible without modifying the others, provided the contracts stay stable. For example:

- Swapping the data substrate from SQLite + JSON to an embedded DB (DuckDB, RocksDB) requires changes only to `packages/data-*` and the `data-store` tool. The agent and API are unchanged.
- Swapping the synthesis model from Anthropic to OpenAI requires changes only to `services/agent/src/synthesis/`. The API and UI are unchanged.
- Swapping the UI framework from React to Svelte requires changes only to `apps/ui`. The API and agent are unchanged.

This is architectural separation in action (FR-024).

## Requirements covered

- **FR-021** — Explicit, structured, reusable contracts at all four boundaries.
- **FR-024** — Clear separation: UI / agent / data. Replacing one layer does not require modifying the others.
- **NFR-006** — Scalable design (not hardcoded flows): the agent's routing is a lookup table, tools register themselves with the registry, and adding new tools or source filters does not require modifying the agent loop.

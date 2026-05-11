# Problem Decomposition

This document explains how the neo-search problem was broken down, why this architecture was chosen, and what tradeoffs were considered.

## How we broke down the problem

The initiative requires building an agent-driven web search product with:

- A summarized, citation-grounded answer (not a link dump).
- Persistent history and bookmarks.
- An indexed cache that can handle 1000+ results per query without full scans.
- Explicit, structured contracts at every boundary.
- Clear separation between UI, agent, and data.

We broke this down into **four layers** plus a **tooling layer**:

1. **UI layer** — handles presentation and user interaction.
2. **API layer** — exposes an HTTP surface and shapes requests/responses.
3. **Agent layer** — orchestrates searches by selecting and invoking tools, then synthesizing results.
4. **Data layer** — persists history, bookmarks, and cached search results in chunked, indexed form.
5. **Tooling layer** — wraps external APIs (web search) and data-layer operations behind a uniform interface.

The key architectural choice is that **the agent reaches the data layer only through a tool** (the `data-store` tool), not via direct imports. This makes the agent's reach into the rest of the system uniform — everything goes through the tool registry.

The chunking and indexing strategy sits entirely in the data layer, hidden behind the `data-store` tool contract. The agent doesn't know whether results are stored as SQLite rows, JSON files, or something else — it just asks the tool for "page N of query Q" and gets back the results.

## Why this architecture

We chose this architecture because:

### Single seam for the agent's reach

The agent talks to the world through one interface: the tool registry. Whether it needs to fetch live web results or read from the cache, it goes through a registered tool.

This gives us:

- **One retry helper** — the shared `runWithBudget` applies the same transient-error retry policy to every tool, whether it's hitting an external API or reading from disk.
- **One error taxonomy** — every tool returns `Result<T, E>` where `E` has a `kind` discriminant (`transient`, `terminal`, `validation`). The agent treats them uniformly.
- **One cancellation path** — every tool invocation accepts an `AbortSignal`, so the 10s NFR-005 budget can tear down in-flight work uniformly.

If we had made the agent import data-layer modules directly, we'd have two seams (tools for external APIs, direct imports for storage), two retry stories, and two cancellation paths. That sprawl violates the design principle "compose primitives, don't sprawl."

### Swappable layers

Because the agent reaches data through a tool, swapping the data substrate is a change behind the `data-store` tool — the agent and API are unchanged.

For example:

- Today: SQLite + segmented JSON.
- Tomorrow: DuckDB with everything in-database.
- The agent still calls `registry.invoke('data-store', { op: 'cache.read', query, page })` and gets back results. The tool's internals change; the contract does not.

This is what gives FR-024 ("replacing one layer's implementation MUST be possible without modifying the others") its operational meaning. Without the tool-mediated boundary, a substrate swap would be a coordinated change across the agent and the data-layer packages.

### Clear contracts at all four boundaries

FR-021 requires explicit, structured, reusable contracts at four named boundaries. By treating the agent-data edge as a tool-mediated boundary, the four contracts become:

| Boundary       | Contract                                  |
| -------------- | ----------------------------------------- |
| UI ↔ API      | `UiApiAnswerContract` (FR-010)            |
| API ↔ Agent   | `AgentSearchRequestContract`              |
| Agent ↔ Tools | `ToolDescriptorContract` (FR-022)         |
| Agent ↔ Data  | `DataStoreInputContract` (union over ops) |

All four are defined once in `@neo-search/contracts` and imported by both sides. There's no copy of any contract type anywhere else in the codebase.

### No hardcoded flows

NFR-006 requires scalable design: adding new tools or source filters must not require rewriting the agent loop.

We achieve this with:

- **Lookup-table routing** — the agent's source-filter routing is `Record<SourceFilter, RouteHandler>`, not a `switch` statement. Adding a new source filter (e.g. `STARRED`) is a lookup-table entry, not a code path in the loop.
- **Registry-based tool discovery** — tools register themselves with the tooling layer. The agent discovers them via `registry.invoke(name, ...)`. Adding a new tool (e.g. `calculator`) is a registration call, not a modification to the agent loop.

This is what makes the architecture scalable and not brittle.

## Tradeoffs considered

### Option A vs Option B: Direct data-layer imports vs tool-mediated access

**Option A** (not chosen): The agent imports data-layer modules directly. The `Agent ↔ Data` contract is the function signatures of the store interfaces.

**Option B** (chosen): The agent reaches data only through the `data-store` tool. The `Agent ↔ Data` contract is the tool's input/output union.

| Criterion              | Option A                                     | Option B                           |
| ---------------------- | -------------------------------------------- | ---------------------------------- |
| Simplicity (initial)   | Simpler — one fewer indirection.             | More indirection per data access.  |
| Seams for agent reach  | Two (tools, imports).                        | One (tools).                       |
| Retry story            | Two separate paths.                          | One shared `runWithBudget` helper. |
| Substrate swappability | Harder — coordinated change agent + data.    | Easier — swap behind the tool.     |
| Principle alignment    | Violates "compose primitives, don't sprawl." | Honors it.                         |

We chose Option B because the extra indirection cost (negligible for the prototype's workload) is outweighed by the architectural clarity and swappability gains.

### Polyglot stack vs single-language (TypeScript) stack

**Polyglot** (not chosen): UI in TypeScript, agent in Python, data layer in either. Contracts authored in JSON Schema or Protobuf and code-generated into each language.

**Single-language (TypeScript)** (chosen): Everything in TypeScript. Contracts authored once in TypeBox and imported by both sides.

| Criterion           | Polyglot                                           | Single-language (TypeScript)           |
| ------------------- | -------------------------------------------------- | -------------------------------------- |
| Generality          | Supports any language.                             | Locked to TypeScript.                  |
| Tooling overhead    | Code generation pipelines, drift, two test stacks. | One test stack, no codegen.            |
| Contract drift risk | Higher — generated types can drift from source.    | Lower — one source, imported by both.  |
| Prototype scope fit | Overfitting — no FR requires polyglot.             | Right-sized for local prototype scope. |

We chose single-language TypeScript because:

- The initiative is local-prototype scope (OQ-002). There's no current FR that requires Python or another language.
- TypeBox gives us one source of truth per contract (`Type.Object({...})`), static TS types via `Static<typeof Schema>`, and runtime JSON Schema for Fastify's wire validation — all without code generation.
- Applying the principle "minimum viable abstraction," the cost of polyglot (pipelines, drift, dual stacks) is unjustified for the prototype.

If a future requirement needs Python (e.g. a Python-only ML library), that would be a new ADR.

### Chunk size: 100 vs 500 vs 10

**100 results/chunk** (chosen): At the NFR-003 floor of 1000 results and a typical UI page of 25 results, this produces 10 chunks per query. A page read touches at most 1 chunk, satisfying NFR-004 ("strictly fewer than total") with comfortable headroom (1 of 10).

**500 results/chunk** (not chosen): Would produce 2 chunks per query. A 25-result page still touches 1 of 2 chunks, so NFR-004 holds, but the headroom is slim.

**10 results/chunk** (not chosen): Would produce 100 chunks for a 1000-result query, inflating file count and SQLite index size unnecessarily.

| Chunk size | Chunks for 1000 results | Chunks read for page 1 (25 results) | NFR-004 headroom |
| ---------- | ----------------------- | ----------------------------------- | ---------------- |
| 10         | 100                     | 3                                   | 3/100 (good)     |
| 100        | 10                      | 1                                   | 1/10 (good)      |
| 500        | 2                       | 1                                   | 1/2 (slim)       |

We chose 100 because it balances file count (manageable on a developer machine) against per-page cost (narrow reads).

### Index substrate: SQLite vs in-memory hash map vs embedded KV store

**SQLite** (chosen): Already in the substrate for history and bookmarks. One storage daemon (zero, actually — `better-sqlite3` is in-process), one transaction model, one backup strategy.

**In-memory hash map serialized to disk** (not chosen): Would duplicate state and break atomicity with chunk-body writes.

**Embedded KV store (RocksDB, LMDB)** (not chosen): Would add a new dependency for no clear gain — SQLite already handles the prototype's workload comfortably.

We chose SQLite because it's already there and it works.

## References

- **ADR 0001**: Four-layer boundary with the agent reaching data through a tool ([.design/decisions/0001-layer-boundaries.md](../.design/decisions/0001-layer-boundaries.md))
- **ADR 0002**: TypeScript end-to-end with TypeBox as the single contract source ([.design/decisions/0002-typescript-end-to-end.md](../.design/decisions/0002-typescript-end-to-end.md))
- **ADR 0003**: Chunking strategy — fixed 100 results per chunk on ordinal boundary, indexed by SQLite ([.design/decisions/0003-chunking-strategy.md](../.design/decisions/0003-chunking-strategy.md))

## Requirements covered

- **FR-021** — Explicit layer contracts (the "why" for single-source TypeBox contracts).
- **FR-024** — Architectural separation (the "why" for tool-mediated data access).
- **NFR-006** — No hardcoded flows (the "why" for lookup-table routing and registry-based tool discovery).
- **NFR-003** — Large result set capacity (the "why" for chunking).
- **NFR-004** — No full-scan retrieval (the "why" for the index and the 100-result chunk size).

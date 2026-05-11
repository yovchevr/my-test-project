# Agent Design

This document describes the agent's responsibilities, how it makes decisions, and how orchestration works.

## Responsibilities

The agent is the orchestrator that drives a search end-to-end. It:

1. **Receives** an `AgentSearchRequestContract` from the API and returns an `AgentSearchResponseContract`.
2. **Routes** per source filter via a lookup table, not a `switch` statement.
3. **Selects and invokes tools** through the tool registry.
4. **Reacts** to tool results and errors (retry transient errors, surface terminal errors).
5. **Synthesizes** raw results into an `answer_summary` and `references` payload.
6. **Enforces** the per-request agent budget (10s for flows that include a web-search tool call).

The agent does not:

- Import data-layer modules directly — data access goes through the `data-store` tool.
- Issue raw HTTP calls to external services — all external calls go through registered tools.
- Branch on specific query strings or known result shapes.
- Contain per-tool retry loops — the shared `runWithBudget` helper is the only retry path.

## How decisions are made

The agent is **not** a fixed procedural pipeline. It makes decisions based on inputs and results.

### Source-filter routing

The agent's routing is a **lookup table** keyed by source filter:

```
LIVE      → invoke web-search tool → write to data-store → synthesize → return
HISTORY   → invoke data-store tool (read history page) → synthesize → return
BOOKMARK  → invoke data-store tool (read bookmarks) → synthesize → return
```

This is implemented as:

```typescript
const routes: Record<SourceFilter, RouteHandler> = {
  LIVE: handleLiveSearch,
  HISTORY: handleHistoryRead,
  BOOKMARK: handleBookmarkRead,
};

const handler = routes[request.sourceFilter];
return handler(request, context);
```

Adding a new source filter (e.g. `STARRED`) is a lookup-table entry and a route handler — the agent loop body does not change.

### Tool selection

Tools are registered with the tool registry (`@neo-search/tools`). The agent discovers them via `registry.invoke(name, input, signal)` — it does not import tool modules directly.

For example:

```typescript
const result = await registry.invoke('web-search', { query, maxResults }, signal);
```

The registry resolves the name to a registered handler and invokes it. Adding a new tool (e.g. `calculator`) is a registration call, not a modification to the agent loop.

### Retry policy

Tool errors are classified by `kind`:

- **`transient`** — network failure, 5xx, 429. The agent retries up to 2 times with 500ms fixed backoff.
- **`terminal`** — 4xx, malformed response, internal error. The agent surfaces immediately without retry.
- **`validation`** — input schema violation. The agent surfaces immediately.

The retry logic lives in a shared `runWithBudget` helper that wraps every tool invocation:

```typescript
const result = await runWithBudget(
  (signal) => registry.invoke('web-search', input, signal),
  { maxAttempts: 3, backoffMs: 500 },
  { totalMs: 10_000, signal: requestSignal, clock },
);
```

The helper retries on `transient`, stops on `terminal` or `validation`, and cancels when the 10s budget elapses (NFR-005).

### Synthesis invocation

The synthesis step is invoked **uniformly** for every search, including HISTORY and BOOKMARK reads. This keeps the answer-quality contract consistent across source types.

For example, a HISTORY read:

1. Agent invokes `data-store` tool to read history entry N.
2. Agent receives the stored results for that entry.
3. Agent invokes synthesis with `(query, results)`.
4. Agent returns `{ answer_summary, references, results }`.

The user sees a fresh summary even though the results came from the cache, not a live search.

## How orchestration works

The agent's orchestration loop has five steps, executed in order for every search:

### 1. Validate

Validate the incoming `AgentSearchRequestContract` using TypeBox validation. Schema violations surface as `{ ok: false, error: { kind: "validation" } }` immediately.

### 2. Route

Look up the route handler for `request.sourceFilter` in the routing table. The handler encodes the per-source logic:

- **LIVE**: web-search → data-store write → synthesis.
- **HISTORY**: data-store read → synthesis.
- **BOOKMARK**: data-store read → synthesis.

### 3. Invoke tools

Every tool invocation goes through:

```typescript
const result = await runWithBudget(
  (signal) => registry.invoke(toolName, input, signal),
  retryPolicy,
  budget,
);
```

The `runWithBudget` helper:

- Wraps the tool call with retry logic (retry on `transient`, stop on `terminal`).
- Enforces the 10s NFR-005 budget via an `AbortSignal` that fires when the budget elapses.
- Tracks elapsed time with an injected `Clock` (for deterministic testing).

### 4. Synthesize

Invoke the synthesis step with the raw results:

```typescript
const { answer_summary, references } = await synthesize(query, results, budgetMs);
```

The synthesis step:

- Calls the Anthropic API to produce a paragraph or bullet-form summary.
- Places inline citation markers (`[1]`, `[2]`, …) in the summary.
- Returns a `references` list where every entry has non-empty `title`, `url`, `context`.
- Validates the output (every citation resolves to a reference, every reference URL appears in the input results).

Synthesis is a separate component (`services/agent/src/synthesis/`). Changing the model or prompt does not require touching the agent loop.

### 5. Return

Return an `AgentSearchResponseContract`:

```typescript
{ ok: true, value: { answer_summary, references, results, pagination } }
```

or

```typescript
{ ok: false, error: { kind, message, details } }
```

The API maps the `kind` to an HTTP status (422 for `validation`, 502 for `transient`, 500 for `terminal`, 499 for `cancelled`) and shapes the response for the UI.

## The `runWithBudget` discipline (NFR-005)

Every tool invocation is wrapped by `runWithBudget`. This helper:

- **Enforces the 10s budget** — if the total elapsed time exceeds 10s, the helper cancels the in-flight tool call via `AbortSignal` and returns `{ ok: false, error: { kind: "cancelled" } }`.
- **Retries transient errors** — if the tool returns `{ ok: false, error: { kind: "transient" } }`, the helper waits 500ms and retries. Up to 2 retries (3 attempts total: 1 initial + 2 retries).
- **Surfaces terminal errors immediately** — if the tool returns `{ ok: false, error: { kind: "terminal" } }`, the helper returns the error without retry.
- **Uses an injected clock** — the helper reads time from an injected `Clock` interface, not `Date.now()`, so tests can control time deterministically.

This discipline is what makes NFR-005 ("search failure resilience") hold: transient failures are retried within budget, terminal failures are surfaced immediately, and the user never waits more than 10s for a response.

## Example: LIVE search flow

1. User submits query "best coffee in SF" with `sourceFilter: "LIVE"`.
2. API forwards to agent: `{ query: "best coffee in SF", sourceFilter: "LIVE", page: 1, budgetMs: 10000 }`.
3. Agent validates request (passes).
4. Agent looks up `routes["LIVE"]` → `handleLiveSearch`.
5. `handleLiveSearch` invokes `web-search` tool via `runWithBudget`:
   - Tool hits Tavily API, parses response, returns `{ ok: true, value: [result1, result2, ...] }`.
6. `handleLiveSearch` invokes `data-store` tool to write results to cache and append history entry.
7. `handleLiveSearch` invokes synthesis with `(query, results)`:
   - Synthesis calls Anthropic API, produces summary with citations, validates output, returns `{ answer_summary, references }`.
8. Agent returns `{ ok: true, value: { answer_summary, references, results, pagination } }`.
9. API shapes response as JSON and returns to UI.
10. UI renders answer summary, references, and results list.

Total elapsed time: ~2–3s (dominated by Tavily + Anthropic API calls).

## Example: HISTORY search flow

1. User clicks on a history entry.
2. API forwards to agent: `{ query: "best coffee in SF", sourceFilter: "HISTORY", page: 1, budgetMs: 10000 }`.
3. Agent validates request (passes).
4. Agent looks up `routes["HISTORY"]` → `handleHistoryRead`.
5. `handleHistoryRead` invokes `data-store` tool with `{ op: "history.list", page: 1 }`:
   - Tool reads from SQLite, returns `{ ok: true, value: { entries: [entry1, ...] } }`.
6. `handleHistoryRead` extracts the stored results from entry1.
7. `handleHistoryRead` invokes synthesis with `(query, results)`:
   - Synthesis produces a fresh summary and references from the stored results.
8. Agent returns `{ ok: true, value: { answer_summary, references, results, pagination } }`.
9. API shapes response and returns to UI.

Total elapsed time: ~500ms (no external API calls; SQLite read + synthesis only).

## Requirements covered

- **FR-011** — Agent-driven orchestration: the agent decides what tools to invoke based on source filter and results, not a fixed pipeline.
- **FR-013** — Synthesis step: invoked uniformly on every search, including HISTORY and BOOKMARK reads.
- **NFR-005** — Search failure resilience: `runWithBudget` retries transient errors within a 10s budget.
- **NFR-006** — Scalable design: routing is a lookup table, tools register with the registry, adding new tools or source filters does not require modifying the agent loop.

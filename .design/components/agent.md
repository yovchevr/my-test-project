---
title: Agent
read_when: implementing or modifying the orchestration loop, tool selection, source-filter routing, or the request budget
boundary: core
requirements: [FR-011, FR-013, FR-021, FR-022, FR-023, FR-024, NFR-005, NFR-006]
---

# Agent

The orchestrator that drives a search end-to-end: source-filter routing, tool selection, tool invocation, retry handling, the synthesis step, and the request budget. Lives in `services/agent` (LangGraph + MCP SDK + Anthropic SDK per `technology/tech-stack.md`).

## Responsibilities

- Receive an `AgentSearchRequestContract` from the API and return an `AgentSearchResponseContract` (FR-021, API ↔ Agent boundary).
- Drive search execution as an agent — select tools, invoke them through the registry, react to results and errors — not as a fixed procedural pipeline (FR-011, NFR-006).
- Route per source filter via a lookup table (`Record<SourceFilter, RouteHandler>`), not a `switch` statement (NFR-006, I-22, I-24).
- Invoke the synthesis step on every search, including HISTORY and BOOKMARK reads, so the answer-quality contract stays uniform across source types (FR-013).
- Enforce the per-request agent budget (10s for any flow that includes a `web-search` tool call per NFR-005). Propagate the request `AbortSignal` to every tool invocation (I-25).
- Apply the shared retry helper for transient tool errors (2 retries, fixed 500ms backoff, bounded by the request budget per NFR-005 / OQ-001). The helper MUST NOT be reimplemented per tool (I-27).
- Convert tool errors into the agent ↔ API contract's structured error variants (`validation`, `terminal`, `transient`, `cancelled`) per FR-023.

## What this component MUST NOT do

- It MUST NOT import data-layer modules directly. Data access goes through the `data-store` tool in the tooling layer (I-18, FR-022).
- It MUST NOT issue raw HTTP calls to external services. All external calls go through registered tools (I-19, FR-022).
- It MUST NOT branch on specific query strings or specific known result shapes (I-22, NFR-006).
- It MUST NOT contain a per-tool retry loop. The shared `runWithBudget(fn, retryPolicy, signal)` helper is the only legal retry path.
- It MUST NOT be implementable as a thin pass-through HTTP wrapper (FR-011 acceptance criterion, constraints.md).

## Orchestration loop shape

The agent's loop is the same five steps for every search, regardless of source filter:

1. **Validate** the incoming `AgentSearchRequestContract` (TypeBox validation).
2. **Route** via the source-filter lookup table:
   - `LIVE`: invoke `web-search` tool → write to `data-store` (history append, cache write) → forward parsed results to the synthesis step.
   - `HISTORY`: invoke `data-store` tool (read history page) → forward to the synthesis step.
   - `BOOKMARK`: invoke `data-store` tool (read bookmarks) → forward to the synthesis step.
3. **Invoke tools** through the registry (`@neo-search/tools` registry). Every invocation goes through `runWithBudget` and respects the request `AbortSignal`.
4. **Synthesize** raw results into `answer_summary` + `references` via the synthesis component (FR-013). Synthesis is invoked uniformly even when the source is HISTORY or BOOKMARK.
5. **Return** an `AgentSearchResponseContract` (success or structured error).

Step 2 is a lookup, not a switch. Adding a new source filter is an entry in the lookup table plus a route handler — the loop body MUST NOT change (I-23, I-24).

## Public contract

The agent publishes two contracts:

- **API ↔ Agent** (`AgentSearchRequestContract` / `AgentSearchResponseContract`): the in-process shape between the API and the agent. Defined in `@neo-search/contracts/api-agent.ts`.
- **Agent ↔ Tools** (`ToolInvocationContract`, `ToolErrorContract`): the uniform shape every tool invocation goes through. Defined in `@neo-search/contracts/agent-tools.ts`.

Illustrative shape (the canonical definition lives in `@neo-search/contracts`):

```ts
export const AgentSearchRequestContract = Type.Object({
  query: Type.String({ minLength: 1 }),
  sourceFilter: SourceFilterEnum, // LIVE | HISTORY | BOOKMARK
  page: Type.Integer({ minimum: 1 }),
  budgetMs: Type.Integer({ minimum: 1, maximum: 60_000, default: 10_000 }),
});

export const AgentSearchResponseContract = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: SearchResponseValueContract }),
  Type.Object({ ok: Type.Literal(false), error: AgentErrorContract }),
]);

export const AgentErrorContract = Type.Object({
  kind: Type.Union([Type.Literal("validation"), Type.Literal("terminal"), Type.Literal("transient"), Type.Literal("cancelled")]),
  message: Type.String(),
  details: Type.Optional(Type.Unknown()),
});
```

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | `AgentSearchRequestContract` validated at the entry point. |
| Outputs | `AgentSearchResponseContract` — always a discriminated union. |
| Idempotency | LIVE searches are idempotent within a 5s window via the API's `clientRequestId` deduplication; HISTORY and BOOKMARK reads are inherently idempotent. The agent itself does not deduplicate — that is the API's job. |
| Versioning | The two contracts version with `@neo-search/contracts`. Loop-shape changes that affect the contract require a superseding ADR. |
| Cancellation | Every tool invocation MUST receive an `AbortSignal` derived from the request budget. The 10s NFR-005 budget MUST cancel all in-flight tool work when exceeded. |

## Variation accommodated

- **Tool registry** — adding a new tool (per FR-022) MUST be possible without modifying the agent's main loop. The tool registers itself with `@neo-search/tools`; the agent discovers it via the registry. (NFR-006, I-23.)
- **Source filter** — adding a new source filter (e.g. a hypothetical `STARRED`) is an entry in the routing lookup plus a route handler. The synthesis step MUST NOT be modified. (NFR-006, I-24.)
- **Synthesis model** — the synthesis component is a separate file (`components/synthesis.md`); replacing the model or prompt MUST NOT require touching the agent loop.

## Variation NOT accommodated

- **Per-user / per-tenant routing** — the system is single-user (OQ-005). The agent MUST NOT carry user-id or session-id parameters (I-14).
- **Per-region / per-zone routing** — local prototype only (OQ-002).

## Retry helper

The shared `runWithBudget` helper, defined in `services/agent/src/run-with-budget.ts`, is the single source of retry behavior. Signature (illustrative):

```ts
function runWithBudget<T>(
  fn: (signal: AbortSignal) => Promise<Result<T, ToolError>>,
  policy: { maxAttempts: 3; backoffMs: 500 },          // 1 initial + 2 retries
  budget: { totalMs: 10_000; signal: AbortSignal; clock: Clock },
): Promise<Result<T, AgentError>>;
```

- The helper MUST treat `error.kind === "transient"` as retriable and any other `kind` as non-retriable.
- Backoff MUST be a fixed 500ms wait between attempts via the injected `clock` (no exponential ramp, no jitter, per NFR-005 / OQ-001).
- The helper MUST stop and return `{ ok: false, error: { kind: "cancelled" } }` when the budget timer elapses, even if a retry is still pending (I-27).
- Other tools MAY adopt the same defaults but MUST document any deviation per FR-023.

## Layering

`agent` sits between the API and the tooling layer. Its only legal upstream is `services/api` via the API ↔ Agent contract; its only legal downstream is `@neo-search/tools` via the agent ↔ tools contract. It MUST NOT import data-layer modules directly (I-18).

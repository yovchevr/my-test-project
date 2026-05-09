---
title: web-search tool
read_when: implementing or modifying the live web search integration
boundary: periphery
requirements: [FR-012, FR-022, FR-023, NFR-005]
---

# `web-search` tool

The registered tool that performs live web search and parses the response into the system's structured `Result` shape. Lives in `packages/tools-web-search` (Tavily + undici per `technology/tech-stack.md`).

## Responsibilities

- Accept a `WebSearchInputContract` (query, max results, request `AbortSignal`) and call the configured web search provider.
- Parse the provider's response into the structured `Result` shape (title, snippet, domain, URL) used everywhere downstream (FR-009 reference shape, FR-016 cache shape).
- Surface failures as structured `ToolErrorContract` values per the rule set in `components/tools-layer.md`:
  - Network error / 5xx / rate limit → `kind: "transient"` (invites the agent's retry helper).
  - Malformed response / 4xx (other than rate limit) / missing API key → `kind: "terminal"` (no retry).
  - Input that does not match the input schema → `kind: "validation"`.
- Honor the request `AbortSignal` so the agent's 10s NFR-005 budget can interrupt in-flight HTTP work.

## What this component MUST NOT do

- It MUST NOT carry its own retry loop. Retries are owned by the agent's `runWithBudget` helper (see `components/agent.md`). The tool surfaces transient errors and lets the helper decide.
- It MUST NOT touch the data layer. Caching the result is the `data-store` tool's job, invoked separately by the agent's LIVE-search route handler.
- It MUST NOT throw across the tool boundary. Every code path catches internally and returns a `Result<WebSearchOutput, ToolError>`.
- It MUST NOT be replaced with a hardcoded mock for the production prototype (FR-012 acceptance criterion, constraints.md). Mocks are for tests only and live in `__fixtures__/`.

## Public contract

```ts
// packages/contracts/src/tools/web-search.ts
export const WebSearchInputContract = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 2000 }),
  maxResults: Type.Integer({ minimum: 1, maximum: 1000, default: 50 }),
});

export const WebSearchOutputContract = Type.Object({
  results: Type.Array(ResultCardContract),  // title, snippet, domain, url
  fetchedAt: Type.String({ format: "date-time" }),
  provider: Type.Literal("tavily"),
});
```

Both contracts MUST be exported from `@neo-search/contracts` and consumed by both the tool implementation and the agent (I-21, I-34).

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | Validated against `WebSearchInputContract` by the registry before the handler runs. |
| Outputs | Validated against `WebSearchOutputContract` by the registry after the handler returns. |
| Idempotency | The same query within a short window SHOULD return the same upstream provider response, but no idempotency guarantee is owned by this tool. The cache layer (`data-store` tool, search cache) is what makes repeated reads cheap. |
| Versioning | Provider is pinned to `tavily` in this design pass (`technology/tech-stack.md`). Swapping the provider behind the same input/output schemas is a periphery change; changing the schemas is a breaking change requiring a superseding ADR. |
| Cancellation | undici's `fetch` MUST receive the `AbortSignal` so the connection is torn down when the agent budget elapses. |

## Failure taxonomy (NFR-005 / FR-023)

| Cause | Tool error `kind` | Agent reaction |
| --- | --- | --- |
| `fetch` network error (DNS, ECONNRESET, etc.) | `transient` | Retried by `runWithBudget` (up to 2 retries, 500ms backoff, 10s budget). |
| HTTP 5xx | `transient` | Retried as above. |
| HTTP 429 (rate limited) | `transient` | Retried as above. |
| HTTP 4xx (other than 429) | `terminal` | Surfaced to the user as FR-005 error state. |
| Missing / invalid API key | `terminal` | Surfaced to the user as FR-005 error state. |
| Response body fails the response schema | `terminal` | Surfaced as FR-005. |
| `AbortSignal` fires mid-request (budget exceeded) | (no return — the registry converts this into a `cancelled` agent error) | Surfaced to the user as FR-005. |
| Input fails `WebSearchInputContract` | `validation` | Surfaced to the API as a 400. |

This table is the contract. Any new failure mode the implementation discovers MUST be slotted into one of these buckets, never into a new ad-hoc category.

## Configuration

- `TAVILY_API_KEY` env var MUST be set; absence is a `terminal` error at the first invocation.
- `WEB_SEARCH_DEFAULT_MAX_RESULTS` env var MAY override the default `maxResults`.
- The provider name (`tavily`) is currently hardcoded as the only supported value; switching providers is an ADR moment.

## Variation accommodated

- **Provider** — Tavily today; the implementation MAY be swapped for Brave Search or Serper behind the same contract without touching the agent.
- **`maxResults` per call** — a per-invocation parameter, not a tool-level constant.

## Variation NOT accommodated

- **Multiple providers in parallel** — the prototype calls one provider per invocation. Aggregating across providers is a future feature.
- **Per-user API keys** — single-user prototype (OQ-005). One key, env-supplied.

## Layering

`web-search` is registered with the tooling layer. Its only legal upstream is the registry (which the agent calls). It MAY make outbound HTTP calls to the configured provider. It MUST NOT touch the data layer.

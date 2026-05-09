---
title: Search API
read_when: implementing or modifying the HTTP surface, request/response shaping, or the UI ↔ API contract
boundary: core
requirements: [FR-010, FR-021, FR-024, FR-005, FR-023, FR-025]
---

# Search API

The HTTP surface the UI talks to. Lives in `services/api` (Fastify + TypeBox per `technology/tech-stack.md`).

## Responsibilities

- Expose the four endpoints listed in `components/ui-shell.md` (`/api/search`, `/api/bookmarks` POST/GET, `/api/history`).
- Validate every request payload against the `@neo-search/contracts` schemas at the wire boundary (FR-010, FR-021). A request whose payload does not match the contract MUST be rejected with a structured 400 response, never reach the agent.
- Translate the API ↔ Agent contract into the UI ↔ API contract on the response path. Both contracts are defined exactly once in `@neo-search/contracts` (I-21, I-34); the API MUST NOT hand-write either shape.
- Convert agent-layer errors (FR-023 terminal, validation, transient-exhausted) into the structured `{ ok: false, error: { kind, message } }` shape on the wire. An unstructured 500 with no body MUST NOT be returned (I-28).
- Apply the `client_request_id` deduplication described in `components/ui-shell.md` for write endpoints. A repeated request_id within 5s MUST return the cached response, not re-invoke the agent.

## What this component MUST NOT do

- It MUST NOT touch the data layer (I-17, FR-024). The only legal seam is the agent.
- It MUST NOT call tools directly. Tools are the agent's responsibility (I-19).
- It MUST NOT perform retries on transient agent failures. Retry posture lives in the agent (NFR-005). The API just translates the surfaced result.
- It MUST NOT define its own request/response types. They MUST be imported from `@neo-search/contracts` (I-34).
- It MUST NOT gate any operation behind authentication. There is no auth regime per OQ-004 (I-15).

## Public contract

The API publishes two contracts that overlap:

- **UI ↔ API** (FR-010, FR-021): the wire shape between the browser and the API. This is what `apps/ui` consumes.
- **API ↔ Agent** (FR-021): the in-process shape between the API and the agent layer. This is what `services/agent` consumes.

Both contracts MUST live in `@neo-search/contracts` and MUST be derived from a single TypeBox source per boundary. Example types (illustrative):

```ts
// packages/contracts/src/ui-api.ts
export const SearchRequestContract = Type.Object({
  query: Type.String({ minLength: 1, maxLength: 2000 }),
  sourceFilter: Type.Union([Type.Literal("LIVE"), Type.Literal("HISTORY"), Type.Literal("BOOKMARK")]),
  page: Type.Integer({ minimum: 1 }),
  clientRequestId: Type.Optional(Type.String({ format: "uuid" })),
});

export const ReferenceEntryContract = Type.Object({
  id: Type.String(),
  title: Type.String({ minLength: 1 }),
  url: Type.String({ format: "uri" }),
  context: Type.String({ minLength: 1 }),
});

export const UiApiAnswerContract = Type.Object({
  answer_summary: Type.String({ minLength: 1 }),
  references: Type.Array(ReferenceEntryContract),
  results: Type.Array(ResultCardContract),
  pagination: Type.Object({ page: Type.Integer(), totalChunks: Type.Integer(), hasMore: Type.Boolean() }),
});
```

The full contract module is exported from `@neo-search/contracts/index.ts`. An example payload MUST be published as part of the FR-025 deliverable.

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | Validated against TypeBox schemas at the Fastify boundary; rejection produces a structured 400. |
| Outputs | Always one of `{ ok: true, value: <contract> }` or `{ ok: false, error: { kind, message } }`. |
| Idempotency | Reads are idempotent. Writes are idempotent within a 5s window via `clientRequestId`. |
| Versioning | Contract version = `@neo-search/contracts` package version. Breaking changes require a superseding ADR (I-33). |
| Cancellation | Every handler accepts the request `AbortSignal` and forwards it to the agent (I-25). |

## Layering

`search-api` sits between the UI and the agent. Its only legal upstream is HTTP requests from `apps/ui`; its only legal downstream is `services/agent` via the API ↔ Agent contract.

## Error surface

Per FR-023, the API MUST translate the agent's structured error variants into HTTP status codes:

| Agent error `kind` | HTTP status | Body shape |
| --- | --- | --- |
| `validation` | 400 | `{ ok: false, error: { kind: "validation", message, details } }` |
| `terminal` | 502 | `{ ok: false, error: { kind: "terminal", message } }` |
| `transient` (after retry exhaustion) | 503 | `{ ok: false, error: { kind: "transient_exhausted", message } }` |
| `cancelled` (request budget exceeded) | 504 | `{ ok: false, error: { kind: "cancelled", message } }` |
| (unexpected throw) | 500 | `{ ok: false, error: { kind: "internal", message: "internal error" } }` |

The 500 case is the only unstructured fallback and SHOULD never fire in practice — every agent-layer error is supposed to be structured (I-26).

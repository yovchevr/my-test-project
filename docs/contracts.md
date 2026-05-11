# Contracts

This document lists the four FR-021 contracts that govern the layer boundaries and includes an example payload.

## Overview

FR-021 requires explicit, structured, reusable contracts at four boundaries. All four contracts are defined in the `@neo-search/contracts` package using TypeBox and imported by both sides of each boundary. There is no copy of any contract type anywhere else in the codebase.

ADR 0002 pins TypeBox as the single contract source: one TypeBox schema produces both static TypeScript types (via `Static<typeof Schema>`) and runtime JSON Schema (for Fastify's wire validation and in-process validation).

## The four contracts

### 1. UI ↔ API contract

**Modules**: `@neo-search/contracts/ui-api.ts`

**Participants**: `apps/ui` ↔ `services/api`

**Purpose**: Governs the HTTP surface the UI talks to. Defines the request and response shapes for `/api/search` and related endpoints.

**Key schemas**:

- `UiApiSearchRequestContract` — the JSON body posted to `/api/search` (query, sourceFilter, page).
- `UiApiAnswerContract` — the JSON response returned to the UI (answer_summary, references, results, pagination). This is the FR-010 contract.
- `UiApiErrorContract` — the error response shape (kind, message, details).

**Wire transport**: HTTP/JSON over `fetch` (browser → API).

### 2. API ↔ Agent contract

**Modules**: `@neo-search/contracts/api-agent.ts`

**Participants**: `services/api` ↔ `services/agent`

**Purpose**: Governs the in-process call from the API to the agent. The API validates the UI's request, translates it to `AgentSearchRequestContract`, forwards it to the agent, and shapes the agent's response back into `UiApiAnswerContract`.

**Key schemas**:

- `AgentSearchRequestContract` — the input to the agent's `runSearch` function (query, sourceFilter, page, budgetMs).
- `AgentSearchResponseContract` — the output from the agent (a discriminated union: `{ ok: true, value }` or `{ ok: false, error }`).
- `AgentErrorContract` — the error variant (kind: validation | terminal | transient | cancelled).

**Transport**: In-process function call (within `services/api`'s composition root, the agent is imported as a module).

### 3. Agent ↔ Tools contract

**Modules**: `@neo-search/contracts/agent-tools.ts`

**Participants**: `services/agent` ↔ `packages/tools` (registry) ↔ tool handlers (`packages/tools-web-search`, `packages/tools-data-store`)

**Purpose**: Governs the uniform interface every tool must implement. The agent invokes tools through `registry.invoke(name, input, signal)`; the registry resolves `name` to a registered handler and invokes it. Every handler returns a structured `Result<T, E>` where `E` is a `ToolErrorContract`.

**Key schemas**:

- `ToolDescriptorContract` — the metadata every tool must provide (name, description, inputSchema, outputSchema).
- `ToolHandlerContract` — the function signature every tool handler implements: `(input, context) => Promise<Result<output, ToolError>>`.
- `ToolErrorContract` — the error shape (kind: transient | terminal | validation, message, details).

**Transport**: In-process function call (agent → registry → handler).

**Subtypes**:

- `WebSearchInputContract` / `WebSearchOutputContract` — the input/output shapes for the `web-search` tool (`@neo-search/contracts/tools/web-search.ts`).
- `DataStoreInputContract` / `DataStoreOutputContract` — the input/output shapes for the `data-store` tool (`@neo-search/contracts/tools/data-store.ts`). The input is a discriminated union over `op` (history.append, history.list, bookmark.save, bookmark.list, bookmark.get, cache.write, cache.read).

### 4. Agent ↔ Data contract

**Modules**: `@neo-search/contracts/tools/data-store.ts` (the data-store tool's input/output union) + `@neo-search/contracts/data.ts` (record types)

**Participants**: `services/agent` ↔ `packages/tools-data-store` ↔ `packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`

**Purpose**: Governs the agent's access to the data layer. Per ADR 0001, the agent reaches the data layer **only** through the `data-store` tool. This makes the Agent ↔ Data contract the `data-store` tool's input/output union.

**Key schemas**:

- `DataStoreInputContract` — a discriminated union over `op`. Each `op` value encodes a data-layer operation (e.g. `{ op: "cache.read", query, page }` or `{ op: "history.append", entry }`).
- `DataStoreOutputContract` — a discriminated union over the same `op` values. Each output variant matches the corresponding input.
- Record types in `@neo-search/contracts/data.ts` — `HistoryEntry`, `BookmarkEntry`, `ResultCard`, `Pagination`.

**Transport**: In-process function call (agent → `data-store` tool → data-layer package methods).

## Example payload

Below is the example UI ↔ API answer payload from FR-010, validated against `UiApiAnswerContract` in `packages/contracts/src/__tests__/ui-api.spec.ts`:

```json
{
  "answer_summary": "TypeBox is a TypeScript-first JSON Schema builder pinned at 0.33.17 in this project [1]. Fastify consumes its schemas natively for request validation [2].",
  "references": [
    {
      "id": "ref-typebox",
      "title": "TypeBox - JSON Schema in TypeScript",
      "url": "https://github.com/sinclairzx81/typebox",
      "context": "Source schema author tool used by @neo-search/contracts for the FR-021 boundary types."
    },
    {
      "id": "ref-fastify",
      "title": "Fastify - Validation and Serialization",
      "url": "https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/",
      "context": "Documents Fastify's native JSON Schema validation hook used at the UI to API wire boundary."
    }
  ],
  "results": [
    {
      "title": "TypeBox - JSON Schema in TypeScript",
      "snippet": "TypeBox provides a fluent API for composing JSON Schema documents that double as TypeScript types via Static<T>.",
      "domain": "github.com",
      "url": "https://github.com/sinclairzx81/typebox"
    },
    {
      "title": "Fastify - Validation and Serialization",
      "snippet": "Fastify uses Ajv internally and accepts JSON Schema documents directly on route definitions.",
      "domain": "fastify.dev",
      "url": "https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/"
    }
  ],
  "pagination": {
    "page": 1,
    "totalChunks": 1,
    "hasMore": false
  }
}
```

This payload satisfies FR-009 (every reference has non-empty title, url, context), FR-008 (every citation marker `[N]` resolves to a reference), and FR-007 (the answer_summary is a natural-language paragraph addressing the query, not a flat URL list).

The contract test (`packages/contracts/src/__tests__/ui-api.spec.ts`) asserts this payload validates against `UiApiAnswerContract` and that the embedded citation markers resolve to the references list.

## Single source of truth

Every contract is defined exactly once in `@neo-search/contracts` and imported by both sides. For example:

- The UI imports `UiApiAnswerContract` from `@neo-search/contracts/ui-api` to type its API client.
- The API imports the same `UiApiAnswerContract` to validate its response at the wire boundary (Fastify's `schema.response[200]` hook).

There is no duplication, no drift, and no manual sync. This is what FR-021's "reusable / single definition" clause means in practice.

An ESLint rule (`no-restricted-syntax`) forbids any package other than `@neo-search/contracts` from defining types that end in `Contract`. This is a structural guard against drift.

## Requirements covered

- **FR-010** — UI ↔ API answer contract: `UiApiAnswerContract` defines the wire shape, validated by both sides.
- **FR-021** — Explicit layer contracts: all four boundaries are governed by explicit, structured, reusable schemas authored in `@neo-search/contracts`.
- **ADR 0002** — TypeBox as single contract source: one TypeBox schema produces both static TS types and runtime JSON Schema.

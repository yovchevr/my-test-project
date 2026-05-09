---
title: Tooling layer
read_when: registering a new tool, modifying the tool registry, or changing the tool invocation contract
boundary: core
requirements: [FR-021, FR-022, FR-023, NFR-006]
---

# Tooling layer

The MCP-style tooling layer that exposes invocable tools to the agent through a uniform interface. Lives in `packages/tools` (registry) plus `packages/tools-<name>` (one package per concrete tool). Built on `@modelcontextprotocol/sdk` per `technology/tech-stack.md`.

## Responsibilities

- Maintain the tool **registry** that the agent consults at startup. Every registered tool MUST satisfy the agent ↔ tools contract from `@neo-search/contracts/agent-tools.ts` (FR-022, FR-021).
- Enforce the documented input schema, output schema, and error shape for every tool invocation (FR-021, FR-023). A tool whose handler returns a value that fails its output schema MUST be treated as a `terminal` error by the agent.
- Provide the only legal seam through which the agent reaches external services (web search) or the data layer (history / bookmarks / cache). The agent MUST NOT bypass the registry (I-19, FR-024).
- Ship at minimum two registered tools: `web-search` and `data-store` (FR-022 acceptance criterion). Additional tools MAY be registered later without modifying the agent loop (NFR-006, I-23).

## What this component MUST NOT do

- It MUST NOT contain business logic. The registry routes calls; the per-tool packages implement them.
- It MUST NOT define its own copy of the agent ↔ tools contract — the shape lives in `@neo-search/contracts` (I-34).
- It MUST NOT carry per-tool retry logic. Retries are the agent's job via `runWithBudget` (see `components/agent.md`). Tools MAY surface a `transient` error to *invite* retry, but they MUST NOT loop internally.
- It MUST NOT throw across the tool boundary. Every handler MUST catch internally and return a structured `ToolErrorContract` (I-26).

## Public contract

Two pieces:

### 1. The tool interface every tool MUST implement

```ts
// packages/contracts/src/agent-tools.ts
export const ToolDescriptorContract = Type.Object({
  name: Type.String({ pattern: "^[a-z][a-z0-9-]*$" }),  // e.g. "web-search", "data-store"
  description: Type.String({ minLength: 1 }),
  inputSchema: Type.Unknown(),    // JSON Schema describing the input
  outputSchema: Type.Unknown(),   // JSON Schema describing the output
});

export const ToolErrorContract = Type.Object({
  kind: Type.Union([Type.Literal("transient"), Type.Literal("terminal"), Type.Literal("validation")]),
  message: Type.String(),
  cause: Type.Optional(Type.Unknown()),
});

export type ToolHandler<I, O> = (input: I, signal: AbortSignal) => Promise<Result<O, ToolError>>;
```

A tool registers itself by exporting `{ descriptor: ToolDescriptor, handler: ToolHandler }`.

### 2. The registry contract the agent calls

```ts
// packages/tools/src/registry.ts
export interface ToolRegistry {
  list(): readonly ToolDescriptor[];
  invoke<I, O>(name: string, input: I, signal: AbortSignal): Promise<Result<O, ToolError>>;
}
```

The agent obtains a `ToolRegistry` instance at startup. Tool selection is by `name` lookup in the registry (string key) — never by direct import of the tool's module (FR-022, NFR-006).

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | Validated against the tool's `inputSchema` before the handler runs. A schema mismatch MUST surface as `kind: "validation"`. |
| Outputs | Validated against the tool's `outputSchema` after the handler returns. A schema mismatch MUST surface as `kind: "terminal"` (the tool returned malformed data — that is the tool's bug, not transient). |
| Idempotency | Per-tool. Read tools MUST be idempotent. Write tools MUST document their idempotency posture in their own component doc (e.g. `data-store` is idempotent on history append within a 5s window). |
| Versioning | Each tool's input/output schemas version with `@neo-search/contracts`. Adding a new tool is a non-breaking change. Modifying an existing tool's schema is a breaking change requiring a superseding ADR (I-33). |
| Cancellation | Every handler MUST honor the `AbortSignal` and stop in-flight work when it fires. |

## How tools are registered

A tool package exports a registration function:

```ts
// packages/tools-web-search/src/index.ts
import { defineTool } from "@neo-search/tools";
export const webSearchTool = defineTool({
  descriptor: { name: "web-search", description: "Live web search", inputSchema, outputSchema },
  handler: async (input, signal) => { /* ... */ },
});
```

The composition root (in `services/agent/src/main.ts`) imports each tool's registration and calls `registry.register(tool)`. **No code in the agent loop refers to a specific tool name** — the agent picks the tool name from the route handler's lookup table (`components/agent.md`).

## Registered tools (this design pass)

| Tool name | Package | Component doc | Role |
| --- | --- | --- | --- |
| `web-search` | `packages/tools-web-search` | `components/web-search-tool.md` | Live web search via Tavily; satisfies FR-012 / NFR-005. |
| `data-store` | `packages/tools-data-store` | `components/data-store-tool.md` | Read/write facade over the data layer (history, bookmarks, search cache); satisfies FR-022's "data storage / retrieval tool" clause. |

## Variation accommodated

- **Adding a new tool** — register it through `defineTool` and add the registration call in the composition root. The agent loop MUST NOT change (NFR-006, I-23, FR-022).
- **Replacing a tool's implementation** — swap the package behind the same `name` and `inputSchema` / `outputSchema`. The agent and contracts MUST NOT change.

## Variation NOT accommodated

- **Per-user tool registries** — the system is single-user (OQ-005). One global registry; no per-session or per-user tool sets.
- **Network-served tools (separate MCP server processes)** — the prototype runs in-process for OQ-002 simplicity. Moving to out-of-process MCP servers is a future ADR if it ever becomes necessary.

## Layering

`tools-layer` sits between the agent and the data layer / external services. Its only legal upstream is `services/agent`; its legal downstreams are the data-layer modules (via `data-store`) and external HTTP (via `web-search`). It MUST be the only component permitted to talk to external APIs or to import data-layer modules (FR-024).

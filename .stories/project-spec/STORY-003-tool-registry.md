---
id: STORY-003
title: Build the MCP-style tool registry
initiative: .initiatives/project_spec.md
requirements: [FR-021, FR-022, FR-023]
design_refs:
  - .design/components/tools-layer.md
  - .design/foundation/conventions.md
  - .design/foundation/architecture.md
  - .design/decisions/0001-layer-boundaries.md
status: ready
points: 3
depends_on: [STORY-002]
external_depends_on: []
wave: 3
---

## Goal / user value
Provide the seam every agent invocation goes through: a `@neo-search/tools` package that exposes a `ToolRegistry` plus a `defineTool` helper. Tools register themselves with a descriptor (name, description, input/output JSON Schemas) and a handler returning `Result<O, ToolError>`. The registry validates input against `inputSchema` before the handler runs, validates output after, and translates schema mismatches into the right `ToolErrorContract` `kind`. This is the structural property that makes FR-022's "agent invokes tools through the registry only" enforceable and FR-023's transient/terminal/validation taxonomy uniform across every tool.

## Context
Per ADR 0001 the agent's only seam to the rest of the world is the registry — both external HTTP (web search) and storage (data-store) flow through it. Per `tools-layer.md` the registry is stateless, contains no business logic, and MUST NOT throw across the tool boundary (I-26). Per `foundation/conventions.md` retries live exclusively in the agent's `runWithBudget` (STORY-011) — the registry MUST NOT loop. The registry is built on `@modelcontextprotocol/sdk@1.0.4` for the documented MCP-style tool interface, run in-process per OQ-002.

## Scope
- New package `@neo-search/tools` at `packages/tools/`. Public surface: `defineTool`, `createRegistry`, `ToolRegistry` interface, `ToolNotFoundError`.
- `defineTool({ descriptor, handler })` — typed by `<I, O>` derived from the descriptor's input/output schemas (TypeBox `Static<>`); returns a `RegisteredTool<I, O>`.
- `createRegistry()` returns a `ToolRegistry` with `register(tool)`, `list(): readonly ToolDescriptor[]`, and `invoke<I, O>(name, input, signal): Promise<Result<O, ToolError>>`.
- Input validation: `invoke` validates `input` against the descriptor's `inputSchema` (TypeBox compiled validator). Mismatch → `Result<O, { kind: "validation", message }>`. Handler is NOT called.
- Output validation: after the handler returns `{ ok: true, value }`, validate `value` against `outputSchema`. Mismatch → `{ ok: false, error: { kind: "terminal", message } }`. (A schema-violating output is the tool's bug, not transient — per `tools-layer.md`.)
- Throw conversion: if a handler throws (despite the contract requiring it not to), the registry MUST catch the throw and return `{ ok: false, error: { kind: "terminal", message } }` with the error's stack in `cause`. Per I-26.
- Cancellation: `invoke` MUST forward the provided `AbortSignal` unchanged to the handler. If the signal fires during input/output validation (rare), MUST return `{ ok: false, error: { kind: "terminal", message: "cancelled-during-validation" } }` — the agent's `runWithBudget` (STORY-011) is what creates a derived signal; the registry only forwards.
- Unique names: `register` MUST throw at startup if a tool's `name` is already registered. (Startup throw is fine; per-invocation throw is what's banned.)
- Logging: per `foundation/conventions.md`, every invoke MUST emit a structured `tools.invoked` log with `name`, `outcome`, `validationFailedOn` if applicable.

## Out of scope / non-goals
- No retry logic (STORY-011's `runWithBudget`).
- No specific tools (STORY-009 is `web-search`, STORY-010 is `data-store`).
- No out-of-process MCP server transport — in-process per OQ-002, deferred per `tools-layer.md` "Variation NOT accommodated".

## Acceptance criteria
- `@neo-search/tools` MUST export `defineTool`, `createRegistry`, and the `ToolRegistry` interface from its `src/index.ts`.
- A registered tool whose handler returns `{ ok: true, value }` where `value` matches `outputSchema` MUST cause `invoke` to return that same `Result` unchanged.
- A registered tool whose handler returns `{ ok: false, error }` MUST cause `invoke` to forward the error unchanged.
- An `invoke(name, input, signal)` call where `input` fails the tool's `inputSchema` MUST return `{ ok: false, error: { kind: "validation", message } }` AND the handler MUST NOT be called (asserted by a spy).
- An `invoke` call where the handler returns a value that fails `outputSchema` MUST return `{ ok: false, error: { kind: "terminal", message } }`.
- An `invoke` call where the handler throws MUST return `{ ok: false, error: { kind: "terminal", message } }` and the request MUST NOT crash.
- An `invoke` call for an unknown tool name MUST return `{ ok: false, error: { kind: "validation", message: "unknown-tool: <name>" } }`.
- `register` MUST throw at registration time if the same `name` is registered twice; per-invocation throws MUST NOT happen.
- The registry MUST NOT contain a retry loop, a backoff timer, or any reference to `setTimeout` outside the test harness.
- `tsc --noEmit` and `eslint` MUST pass on the package.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- Public API documented via TSDoc on every export per `foundation/conventions.md`.

## Test plan
- Unit (`packages/tools/src/registry.test.ts`): all eight acceptance criteria as table-driven cases; spy on the handler to assert "not called when input invalid".
- Integration: not applicable at this layer; STORY-011 covers agent ↔ registry integration.
- E2E: not applicable.
- Adversarial / NFR coverage: NFR-006 — assert `defineTool` does not let a tool reference the registry's internals (e.g. attempt to register a tool whose handler imports `packages/tools/src/internal/`; the package's `exports` field MUST forbid this — covered by STORY-001's `exports` config and re-asserted in STORY-018). FR-023 — the four error variants (`validation`, `terminal`, `transient`, `cancelled`) are uniformly producible; a fault-injection test asserts each variant survives a round-trip through the registry without lossy conversion.

## Affected design surface
- `.design/components/tools-layer.md` — implements the registry contract documented here.
- `.design/foundation/conventions.md` — the no-throw rule and structured-result rule applied verbatim.
- `.design/decisions/0001-layer-boundaries.md` — confirms the registry is the single seam.

## Dependencies
- **Depends on**: STORY-002 (consumes `ToolDescriptorContract`, `ToolErrorContract`, `ToolHandler`, `Result<T,E>` from `@neo-search/contracts`).
- **Enables**: STORY-009 (registers `web-search`), STORY-010 (registers `data-store`), STORY-011 (agent calls `registry.invoke`), STORY-018 (boundary lint + contract test gate).

## Risks & assumptions
- Risk: the MCP SDK's in-process registration ergonomics may not match `defineTool` 1:1. Mitigation: `defineTool` wraps the SDK; the public surface stays as documented even if the internal call shape differs.
- Assumption: the budget-derived `AbortSignal` always comes from the agent (STORY-011); the registry is signal-agnostic.

## Source excerpts
> The agent obtains a `ToolRegistry` instance at startup. Tool selection is by `name` lookup in the registry (string key) — never by direct import of the tool's module (FR-022, NFR-006).

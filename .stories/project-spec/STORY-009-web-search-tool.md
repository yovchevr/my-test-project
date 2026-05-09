---
id: STORY-009
title: Implement the web-search tool over Tavily
initiative: .initiatives/project_spec.md
requirements: [FR-012, FR-022, FR-023, NFR-005]
design_refs:
  - .design/components/web-search-tool.md
  - .design/components/tools-layer.md
  - .design/foundation/conventions.md
status: ready
points: 5
depends_on: [STORY-003]
external_depends_on: ["TAVILY_API_KEY env var must be available in dev and CI"]
wave: 4
---

## Goal / user value
Wire in the live web-search integration FR-012 mandates: a `web-search` tool registered with the registry (STORY-003), backed by Tavily (per ADR's pinned tech-stack pick), parsing provider responses into the structured `ResultCard` shape every downstream layer consumes. Failures map to the `ToolErrorContract` taxonomy from `web-search-tool.md` so the agent's `runWithBudget` (STORY-011) can react correctly. This is what makes the prototype real instead of a mock — constraints.md disqualifies hardcoded mock-only systems.

## Context
Per `web-search-tool.md` the package is `packages/tools-web-search`, the provider is `@tavily/core@0.3.3`, the HTTP client is `undici@6.21.0` (for fine-grained timeout control per NFR-005). The tool MUST NOT loop or retry — retries are exclusively the agent's `runWithBudget` (STORY-011) responsibility. The tool MUST surface failures as the documented taxonomy: network/5xx/429 → `transient`; 4xx other / malformed body / missing API key → `terminal`; input schema violation → `validation`; abort → no return (registry converts). Determinism caveat: real provider calls are not deterministic and unit tests MUST NOT hit the live API per `technology/testing.md` "Forbidden test patterns" — integration tests use a recorded fixture; only the smoke E2E in STORY-019 hits live.

## Scope
- New module `packages/tools-web-search/src/index.ts` exporting `webSearchTool` (a `defineTool`-wrapped registration) plus a `createWebSearchHandler({ fetch, env })` factory for testability.
- Handler signature: `(input: WebSearchInput, signal: AbortSignal) => Promise<Result<WebSearchOutput, ToolError>>` per the contract.
- Provider call: `undici.fetch(tavilyEndpoint, { method: "POST", body, signal, headers: { Authorization: ... } })`.
- Response parsing: map Tavily's response shape into `ResultCard[]` (title, snippet, domain, url). The `domain` field is derived by parsing the `url` (`new URL(...).hostname`).
- Failure mapping per the table in `web-search-tool.md`:
  - `fetch` throws (network) → `{ kind: "transient", message }`.
  - HTTP status 5xx or 429 → `{ kind: "transient", message }`.
  - HTTP status 4xx (other) → `{ kind: "terminal", message }`.
  - Missing `TAVILY_API_KEY` env var at first invocation → `{ kind: "terminal", message: "missing-api-key" }`.
  - Response body fails `WebSearchOutputContract` → `{ kind: "terminal", message: "malformed-provider-response" }`.
  - Input fails `WebSearchInputContract` → registry catches this before the handler runs (STORY-003) and returns `{ kind: "validation" }` — the handler does NOT need to re-validate.
- Cancellation: `signal` MUST be passed to `undici.fetch`; an aborted signal mid-request tears down the TCP connection and the handler MUST return without throwing.
- `WEB_SEARCH_DEFAULT_MAX_RESULTS` env var MAY override the default `maxResults`.
- Provider name is hardcoded to `"tavily"` in the output for now (per `web-search-tool.md` configuration section).

## Out of scope / non-goals
- No retry loop in this tool (I-27, owned by STORY-011's `runWithBudget`).
- No caching (STORY-005's cache is invoked separately by the agent's LIVE route handler).
- No multi-provider aggregation (deferred per `web-search-tool.md`).
- No live-API hits in unit/integration tests (deferred to STORY-019's smoke job).

## Acceptance criteria
- The tool MUST register itself with the registry under `name: "web-search"` (asserted by STORY-011's tool-registry integration test; this story exports the registration).
- A successful provider response (recorded fixture at `packages/tools-web-search/src/__fixtures__/tavily-response.json`) MUST parse into `WebSearchOutput` whose `results` field validates against `Type.Array(ResultCardContract)`.
- A simulated `fetch` rejection (network error) MUST return `{ ok: false, error: { kind: "transient", message } }` — handler MUST NOT throw.
- A simulated HTTP 500 response MUST return `{ kind: "transient" }`.
- A simulated HTTP 429 response MUST return `{ kind: "transient" }`.
- A simulated HTTP 401 response MUST return `{ kind: "terminal" }`.
- A simulated malformed body (one that fails `WebSearchOutputContract`) MUST return `{ kind: "terminal", message: "malformed-provider-response" }`.
- A handler invocation with no `TAVILY_API_KEY` env var MUST return `{ kind: "terminal", message: "missing-api-key" }` and MUST NOT make a network call.
- A pre-aborted `AbortSignal` MUST cause the handler to return early without making a network call.
- The handler MUST NOT contain a `setTimeout`-based retry loop or any backoff timer (asserted by an AST scan in STORY-018).
- The handler MUST NOT import `packages/data-*` or any data-layer module (asserted by `enforce-module-boundaries` in STORY-018).
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- Recorded fixture committed at `packages/tools-web-search/src/__fixtures__/tavily-response.json`.
- `TAVILY_API_KEY` documented in the repo `README.md` (env-var setup section) for the developer agent's smoke runs.

## Test plan
- Unit (`packages/tools-web-search/src/web-search.test.ts`): the seven failure-mode cases above using a fake `fetch` injected via the `createWebSearchHandler` factory; assert the exact `kind` for each.
- Integration (`packages/tools-web-search/src/web-search.spec.ts`): the recorded-fixture happy path round-trip — fixture in, parsed `WebSearchOutput` out, validated against the contract.
- E2E: deferred to STORY-019 (`tests/e2e/live-search.e2e.ts` hits the live API once in the smoke job).
- Adversarial / NFR coverage:
  - **NFR-005**: this story owns the failure surface that `runWithBudget` (STORY-011) reacts to. Each of the four `kind` variants is fault-injection-tested above. STORY-011 then composes the retry behavior on top; STORY-019's `tests/e2e/web-search-failure.e2e.ts` closes the loop end-to-end. The integration handoff is the failure taxonomy in `web-search-tool.md` — this story makes it real.
  - **FR-023**: the structured-error round-trip — every error variant flows through the registry without being lossily flattened to a generic 500.

## Affected design surface
- `.design/components/web-search-tool.md` — implements the failure taxonomy, configuration, and handler shape verbatim.
- `.design/components/tools-layer.md` — registers via `defineTool` per the documented mechanism.
- `.design/foundation/conventions.md` — async cancellation, no-throw across boundary, structured Result.

## Dependencies
- **Depends on**: STORY-003 (`defineTool`, `ToolHandler`, registry contract).
- **Enables**: STORY-011 (agent invokes `web-search` through the registry).

## Risks & assumptions
- Risk: Tavily's response shape changes upstream. Mitigation: the `WebSearchOutputContract` validator catches a drift as `terminal` — the user sees an error state instead of bad data, and the test fixture is the canary.
- Risk: rate-limiting in CI smoke runs. Mitigation: the smoke job is gated by env-var key presence (STORY-019); CI for unit/integration uses the recorded fixture only.
- Assumption: the user has a Tavily API key (free tier suffices); listed as an external prerequisite.

## Source excerpts
> A real (non-mock) web search tool or API MUST be wired in and MUST be invoked when the user issues a LIVE search. Raw responses from the search tool MUST be parsed into a structured representation.

---
id: STORY-011
title: Build the LangGraph agent loop with budgeted retries
initiative: .initiatives/project_spec.md
requirements: [FR-011, FR-021, FR-022, FR-023, FR-024, NFR-005, NFR-006]
design_refs:
  - .design/components/agent.md
  - .design/components/tools-layer.md
  - .design/components/communication.md
  - .design/foundation/architecture.md
  - .design/foundation/conventions.md
  - .design/decisions/0001-layer-boundaries.md
  - .design/technology/tech-stack.md
status: ready
points: 5
depends_on: [STORY-002, STORY-003, STORY-009, STORY-010]
external_depends_on: []
wave: 6
---

## Goal / user value
Stand up the agent — the orchestrator that drives every search end-to-end, the seam that makes this prototype "genuinely agentic" instead of a thin HTTP wrapper (FR-011 + constraints.md). Validate request → route per source filter via lookup table → invoke tools through the registry → react to errors via the shared `runWithBudget` helper → return a structured `AgentSearchResponseContract`. This is the spine FR-011 / FR-022 / FR-023 / NFR-005 / NFR-006 all touch.

## Context
Per `agent.md` the agent lives in `services/agent`, runs LangGraph 0.2.34 over a tool-invocation state graph, and hosts the shared `runWithBudget` retry helper. The five-step loop (validate → route → invoke → synthesize → return) is the same shape regardless of source filter; per-source behavior is a `Record<SourceFilter, RouteHandler>` lookup, not a switch (NFR-006 / I-22). `runWithBudget` lives at `services/agent/src/run-with-budget.ts`, treats `error.kind === "transient"` as retriable (max 3 attempts = 1 + 2 retries, 500ms fixed backoff, 10s budget per OQ-001), and stops when the budget timer elapses even if a retry is pending. Synthesis (STORY-012) is invoked uniformly for LIVE/HISTORY/BOOKMARK so the answer-quality contract is uniform — but synthesis itself ships in STORY-012; this story exposes the agent-side hook (a `SynthesisFn` injected via the factory) and a placeholder pass-through fake for unit tests.

## Scope
- New module `services/agent/src/index.ts` exporting `createAgent({ registry, synthesize, clock })` returning `(req: AgentSearchRequest, signal: AbortSignal) => Promise<AgentSearchResponse>`.
- LangGraph state graph implementing the five-step loop:
  1. **Validate** input against `AgentSearchRequestContract`. Mismatch → `{ ok: false, error: { kind: "validation", ... } }`.
  2. **Route** via the `routeHandlers: Record<SourceFilter, RouteHandler>` lookup table. Each handler returns the parsed `ResultCard[]` for synthesis.
     - LIVE: `runWithBudget(() => registry.invoke("web-search", { query, maxResults }, signal))` → on success, also invoke `data-store` with op `cache.write` and op `history.append` (these MUST happen on every LIVE search per I-8, even when the result count is zero); forward parsed results to step 4.
     - HISTORY: invoke `data-store` op `history.list` (page-paginated), then op `cache.read` to load the result chunks for the chosen entry, forward to step 4.
     - BOOKMARK: invoke `data-store` op `bookmark.list` (or `bookmark.get` for an id-keyed read, exposed via the request's pagination shape), forward to step 4.
  3. **Invoke tools** through `registry.invoke` with the agent's derived `AbortSignal` (from `runWithBudget`).
  4. **Synthesize** by calling the injected `synthesize(query, results, signal)` — STORY-012 ships the real implementation; this story uses a passthrough fake in tests.
  5. **Return** `{ ok: true, value: { answer_summary, references, results, pagination } }` or the structured error.
- Shared retry helper at `services/agent/src/run-with-budget.ts` with the signature documented in `agent.md`. Backoff via injected `clock` (no `setTimeout` reads of real time inside business logic per `foundation/conventions.md`).
- The agent MUST NOT import `packages/data-*` directly — only `@neo-search/contracts`, `@neo-search/tools`, and the synthesis module. Asserted by `enforce-module-boundaries` in STORY-018.
- Structured logging per `foundation/conventions.md` — every tool invocation emits `agent.tool-invoked` with `tool`, `outcome`, `attempt`, `elapsedMs`.

## Out of scope / non-goals
- No HTTP surface (STORY-013 owns Fastify wiring).
- No real synthesis call (STORY-012 owns it; this story injects a fake).
- No streaming response (deferred per `synthesis.md`).
- No per-tool retry logic anywhere except `runWithBudget` (I-27).

## Acceptance criteria
- The agent MUST reject a request that fails `AgentSearchRequestContract` with `{ ok: false, error: { kind: "validation" } }` and MUST NOT invoke any tool.
- A LIVE search MUST invoke `web-search` exactly once on a happy path, then `data-store` op `cache.write` exactly once, then `data-store` op `history.append` exactly once, then synthesize. (Asserted by spy-counts on the registry.)
- A HISTORY search MUST NOT invoke `web-search` (I-7), MUST invoke `data-store` op `history.list` and then `cache.read`, then synthesize.
- A BOOKMARK search MUST NOT invoke `web-search` (I-7), MUST invoke `data-store` op `bookmark.list` (or `bookmark.get` per the request shape), then synthesize.
- A LIVE search returning zero results MUST still produce a `cache.write` (with empty results) and a `history.append` (per I-8).
- One transient `web-search` failure followed by a success MUST result in a successful response after exactly one retry (`runWithBudget` consumed 1 of 2 retries).
- Two transient failures followed by a success MUST also result in a successful response (2 of 2 retries used).
- Three transient failures MUST result in `{ ok: false, error: { kind: "transient" } }` (retries exhausted) — ultimately surfaced as `transient_exhausted` by the API layer in STORY-013.
- A `web-search` hang exceeding the 10s budget MUST be cancelled via the budget-derived `AbortSignal` and result in `{ ok: false, error: { kind: "cancelled" } }`.
- Backoff between retries MUST be exactly 500ms via the injected clock — asserted by reading the clock's recorded waits (no `setTimeout` of real time).
- The `runWithBudget` helper MUST be the only place in the package that creates a derived `AbortSignal` from a budget timer (asserted by AST scan in STORY-018).
- The agent MUST NOT contain a `switch (sourceFilter)` block — routing MUST be a lookup table (NFR-006, asserted by AST scan in STORY-018).
- The agent MUST NOT import any module under `packages/data-*` (I-18; lint-enforced by STORY-018).
- A throw from a tool handler MUST surface to the agent as a structured `terminal` error (the registry catches it per STORY-003); the agent MUST NOT crash.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The agent's `package.json` MUST list `@neo-search/contracts`, `@neo-search/tools`, `@neo-search/tools-web-search` (composition root only), `@neo-search/tools-data-store` (composition root only), and `@langchain/langgraph` as dependencies — and MUST NOT list any `@neo-search/data-*` package.

## Test plan
- Unit (`services/agent/src/agent-loop.test.ts`): per-source-filter routing with fake registry; spy-count assertions per acceptance criteria.
- Unit (`services/agent/src/run-with-budget.test.ts`): the five NFR-005 sub-cases — (a) recover after 1 transient; (b) recover after 2 transients; (c) exhaust after 3 transients; (d) hang exceeds budget → cancelled; (e) backoff is exactly 500ms via injected clock. Matches `technology/testing.md` NFR-005 row.
- Integration (`services/agent/src/agent-loop.spec.ts`): the agent + real registry + real `web-search` (with a fake `fetch`) + real `data-store` (with temp-dir stores) — assert the LIVE happy path produces the expected sequence of tool calls and the correct response shape.
- E2E: not applicable here; STORY-019 covers the full system.
- Adversarial / NFR coverage:
  - **NFR-005**: the five sub-cases above are the canonical adversarial set per `technology/testing.md`; this is where retry behavior becomes load-bearing.
  - **NFR-006**: the no-`switch` AST scan plus an "add a tool" integration test (register a synthetic third tool via the route handler's lookup; agent loop file MUST be byte-identical) plus an "add a source filter" integration test (extend the routing table; synthesis module MUST be untouched).
  - **FR-023**: every error variant flows through; throw-from-tool is treated as terminal without crashing the request.
  - **FR-024**: lint-enforcement of the no-data-layer-import rule.

## Affected design surface
- `.design/components/agent.md` — implements the loop shape, the `runWithBudget` helper, and the route-handler lookup table verbatim.
- `.design/components/tools-layer.md` — consumes the registry as documented.
- `.design/components/communication.md` — edges 2, 3, 4 are realized here (API → agent contract not yet wired; tool/synthesis edges are).
- `.design/foundation/conventions.md` — clock injection, `AbortSignal` propagation, no-throw-across-boundary.
- `.design/decisions/0001-layer-boundaries.md` — agent's only data seam is `data-store` tool.

## Dependencies
- **Depends on**: STORY-002 (request/response contracts, `Result<T,E>`), STORY-003 (registry interface), STORY-009 (`web-search` tool), STORY-010 (`data-store` tool).
- **Enables**: STORY-012 (synthesis hooks into the agent), STORY-013 (API consumes the agent).

## Risks & assumptions
- Risk: LangGraph's state-machine API changes in a patch release. Mitigation: pinned to `0.2.34` per tech-stack; upgrades are single-purpose `chore(deps):` commits.
- Risk: testing the `cancelled` path with fake timers + an `AbortSignal` requires careful timer ordering. Mitigation: `vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })` per Vitest patterns; the injected clock controls all wait points.
- Assumption: the synthesis injection point is sufficient for STORY-012 to drop in the real implementation without changing this story's loop body (validates `synthesis.md`'s "synthesis is a separate file" claim).

## Source excerpts
> Search execution MUST be driven by an agent that orchestrates tool usage, controls pagination and chunk retrieval, and manages data flow between layers — not by a thin pass-through API.

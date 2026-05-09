---
id: STORY-013
title: Stand up the Fastify search API service
initiative: .initiatives/project_spec.md
requirements: [FR-005, FR-010, FR-021, FR-023, FR-024]
design_refs:
  - .design/components/search-api.md
  - .design/components/agent.md
  - .design/components/communication.md
  - .design/foundation/architecture.md
  - .design/foundation/conventions.md
  - .design/technology/tech-stack.md
status: ready
points: 5
depends_on: [STORY-002, STORY-011, STORY-012]
external_depends_on: []
wave: 8
---

## Goal / user value
Expose the agent over HTTP so the UI can talk to it: four endpoints (`/api/search` POST, `/api/bookmarks` POST, `/api/bookmarks` GET, `/api/history` GET), TypeBox schema validation at the wire boundary, structured error → HTTP status mapping (FR-023 → FR-005), and `clientRequestId` deduplication for write endpoints (5s window). This is the load-bearing layer between the UI and the agent — and the place where FR-010's UI ↔ API contract is enforced by Fastify natively consuming `@neo-search/contracts` JSON Schemas.

## Context
Per `search-api.md` the API lives in `services/api`, runs Fastify 5.1.0 + TypeBox, and translates the agent's `kind` discriminant to HTTP status per the table: `validation` → 400, `terminal` → 502, `transient` → 503 (`transient_exhausted`), `cancelled` → 504, unexpected throw → 500. The API MUST NOT touch the data layer (I-17) and MUST NOT call tools directly (I-19). Idempotency for writes via `clientRequestId` (UUID, 5s window). No auth gating per OQ-004 / I-15. The composition root is `services/api/src/main.ts`; it constructs the registry (with `web-search` + `data-store` registered), instantiates the agent (STORY-011) with the real synthesizer (STORY-012), and binds Fastify routes.

## Scope
- New module `services/api/src/index.ts` exporting `createApi({ agent, clock })` returning a Fastify instance.
- Composition root `services/api/src/main.ts` that constructs the registry, registers tools, builds the agent, builds the synthesizer (env-driven model + prompt), binds the API, and listens on `PORT` (default 3001).
- The four routes:
  - `POST /api/search` — body `SearchRequestContract`; calls `agent(req, signal)`; maps the structured result to the HTTP envelope per `search-api.md` Error surface table.
  - `POST /api/bookmarks` — body `BookmarkSaveRequestContract`; the API forwards a synthetic `bookmark.save` agent request OR invokes `data-store` directly via the agent? — per `search-api.md` "It MUST NOT call tools directly", the API MUST go through the agent. Add a thin agent-side `bookmark.save` route handler that calls `data-store` op `bookmark.save` (this slot was already accommodated by STORY-011's source-filter routing model — see follow-up note).
  - `GET /api/bookmarks` — page query param; returns `BookmarkListResponseContract`.
  - `GET /api/history` — page query param; returns `HistoryListResponseContract`.
- Schema validation: each route registers its TypeBox schema with Fastify; mismatch → structured 400 with `{ ok: false, error: { kind: "validation", message, details } }`.
- `clientRequestId` deduplication: an in-memory LRU map keyed by `clientRequestId` with a 5s TTL. A repeated request_id within the window MUST return the cached response, NOT re-invoke the agent. The cache MUST be cleared on process restart (no persistent dedupe per OQ-004).
- The `AbortSignal` from Fastify's request hook MUST be forwarded into the agent call so cancellation propagates per `communication.md` cancellation propagation.
- Structured logging per `foundation/conventions.md` — `api.request-received`, `api.response-sent`, `api.error-translated` with the request id and status.
- The API MUST NOT import `packages/data-*`, MUST NOT import `@neo-search/tools-web-search` or `@neo-search/tools-data-store` directly except in `main.ts` (the composition root) — boundary discipline; STORY-018 enforces.

## Out of scope / non-goals
- No auth (OQ-004).
- No streaming responses (deferred per `synthesis.md`).
- No persistent dedupe / no idempotency-key store (5s in-memory LRU is the contract).
- No CORS production wiring beyond enabling `localhost:5173` (Vite default) and the API's own origin — extending CORS is out of scope.

## Acceptance criteria
- `POST /api/search` with a body matching `SearchRequestContract` MUST return 200 with a body matching `UiApiAnswerContract` on the happy path.
- A body that fails `SearchRequestContract` MUST return 400 with `{ ok: false, error: { kind: "validation", message, details } }`.
- An agent response with `kind: "terminal"` MUST surface as HTTP 502.
- An agent response with `kind: "transient"` (post-retry-exhausted) MUST surface as HTTP 503 with `{ kind: "transient_exhausted" }`.
- An agent response with `kind: "cancelled"` MUST surface as HTTP 504.
- An unexpected throw inside the API handler MUST surface as HTTP 500 with `{ kind: "internal", message: "internal error" }` (NOT an unstructured 500 with no body — I-28).
- A repeated `clientRequestId` within 5s on `POST /api/search` (LIVE) MUST return the cached response and MUST NOT invoke the agent again. Asserted by spying on the agent factory.
- The dedup cache MUST clear on a fresh process start.
- `GET /api/bookmarks?page=1` MUST return `BookmarkListResponseContract`; `GET /api/history?page=1` MUST return `HistoryListResponseContract`.
- The API MUST NOT import any module under `packages/data-*` (asserted by `enforce-module-boundaries` in STORY-018).
- A request `AbortSignal` aborted mid-flight MUST be forwarded to the agent and result in a 504 if the agent returns `cancelled`.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- `services/api/src/main.ts` boots cleanly under `pnpm --filter @neo-search/api start` against a temp `dataDir`.

## Test plan
- Unit (`services/api/src/api.test.ts`): each route's schema-validation path with malformed bodies; the dedup-cache TTL and clear-on-restart; the throw-translation path.
- Integration (`services/api/src/api.spec.ts`): end-to-end via Fastify's `inject` API — POST /api/search with a fake agent that returns each `kind` variant in turn; assert HTTP statuses match the table. Plus a happy-path POST that exercises the real agent (with a fake `web-search` fetch and temp-dir stores).
- E2E: deferred to STORY-019.
- Adversarial / NFR coverage:
  - **FR-023**: every error variant round-trips end-to-end through the API → status mapping is exhaustive.
  - **FR-024**: lint-enforces no-data-layer-import — implementing this story without lint enforcement risks accidental drift; STORY-018 closes the loop, but this story's PR MUST NOT contain such an import.
  - **FR-005**: terminal/transient/cancelled all surface as structured error bodies the UI can render as the FR-005 error state — STORY-016 then renders them.

## Affected design surface
- `.design/components/search-api.md` — implements the four endpoints, error surface table, and dedup posture verbatim.
- `.design/components/agent.md` — the API consumes the agent factory exported from `services/agent`.
- `.design/components/communication.md` — edges 1, 2 are now wired.
- `.design/foundation/architecture.md` — the API is the second-from-top layer.
- `.design/foundation/conventions.md` — structured logging, `AbortSignal` propagation.

## Dependencies
- **Depends on**: STORY-002 (wire contracts), STORY-011 (agent factory), STORY-012 (real synthesizer wired in `main.ts`).
- **Enables**: STORY-016 (UI calls the API), STORY-019 (smoke test exercises the running API).

## Risks & assumptions
- Risk: Fastify's TypeBox integration may need a small adapter (the `@fastify/type-provider-typebox` plugin is not pinned in `tech-stack.md`). Mitigation: if needed, add via a single-purpose `chore(deps):` commit per `naming-conventions.md`; pin the version.
- Risk: an in-memory dedup cache loses entries on a fast worker restart. Mitigation accepted at prototype scale (OQ-004 specifies no retention; the 5s window is best-effort).
- Assumption: the agent factory exposes a synchronous "build" path (constructs in `main.ts` once at boot, not per-request). Confirmed by STORY-011's factory shape.

## Source excerpts
> Validate every request payload against the `@neo-search/contracts` schemas at the wire boundary (FR-010, FR-021). A request whose payload does not match the contract MUST be rejected with a structured 400 response, never reach the agent.

---
title: Inter-component communication
read_when: wiring or modifying communication between components
kind: edges
connects: [ui-shell, search-api, agent, synthesis, tools-layer, web-search-tool, data-store-tool, data-layer]
---

# Inter-component communication

This document maps the edges between components — who calls whom, the transport, the contract reference, the idempotency posture, and the failure mode. It does NOT duplicate per-component contracts; those live in each component's own doc.

The four contractually-governed boundaries from FR-021 are the load-bearing edges. Internal-process composition edges are listed for completeness so a downstream agent can see the whole graph without inferring it.

## Edge table

| # | From | To | Transport | Contract | Idempotency | Failure mode |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `ui-shell` | `search-api` | HTTP/JSON over `fetch` | `UiApiAnswerContract` and friends in `@neo-search/contracts/ui-api.ts` (FR-010, FR-021) | Reads idempotent. Writes idempotent within 5s via `clientRequestId`. | Network error → FR-005 error state in UI. Structured 4xx/5xx → FR-005 error state with the `kind` from the body. |
| 2 | `search-api` | `agent` | In-process function call (within `services/api`'s composition root, the agent is imported as a module) | `AgentSearchRequestContract` / `AgentSearchResponseContract` in `@neo-search/contracts/api-agent.ts` (FR-021) | Per-edge: none. Idempotency for writes is owned by the API via `clientRequestId`. | Agent returns `{ ok: false, error: { kind } }`. The API maps `kind` → HTTP status per `components/search-api.md`. The agent MUST NOT throw across this edge (I-26). |
| 3 | `agent` | `tools-layer` (registry) | In-process function call: `registry.invoke(name, input, signal)` | `ToolDescriptorContract`, `ToolErrorContract`, `ToolHandler` in `@neo-search/contracts/agent-tools.ts` (FR-021, FR-022) | Per-tool. The registry itself is stateless. | Tool returns `{ ok: false, error: { kind } }`. The agent's `runWithBudget` retries on `transient`; surfaces `terminal` / `validation` immediately. Throw across this edge → registry converts to `terminal`. |
| 4 | `agent` | `synthesis` | In-process function call | `SynthesisInputContract` / `SynthesisOutputContract` (FR-013) | Non-deterministic by nature (LLM call). Idempotency owned at API via `clientRequestId`. | Synthesis output that fails its post-generation validator → one in-process retry → second failure → `terminal` agent error (FR-023). |
| 5 | `tools-layer` | `web-search-tool` | In-process handler call (the tool's `handler` is registered with the registry) | `WebSearchInputContract` / `WebSearchOutputContract` + `ToolErrorContract` (FR-021, FR-022) | None at this edge; the tool itself does not loop or retry. | Failure taxonomy in `components/web-search-tool.md`. Transient surfaces invite the agent's retry helper; terminal does not. |
| 6 | `web-search-tool` | external HTTP (Tavily) | HTTPS via `undici.fetch` with the request `AbortSignal` | Tavily's published JSON response, parsed against `WebSearchOutputContract` | Provider's contract; we do not assume idempotency for the same query (provider may return varying results). | Network error / 5xx / 429 → `transient`. Other 4xx / malformed body → `terminal`. Signal aborted → request cancelled, surfaced as `cancelled` upstream. |
| 7 | `tools-layer` | `data-store-tool` | In-process handler call | `DataStoreInputContract` (op union) / `DataStoreOutputContract` (op union) + `ToolErrorContract` (FR-021, FR-022) | Per-op: read ops idempotent. `cache.write` overwrites atomically. `history.append` / `bookmark.save` idempotent within a 5s window via the API's `clientRequestId`. | I/O failure → `terminal`. Schema mismatch → `validation`. The tool MUST NOT throw across this edge. |
| 8 | `data-store-tool` | `data-layer` (the three store packages) | In-process function call | `HistoryStore`, `BookmarkStore`, `SearchCache` interfaces in the data-layer packages; record types in `@neo-search/contracts/data.ts` (FR-021) | Read methods idempotent. Write methods atomic via SQLite transactions. | Storage I/O exception is caught by the `data-store` tool and translated into `{ ok: false, error: { kind: "terminal" } }`. |
| 9 | `data-layer` | SQLite (`better-sqlite3`) | In-process driver call | SQL schema versioned by migrations under `packages/data-cache/migrations/` (and similar for history / bookmarks) | Driver-level. Atomic transactions for any multi-statement operation. | Driver exception bubbles to the data-layer caller, which catches and translates to a `terminal` error at edge 8. |
| 10 | `data-layer` | local filesystem (chunk JSON files) | `node:fs/promises` reads/writes under `<NEO_SEARCH_DATA_DIR>/chunks/` | Per-file format pinned in `decisions/0003-chunking-strategy.md` | `cache.write` writes chunks then commits the index in a single SQLite transaction — chunk files MUST be written before the index update. Reads are inherently idempotent. | Read miss / corrupt file → `terminal` at edge 8. Write failure → SQLite transaction rolled back, partial chunk files cleaned up by the cache implementation. |

## Edges that MUST NOT exist

The boundary discipline of FR-024 (and invariants I-16..I-21) is enforceable only if certain edges are statically forbidden:

- `ui-shell` → `agent` directly. **Forbidden.** UI talks only to the API.
- `ui-shell` → `data-layer` directly. **Forbidden.** UI talks only to the API.
- `search-api` → `tools-layer` directly. **Forbidden.** API talks only to the agent.
- `search-api` → `data-layer` directly. **Forbidden.** Same.
- `agent` → `data-layer` directly. **Forbidden.** Agent reaches data only through the `data-store` tool (edge 7).
- `agent` → external HTTP directly (bypassing a registered tool). **Forbidden.** Agent reaches the network only through registered tools (edge 6 via the registry).
- `synthesis` → `tools-layer` or `data-layer`. **Forbidden.** Synthesis is a pure transform.

CI enforces these via the Nx `enforce-module-boundaries` rule (`technology/testing.md`), and `madge --circular` enforces I-20.

## Cancellation propagation

Every edge in the above table that crosses a layer MUST propagate the request `AbortSignal`:

- Edge 1 (HTTP): the browser's request `AbortSignal` MUST be wired through `fetch`.
- Edge 2 (API → agent): Fastify's request abort MUST be forwarded as the agent's request signal.
- Edge 3 (agent → tools): `runWithBudget` MUST pass a derived signal that fires either when the request signal fires or when the 10s NFR-005 budget elapses.
- Edges 5, 7 (registry → tool handler): the registry MUST forward the signal to the handler.
- Edge 6 (web-search → Tavily): undici's `fetch` MUST receive the signal (tears down the TCP connection on abort).
- Edges 8–10 (data-store → data-layer → substrate): every store method MUST accept and honor the signal during long reads.

The 10s NFR-005 budget is the only place a derived signal is created; everywhere else MUST forward the existing signal unchanged. This is what makes I-25 (every tool invocation cancellable, every invocation under budget) hold by construction.

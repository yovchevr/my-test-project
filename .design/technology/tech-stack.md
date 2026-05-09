---
title: Tech stack
read_when: adding a dependency, pinning a version, or wiring a new package
---

# Tech stack

Every entry here is pinned to a specific version. `latest`, caret, and tilde ranges MUST NOT be used. The rationale column states *why this pick over the obvious alternatives*, traced to a constraint or FR/NFR.

## Why this stack

The deployment scope is **local prototype, single user, no SLA** (OQ-002, OQ-005). That rules out cloud-managed services, container orchestration, and multi-region topologies. It does NOT rule out using production-grade libraries — it just means the operational substrate is a single developer machine.

A single-language stack (TypeScript end-to-end) was chosen so the four layer contracts (FR-021) can be expressed once as TypeScript types in a shared package and consumed by both sides without translation. A polyglot stack would require duplicated schema generation; that violates FR-021's "reusable" clause.

## Pinned versions

| Concern | Pick | Pinned version | Rationale |
| --- | --- | --- | --- |
| Language | TypeScript | `typescript@5.6.3` | Single-language stack lets `@neo-search/contracts` be the one source of truth for all four FR-021 boundaries. Strict mode enabled per `foundation/conventions.md`. |
| Runtime (server) | Node.js | `node@22.11.0` (LTS) | LTS line; ESM stable; built-in `AbortController` / `fetch` for tool calls. No need for Deno or Bun in a local prototype. |
| Package manager | pnpm | `pnpm@9.12.3` | Workspace-native, deterministic lockfile, content-addressable store keeps the local prototype lean. npm and yarn classic both lack pnpm's workspace ergonomics. |
| Monorepo tool | Nx | `nx@20.1.4` | Per the `nx-monorepo-scaffold` posture — tags + boundary lint stop cross-layer imports (enforces I-16..I-21). Turborepo would work but lacks the boundary-tag rule. |
| API framework | Fastify | `fastify@5.1.0` | Schema-first request/response validation aligns with FR-021's structured contracts. Native JSON Schema gates payloads at the UI ↔ API boundary without hand-written guards. Express would work but has weaker schema integration. |
| API schema runtime | TypeBox | `@sinclair/typebox@0.33.17` | Single source for runtime validators and TS types — `Type.Object({...})` produces both. Zod is the obvious alternative; TypeBox is picked for its first-class JSON Schema output, which Fastify consumes natively. |
| UI framework | React | `react@18.3.1` + `react-dom@18.3.1` | Mainstream, easy to demo, abundant component primitives for FR-001..FR-006. Suspense supports the FR-006 progressive-loading affordance cleanly. |
| UI build / dev server | Vite | `vite@5.4.10` | Fast HMR for the prototype, ESM-native, no config gymnastics. Next.js / Remix are heavier than the prototype warrants. |
| UI styling | Tailwind CSS | `tailwindcss@3.4.14` | Visual-system primitives (NFR-002 checklist) ship as utilities rather than free-form CSS, which makes "consistent palette / spacing / typography" enforceable by lint. |
| UI component primitives | Radix UI | `@radix-ui/react-tabs@1.1.1`, `@radix-ui/react-dialog@1.1.2` | Accessible primitives for the FR-003 source-filter tabs and any modal/dialog states. Keyboard focus / hover state coverage required by NFR-002. |
| Agent runtime | LangGraph | `@langchain/langgraph@0.2.34` | The agent is a state machine over tool invocations (FR-011), not a chained pipeline. LangGraph's graph model fits the orchestration loop in `components/agent.md` and avoids the hardcoded-pipeline anti-pattern called out in NFR-006. Plain LangChain runnables would force a pipeline shape; LangGraph keeps the loop explicit. |
| LLM client | Anthropic SDK | `@anthropic-ai/sdk@0.32.1` | The synthesis step (FR-013) is an LLM call. The Anthropic SDK is the canonical client for the Claude model line and supports prompt caching, which keeps the synthesis step cheap on repeated runs. The model ID is selected per-environment via env var; no model name MUST be hardcoded. |
| Tool registry pattern | MCP-style in-process | `@modelcontextprotocol/sdk@1.0.4` | FR-022 names MCP. Using the official MCP SDK in-process gives us the documented tool interface (input/output/error schemas) without standing up a separate server process — appropriate for a local prototype. |
| Web search tool | Tavily | `@tavily/core@0.3.3` | A real, low-friction web search API (FR-012). Single API key, JSON response shape, free tier for prototypes. Brave Search and Serper would equally work; Tavily is picked for its agent-oriented response format that maps cleanly to our `Result` type with minimal parsing. |
| HTTP client (tools) | undici | `undici@6.21.0` | Bundled in Node 22 but pinned explicitly so the tool-side timeout / retry behavior is the same regardless of Node patch version. Native `fetch` is built on undici; we use undici directly when we need fine-grained timeout control for NFR-005. |
| Persistent storage | better-sqlite3 | `better-sqlite3@11.5.0` | The data layer needs an indexed cache, history store, and bookmark store, all on a single developer machine (OQ-002). SQLite gives us indices, transactions, and durability without a daemon. The chunk bodies are stored in a separate on-disk segmented-JSON layout (per `decisions/0003-chunking-strategy.md`); SQLite holds the index. The synchronous `better-sqlite3` is faster than `node:sqlite` for the prototype's workload. |
| Schema validation (cross-cutting) | TypeBox | (same as API schema runtime) | One validator across UI ↔ API and Agent ↔ Tools so FR-021's "single definition" clause is structurally enforced. |
| Logger | pino | `pino@9.5.0` | One-line JSON logs match `foundation/conventions.md`. Fast enough that logging in the agent loop does not itself become a budget item against NFR-005. |
| Test runner | Vitest | `vitest@2.1.4` | Native ESM, native TypeScript, parallel by default, mature `expect` API. Jest's ESM story is still painful; Vitest avoids the friction. |
| E2E test runner | Playwright | `@playwright/test@1.48.2` | Required for the FR-001..FR-006 UI test cases (FR-025 calls them out). Cross-browser, screenshot diff, network mocking for NFR-005 fault-injection tests. |
| Lint | ESLint | `eslint@9.14.0`, `typescript-eslint@8.13.0` | Flat config; type-checked rules. The Nx `enforce-module-boundaries` rule is configured here (I-16..I-21). |
| Format | Prettier | `prettier@3.3.3` | Single source of formatting truth. No per-package overrides. |
| Pre-commit | lefthook | `lefthook@1.8.2` | Faster than husky, native parallel hook execution. Runs `eslint --fix`, `prettier --check`, and `vitest --run --changed` on staged files. |
| Cycle detector | madge | `madge@8.0.0` | CI gate for I-20 (no cyclic imports across layers). |

## Stack-level prohibitions

- A second LLM SDK MUST NOT be added. If a different model is required, it MUST be reachable via the Anthropic SDK or a uniform tool wrapper. Two SDKs in one prototype is gratuitous coupling.
- A managed cloud database MUST NOT be introduced. Persistence is local-disk SQLite plus on-disk JSON chunks per OQ-002.
- A frontend state library beyond React's built-in `useState` / `useReducer` and React Query MUST NOT be added at the prototype stage. If the UI grows complex enough to need Redux / Zustand, that is an ADR moment.
- A bundler other than Vite MUST NOT be introduced for the UI.

## Versioning posture

- Every dependency MUST be pinned to an exact version. The `pnpm-lock.yaml` MUST be committed.
- A dependency upgrade MUST come with a single-purpose `chore(deps):` commit and MUST NOT bundle behavior changes. (See `foundation/naming-conventions.md`.)
- A new runtime dependency MUST be added to this file with a rationale before being added to `package.json`. CI SHOULD enforce this with a pre-commit grep.

## Requirements covered

FR-021 (single-source contracts via TypeBox), FR-022 (MCP SDK for tooling layer), FR-012 (Tavily as the real web search), FR-011 (LangGraph for non-pipeline agent), FR-013 (Anthropic SDK for synthesis), FR-014/FR-015/FR-016 (SQLite for persistence), NFR-002 (Tailwind + Radix for visual-system enforcement), NFR-005 (undici for fine-grained timeout control).

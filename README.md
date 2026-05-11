# neo-search

The `neo-search` workspace. This repository is a pnpm + Nx TypeScript monorepo
scaffolded per `.design/foundation/architecture.md` and pinned by
`.design/technology/tech-stack.md`.

## Layout

```
apps/
  ui/                        # browser-facing app shell (STORY-014 owns the UI scaffold)
services/
  api/                       # HTTP surface (UI <-> API contract)
  agent/                     # orchestration loop, tool selection, synthesis
packages/
  contracts/                 # the four FR-021 boundary contracts
  tools/                     # tool registry primitives
  tools-web-search/          # FR-012 web search tool
  tools-data-store/          # FR-022 data storage / retrieval tool
  data-history/              # FR-014 history store
  data-bookmarks/            # FR-015 bookmark store
  data-cache/                # FR-016 search cache
  test-fixtures/             # shared deterministic fixtures (NFR-003 / FR-017)
  ui-tokens/                 # design-system tokens (NFR-002)
```

Every internal package is published under the `@neo-search/` scope per
`.design/foundation/naming-conventions.md`.

## Smoke check

A clean checkout MUST satisfy this end-to-end:

```sh
pnpm install
pnpm build
pnpm lint
pnpm format
```

These four commands are the wave-1 acceptance gate for STORY-001 and the first
checkpoint for FR-025 ("runnable from a clean checkout").

## Running the UI shell

STORY-014 stands up the wave-2 UI shell in `apps/ui` (Vite + React + Tailwind +
Radix). Boot the dev server and visit http://localhost:5173:

```sh
pnpm --filter @neo-search/ui dev
```

The dev server proxies `/api/*` to `http://localhost:3001` (the API service).
Token values (palette, typography, spacing, cards, focus ring, breakpoints) live
in `packages/ui-tokens/` and are consumed via the Tailwind preset; see
`packages/ui-tokens/README.md` for the documented checklist (NFR-002).

## Environment variables

The agent and its tools read configuration from `process.env`. Each variable is
optional unless a tool explicitly requires it; absent required keys surface as
`terminal` tool errors per `.design/components/web-search-tool.md`.

| Variable                         | Owner                                      | Required when                                                             | Purpose                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TAVILY_API_KEY`                 | `@neo-search/tools-web-search` (STORY-009) | running a `LIVE` search; STORY-019 smoke job                              | API key for the Tavily web-search provider (FR-012). Free tier suffices for prototype use. Get one at https://tavily.com. The unit + integration tests use a recorded fixture and DO NOT require this key; only the smoke E2E (STORY-019) hits the live API.                                                                                   |
| `WEB_SEARCH_DEFAULT_MAX_RESULTS` | `@neo-search/tools-web-search` (STORY-009) | optional                                                                  | Override the default `maxResults` (50) when an input does not specify one. Bounded to `[1, 1000]` by `WebSearchInputContract`.                                                                                                                                                                                                                 |
| `ANTHROPIC_API_KEY`              | `@neo-search/agent` synthesis (STORY-012)  | running any synthesis call against the live API; STORY-019 smoke job      | API key for the Anthropic SDK (FR-013). Required by the real `Anthropic` client constructed at the API composition root; STORY-019 is the smoke job that exercises the live model. Unit and integration tests build a fake `AnthropicLike` client and DO NOT depend on this var — only the STORY-019 smoke job sets it.                        |
| `ANTHROPIC_MODEL`                | `@neo-search/agent` synthesis (STORY-012)  | running any synthesis call (live or fake) without an explicit `model` arg | Model identifier passed to `messages.create`. Per `.design/technology/tech-stack.md` ("The model ID is selected per-environment via env var; no model name MUST be hardcoded"), the synthesizer reads this when `createSynthesizer({ model })` is not supplied. Tests pass `model: 'claude-fake'` explicitly so they do not depend on the var. |
| `ANTHROPIC_SYNTHESIS_PROMPT`     | `@neo-search/agent` synthesis (STORY-012)  | optional                                                                  | Override the baseline synthesis system prompt (`DEFAULT_SYNTHESIS_PROMPT` in `services/agent/src/synthesis/prompt.ts`). The composition root passes this through to `createSynthesizer({ prompt })` when set. Useful for prompt tuning without a code change.                                                                                  |

A typical local setup:

```sh
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export ANTHROPIC_MODEL="claude-3-5-sonnet-20241022"
```

CI does not export `TAVILY_API_KEY` or `ANTHROPIC_API_KEY` for the
unit/integration jobs; the fixture-based tests and the fake `AnthropicLike`
client cover the failure-mode surface without a live key. Only the
STORY-019 smoke job exports these vars and exercises the live APIs.

## Pinned tooling

- Node `22.11.0`
- pnpm `9.12.3` (activated through Corepack via the `packageManager` field)
- TypeScript `5.6.3`
- Nx `20.1.4`
- Prettier `3.3.3`
- ESLint `9.14.0` + `typescript-eslint` `8.13.0`
- Vitest `2.1.4` + `@vitest/coverage-v8`
- madge `8.0.0` (cycle check)
- lefthook `1.8.2` (pre-commit)

All dependency versions are pinned exactly. `^` and `~` ranges are forbidden by
`.design/technology/tech-stack.md`. The `tools/lint/dependency-version-audit.test.ts`
gate fails the build on any unpinned range.

## Quality gates

STORY-018 wires the structural gates listed in `.design/technology/testing.md`.
Every gate runs in CI on push + PR and as part of the `pnpm pre-commit` hook
where applicable. A red gate MUST NOT be bypassed by `--no-verify`.

| Gate               | Command                                   | What it asserts                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format             | `pnpm format`                             | Prettier reports zero unformatted files.                                                                                                                                                                                                                                                                           |
| Lint               | `pnpm lint`                               | ESLint passes. Includes Nx `@nx/enforce-module-boundaries` (FR-024 layer constraints), `no-restricted-syntax` (`*Contract` outside `@neo-search/contracts` per ADR 0002, inline hex outside `apps/ui/src` per NFR-002), `no-console` for production code, and the bare-`TODO:` rule (`foundation/conventions.md`). |
| Type-check         | `pnpm type-check`                         | `tsc --noEmit` across every package via `nx run-many`.                                                                                                                                                                                                                                                             |
| Cycle check        | `pnpm madge`                              | `madge --circular --extensions ts,tsx apps services packages` exits 0 (I-20).                                                                                                                                                                                                                                      |
| Unit + integration | `pnpm test`                               | Full Vitest suite passes. Includes the `tools/lint/*.test.ts` structural guards: AST scans for hardcoded flows (NFR-006), repo-grep for forbidden user-id columns (NFR-006 / OQ-005), boundary-lint integration tests, the FR/NFR test-name presence audit, and the dependency-version audit.                      |
| Coverage           | `pnpm coverage`                           | `vitest run --coverage`; ≥ 80% lines/functions/statements (and ≥ 70% branches) on `services/agent`, `packages/contracts`, `packages/data-*`, `packages/tools*`. UI coverage is intentionally not gated — Playwright (STORY-019) covers UI behavior.                                                                |
| Contract tests     | `pnpm exec vitest run packages/contracts` | Every FR-021 boundary contract validates its example payload (ties STORY-002's contract tests to CI).                                                                                                                                                                                                              |
| Pre-commit         | `pnpm pre-commit`                         | Lefthook runs `prettier --check`, `eslint --max-warnings=0`, and `vitest run --changed` on staged files.                                                                                                                                                                                                           |
| All-in-one local   | `pnpm gates`                              | Runs format → lint → type-check → madge → test → coverage in sequence; matches CI's failure points.                                                                                                                                                                                                                |

### Boundary lint (`@nx/enforce-module-boundaries`)

Every package's `project.json` carries a `tags` entry:

| Tag            | Packages                                                                   | May import                                       |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| `layer:ui`     | `apps/ui`                                                                  | `layer:shared`                                   |
| `layer:api`    | `services/api`                                                             | `layer:agent`, `layer:shared`                    |
| `layer:agent`  | `services/agent`                                                           | `layer:tools`, `layer:shared` (NOT `layer:data`) |
| `layer:tools`  | `packages/tools`, `packages/tools-web-search`, `packages/tools-data-store` | `layer:tools`, `layer:data`, `layer:shared`      |
| `layer:data`   | `packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`  | `layer:shared`                                   |
| `layer:shared` | `packages/contracts`, `packages/ui-tokens`, `packages/test-fixtures`       | `layer:shared`                                   |

A new package added to the workspace MUST declare a `tags: ["layer:<name>"]` entry. The Nx rule fails lint on any cross-layer import that violates this matrix; see `.design/components/communication.md` "Edges that MUST NOT exist".

The intra-`layer:tools` self-edge encodes Edge 5 of `.design/components/communication.md`: every tool handler (`@neo-search/tools-web-search`, `@neo-search/tools-data-store`) registers itself with the registry (`@neo-search/tools`) via `defineTool`. Both packages live in `layer:tools`; the cross-layer prohibitions (agent→data, ui→agent, etc.) still hold.

The Nx rule reads its constraints from a cached project graph. CI warms the
graph with `pnpm exec nx show projects --json` before lint and test runs;
locally, the graph is warmed automatically the first time you run any `nx`
command. If `pnpm lint` reports `No cached ProjectGraph is available`, run
`pnpm exec nx show projects --json` once and re-run.

### FR / NFR test-name presence audit

`tools/lint/fr-nfr-test-presence.test.ts` greps every `*.test.ts` / `*.spec.ts` for test names containing each FR-### / NFR-### ID under `.requirements/`. IDs whose owning story has not yet shipped tests are listed in `tools/lint/fr-nfr-test-presence.config.ts` `PENDING_IDS`; the audit fails on any pending entry that DOES have tests, forcing maintainers to remove the entry the moment the gating story lands.

## Deliverables

The eight FR-025 deliverable artifacts live under `docs/`:

- [docs/architecture.md](docs/architecture.md) — System diagram, data flow, agent interactions, tool interactions. Cross-references FR-024.
- [docs/problem-decomposition.md](docs/problem-decomposition.md) — How we broke down the problem (four-layer split), why this architecture (ADR 0001), tradeoffs considered (ADR 0001/0002/0003). Cross-references the three ADRs.
- [docs/agent-design.md](docs/agent-design.md) — Agent responsibilities, how decisions are made (lookup-table routing), how orchestration works (five-step loop), the `runWithBudget` discipline (NFR-005). Cross-references FR-011, FR-013.
- [docs/data-strategy.md](docs/data-strategy.md) — Chunking approach (ADR 0003), indexing approach (SQLite), storage format (segmented JSON + SQLite). Includes NFR-003/004 evidence. Cross-references FR-019, FR-020.
- [docs/contracts.md](docs/contracts.md) — The four FR-021 contracts (UI ↔ API, API ↔ Agent, Agent ↔ Tools, Agent ↔ Data) with example payload from `packages/contracts/src/__fixtures__/example-ui-api-answer.json`. Cross-references FR-010, FR-021.
- [docs/design-patterns.md](docs/design-patterns.md) — Neo workflow design patterns: contract binding (FR-021), agent orchestration (FR-011/FR-013), data partitioning (FR-017/FR-019/FR-020), tool abstraction (FR-022/FR-023). Expressed exclusively in Neo vocabulary per constraints.md.
- [docs/test-cases.md](docs/test-cases.md) — The seven initiative test cases: live web results (FR-012), summary+citations (FR-007/008/009), history (FR-014), bookmarks (FR-015), chunked retrieval (FR-018), large dataset (NFR-003), UI controls (FR-001..FR-006). Each with test file path and assertion summary.
- **Runnable prototype gate** — `pnpm e2e:smoke` (STORY-019, to be wired). Evidence the prototype runs end-to-end from a clean checkout (FR-025 a).

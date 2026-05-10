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

| Variable                         | Owner                                      | Required when                                | Purpose                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TAVILY_API_KEY`                 | `@neo-search/tools-web-search` (STORY-009) | running a `LIVE` search; STORY-019 smoke job | API key for the Tavily web-search provider (FR-012). Free tier suffices for prototype use. Get one at https://tavily.com. The unit + integration tests use a recorded fixture and DO NOT require this key; only the smoke E2E (STORY-019) hits the live API. |
| `WEB_SEARCH_DEFAULT_MAX_RESULTS` | `@neo-search/tools-web-search` (STORY-009) | optional                                     | Override the default `maxResults` (50) when an input does not specify one. Bounded to `[1, 1000]` by `WebSearchInputContract`.                                                                                                                               |

A typical local setup:

```sh
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

CI does not export `TAVILY_API_KEY` for the unit/integration jobs; the
fixture-based tests cover the failure-mode surface without a live key.

## Pinned tooling

- Node `22.11.0`
- pnpm `9.12.3` (activated through Corepack via the `packageManager` field)
- TypeScript `5.6.3`
- Nx `20.1.4`
- Prettier `3.3.3`
- ESLint `9.14.0` + `typescript-eslint` `8.13.0`

All dependency versions are pinned exactly. `^` and `~` ranges are forbidden by
`.design/technology/tech-stack.md`.

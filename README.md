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

## Pinned tooling

- Node `22.11.0`
- pnpm `9.12.3` (activated through Corepack via the `packageManager` field)
- TypeScript `5.6.3`
- Nx `20.1.4`
- Prettier `3.3.3`
- ESLint `9.14.0` + `typescript-eslint` `8.13.0`

All dependency versions are pinned exactly. `^` and `~` ranges are forbidden by
`.design/technology/tech-stack.md`.

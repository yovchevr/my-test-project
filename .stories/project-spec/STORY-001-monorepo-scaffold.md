---
id: STORY-001
title: Scaffold the Nx pnpm TypeScript monorepo
initiative: .initiatives/project_spec.md
requirements: [FR-024, FR-025]
design_refs:
  - .design/foundation/architecture.md
  - .design/foundation/conventions.md
  - .design/foundation/naming-conventions.md
  - .design/technology/tech-stack.md
status: ready
points: 5
depends_on: []
external_depends_on: []
wave: 1
---

## Goal / user value
Lay down the empty workspace every other story builds in: a pnpm + Nx monorepo with the directory layout pinned by the design (`apps/ui`, `services/api`, `services/agent`, `packages/contracts`, `packages/tools-*`, `packages/data-*`), strict TypeScript, ESM everywhere, Prettier, base ESLint, and a runnable `pnpm install` from a clean checkout. This is the substrate that gives FR-024's "distinct modules / packages with no cyclic dependencies" a place to live and gives FR-025's "runnable from a clean checkout" its first checkpoint.

## Context
The design pins the workspace layout in `foundation/naming-conventions.md` and the language posture in `foundation/conventions.md`. Versions are pinned in `technology/tech-stack.md` (TypeScript 5.6.3, pnpm 9.12.3, Nx 20.1.4, Node 22.11.0). The composition root for runtime services lives under `services/`; reusable packages live under `packages/`. No business code yet — this story is workspace bones only.

## Scope
- Initialize pnpm workspace at the repo root with `pnpm-workspace.yaml`.
- Initialize an Nx 20.1.4 workspace and create the directory skeleton: `apps/ui`, `services/api`, `services/agent`, `packages/contracts`, `packages/tools`, `packages/tools-web-search`, `packages/tools-data-store`, `packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`, `packages/test-fixtures`, `packages/ui-tokens`.
- Each package gets a stub `package.json` (under the `@neo-search/` scope per `naming-conventions.md`) and a `src/index.ts` that re-exports nothing yet.
- Pin every dependency to exact versions per `technology/tech-stack.md` (TypeScript 5.6.3, Node 22.11.0 in `engines`, pnpm 9.12.3 in `packageManager`). No `^` or `~` ranges.
- Root `tsconfig.base.json` enables `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `target: "ES2022"`. Each package has a `tsconfig.json` that extends it.
- Root Prettier config (3.3.3) and base ESLint flat config (9.14.0 + `typescript-eslint` 8.13.0). Lint rules wired but enforcement-tightening (module-boundaries, madge) is STORY-018's job.
- Add a `Makefile` (or root `package.json` scripts) exposing `install`, `build`, `lint`, `format`, `test`, `clean` — `pnpm install && pnpm build` MUST succeed on a clean checkout.
- Commit `pnpm-lock.yaml`.

## Out of scope / non-goals
- No business logic in any package (later stories own that).
- No Nx `enforce-module-boundaries` rule yet (STORY-018).
- No CI workflow (STORY-018 sets the gate list; CI wiring is left to a follow-up after the MVP merges — see Open follow-ups).
- No UI tooling (Vite, Tailwind, Radix) — STORY-014 owns the UI scaffold.

## Acceptance criteria
- `pnpm install` MUST succeed from a clean checkout with the committed `pnpm-lock.yaml`.
- `pnpm build` (which fans out to every package's `tsc --noEmit` or build) MUST exit 0.
- `pnpm lint` MUST exit 0 against the empty source tree (no rule failures, no parse errors).
- `pnpm format` MUST exit 0 (Prettier finds nothing unformatted).
- Every package directory listed in Scope MUST exist and contain a `package.json` named `@neo-search/<name>`, a `tsconfig.json` extending `tsconfig.base.json`, and an `src/index.ts`.
- Every dependency in every `package.json` MUST be pinned to an exact version (no `^`, `~`, or `latest`); a CI-grade grep MUST be addable in STORY-018 against this rule.
- The root `package.json` MUST set `"type": "module"`, `"packageManager": "pnpm@9.12.3"`, and `"engines": { "node": "22.11.0" }`.
- The four contract module files (`packages/contracts/src/ui-api.ts`, `api-agent.ts`, `agent-tools.ts`, `tools/data-store.ts`) MUST exist as empty placeholders re-exported through `packages/contracts/src/index.ts`. Concrete shapes land in STORY-002.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- A `README.md` at the repo root documents `pnpm install && pnpm build && pnpm lint` as the smoke check.

## Test plan
- Unit: none (no business logic yet).
- Integration: a CI job that runs `pnpm install && pnpm build && pnpm lint && pnpm format` from a clean checkout asserts the smoke check.
- E2E: not applicable yet.
- Adversarial / NFR coverage: none directly — this story underpins the NFR coverage in later stories. (FR-024 boundary enforcement is gated separately by STORY-018.)

## Affected design surface
- `.design/foundation/architecture.md` — establishes the four-layer system shape this scaffold mirrors.
- `.design/foundation/conventions.md` — TypeScript strict, ESM, Prettier, ESLint baseline applied here.
- `.design/foundation/naming-conventions.md` — `@neo-search/` package scope and directory layout pinned here.
- `.design/technology/tech-stack.md` — every pinned version comes from this file.

## Dependencies
- **Depends on**: none (wave 1 root).
- **Enables**: STORY-002 (needs the workspace), STORY-014 (needs `apps/ui` to exist), STORY-018 (needs the lint config to extend).

## Risks & assumptions
- Risk: a future Nx 20.x patch release changes the `enforce-module-boundaries` rule shape. Mitigation: version is pinned exactly per `technology/tech-stack.md`; upgrades go through a single-purpose `chore(deps):` commit per `naming-conventions.md`.
- Assumption: the developer machine has Node 22.11.0 and Corepack enabled (Corepack ships with Node 22 by default and activates the pinned pnpm version from `packageManager`).

## Source excerpts
> Top-level directories MUST follow the layout in `.design/components/`: `apps/ui`, `services/api`, `services/agent`, `packages/contracts`, `packages/tools-*`, `packages/data-*`. The exact mapping MUST be captured in the Nx workspace configuration referenced in `technology/tech-stack.md`.

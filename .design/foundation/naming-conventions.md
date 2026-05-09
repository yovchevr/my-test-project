---
title: Naming conventions
read_when: creating any new file, module, package, branch, commit, or test
---

# Naming conventions

A predictable name is the cheapest form of documentation. These rules MUST be followed without exception so downstream agents can navigate the repo by name alone.

## Files and directories

- Source files MUST use `kebab-case.ts` (e.g. `search-cache.ts`, `agent-loop.ts`). React component files MAY use `PascalCase.tsx` to match the exported component name.
- Test files MUST sit next to the file under test as `<name>.test.ts` (unit) or `<name>.spec.ts` (integration / contract). End-to-end tests MUST live under `tests/e2e/<feature>.e2e.ts` at the repo root.
- Test fixtures MUST live under `__fixtures__/` adjacent to the test that uses them. Shared fixtures MUST live under a dedicated `packages/test-fixtures/`.
- Top-level directories MUST follow the layout in `.design/components/`: `apps/ui`, `services/api`, `services/agent`, `packages/contracts`, `packages/tools-*`, `packages/data-*`. The exact mapping MUST be captured in the Nx workspace configuration referenced in `technology/tech-stack.md`.

## Packages

- Internal packages MUST be scoped under `@neo-search/` (the org-level scope chosen for this prototype). Public package names like `@neo-search/contracts`, `@neo-search/agent`, `@neo-search/data-layer` MUST mirror the layer names from `foundation/architecture.md`.
- The public surface of every package MUST be re-exported through `src/index.ts`. Direct imports of internal paths from another package MUST NOT compile (enforced by the package's `exports` field).

## Modules and types

- Modules MUST use `lowerCamelCase` for functions and values, `PascalCase` for types, classes, and React components. Constants exported from a module MUST be `SCREAMING_SNAKE_CASE` only when they encode environment / build-time pins; runtime tunables MUST be regular `lowerCamelCase`.
- Contract types (the FR-021 schemas) MUST end in `Contract` (`SearchRequestContract`, `ToolErrorContract`). Internal types MUST NOT end in `Contract`.
- Result-type wrappers MUST follow `Result<T, E>` from `@neo-search/contracts`. Ad-hoc per-module result shapes MUST NOT be defined.
- Boolean variables, fields, and parameters MUST be prefixed with `is`, `has`, `should`, or `can` (`isStale`, `hasCitations`). Negated names (`isNotReady`) MUST NOT be used — invert the question instead.

## Variables

- A variable's name MUST describe the value, not the type. `chunks` is acceptable; `chunkArray` is not.
- Single-letter names MUST NOT be used outside of trivially-scoped iteration (`for (const c of chunks)` is fine; `const c = await ...` is not).
- The keyword "data" MUST NOT be used alone. Name what the data is: `cachedResults`, `historyEntries`, `bookmarkRecords`.

## Tests

- Test names MUST be a sentence describing the behavior under test, written in present tense: `it("returns the FR-005 error state when the web search tool exhausts its 10s budget")`.
- Each FR/NFR MUST have at least one test whose name cites the requirement ID. Grep-ability is the point.
- Test file names MUST mirror the source file: `search-cache.ts` → `search-cache.test.ts`. Do NOT lump multiple subjects into a single `tests/all.test.ts`.

## Branches

- Branch names MUST follow `<type>/<short-slug>`:
  - `feat/<slug>` — new functionality.
  - `fix/<slug>` — bug fix against existing functionality.
  - `chore/<slug>` — tooling / dependency / non-behavioral change.
  - `design/<slug>` — reserved for the `solution_designer` agent's worktree branches.
  - `requirements/<slug>` — reserved for the `business_analyst` agent's worktree branches.
- The `<slug>` MUST be lowercase, kebab-cased, and SHOULD contain a stable identifier — an FR ID, an ADR number, or the initiative slug.
- Long-lived branches other than `main` MUST NOT exist. Topic branches die at merge.

## Commits

- Commit subjects MUST follow Conventional Commits: `<type>(<scope>): <subject>`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`. Scope is the package or component name (`agent`, `data-layer`, `contracts`, `ui`).
- Subjects MUST be ≤ 72 characters, imperative mood, no trailing period.
- The body MUST explain *why*, reference the FR/NFR/ADR IDs it implements, and call out anything a reviewer needs to know about test coverage.
- Commits implementing an FR or fixing an FR-tagged failure MUST include a `Refs:` trailer listing the IDs (`Refs: FR-013, NFR-006`).

## Tools and contracts

- Each tool registered with the tooling layer (FR-022) MUST be named `<verb>-<noun>` (e.g. `web-search`, `data-store`, `data-fetch`). Tool names MUST be unique across the registry.
- Each contract schema MUST be named for the boundary it sits on, suffixed with `Contract`: `UiApiAnswerContract`, `ApiAgentRequestContract`, `AgentToolInvocationContract`, `AgentDataReadContract`. The four names MUST appear in `packages/contracts/src/index.ts`.

## Logging events

- The `event` field of every structured log line MUST be `<component>.<verb>` in lowercase (`agent.tool-invoked`, `data-layer.chunk-loaded`). Free-form messages MUST NOT be logged as events.

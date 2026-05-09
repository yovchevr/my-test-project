---
title: Code conventions
read_when: writing or reviewing any code change
---

# Code conventions

These rules apply to every file written under this design. They are deliberately small and explicit so a downstream agent does not have to guess.

## Language posture

- The system MUST be implemented in TypeScript end-to-end (UI, API, agent, tooling, data layer). See `technology/tech-stack.md` for the pinned versions and rationale.
- TypeScript `strict` mode MUST be enabled. `any` MUST NOT appear in production code; if a third-party type is genuinely missing, narrow it with `unknown` plus a typed parser at the boundary.
- Module resolution MUST be ESM (`"type": "module"` in every package). CommonJS interop is permitted only at the leaf where a dependency requires it.

## Formatting and linting

- Prettier MUST format every `.ts`, `.tsx`, `.json`, `.md` file. The configuration MUST live at the repo root and MUST NOT be overridden per package.
- ESLint MUST run with `@typescript-eslint` recommended-type-checked plus the project-specific rules listed in `technology/tech-stack.md`. Lint errors MUST fail CI.
- Indent with 2 spaces. Line width SHOULD be ≤ 100 columns. Trailing commas in multi-line literals MUST be present.

## Error handling

- Functions that can fail at a layer boundary MUST return a structured result type (`{ ok: true, value }` or `{ ok: false, error }`) rather than throwing — this keeps the FR-021 contracts honest.
- Inside a layer, throwing is permitted, but every throw MUST be caught at the layer boundary and converted into the structured result above.
- Errors crossing a layer boundary MUST carry a `kind` discriminant (e.g. `"transient"`, `"terminal"`, `"validation"`) so callers can react without string-matching messages — this is what makes FR-023's transient/terminal distinction implementable.
- The agent's tool-invocation path MUST treat a thrown exception from a tool as a terminal error and surface it as FR-005. Tools MUST prefer returning structured errors over throwing.
- The retry policy pinned in NFR-005 (2 retries, 500ms fixed backoff, 10s budget) MUST be implemented as a single reusable helper and MUST NOT be reimplemented per tool.

## Logging

- All logs MUST be structured (one JSON object per line) with at minimum: `ts`, `level`, `component`, `event`. The `component` field MUST match the directory name under `components/` so logs are traceable to a design unit.
- `console.log` MUST NOT appear in production code. Use the shared logger.
- Logs MUST NOT include the user's full query verbatim if the query exceeds 500 characters; truncate and mark `truncated: true`. (Defensive — there is no PII regime per OQ-004, but unbounded log lines harm operability.)

## Comments

- Comments MUST explain *why*, not *what*. The code says what.
- A comment MUST be added when the code intentionally departs from this conventions doc, an ADR, or a contract — and MUST cite the FR/NFR/ADR ID it answers to.
- TODOs MUST include an owner and a tracking reference (issue, ADR, or FR ID). Bare `TODO:` lines MUST NOT be checked in.
- Public exports (anything re-exported from a package's `index.ts`) MUST carry a TSDoc block describing inputs, outputs, and failure modes.

## Imports and dependencies

- Cross-layer imports MUST go through the layer's published contract module — never reach into another layer's `src/internal/`. The four layer boundaries (FR-021) are the only legal import seams.
- Circular imports MUST NOT exist. CI MUST run `madge --circular` (or equivalent) and fail on a hit.
- A new runtime dependency MUST be justified in `technology/tech-stack.md` with a pinned version and a one-line rationale before being added to `package.json`.

## Determinism

- Code that touches the chunking / indexing layer MUST be deterministic given the same inputs (same chunk boundaries, same index entries) — see FR-019 and FR-020. Non-determinism in this layer makes the chunking strategy unverifiable.
- Time and randomness MUST be injected (clock and RNG passed as constructor args or function parameters), not read directly from `Date.now()` / `Math.random()` inside business logic. This is what makes the NFR-005 retry timing testable.

## Async posture

- Every async function MUST handle cancellation by accepting an `AbortSignal` parameter. The agent layer MUST propagate the request's signal down to every tool invocation so the 10s NFR-005 budget can interrupt in-flight work.
- Promise rejections MUST never silently swallow errors. The shared `runWithBudget` helper (see `components/agent.md`) is the only place permitted to convert a rejection into a terminal error.

## File and module size

- A single source file SHOULD stay under 300 lines. If it grows beyond that, the responsibility almost certainly wants splitting — apply principle 9 (rates of change) to find the seam.
- A package's public surface (re-exports from `index.ts`) SHOULD be small. If `index.ts` re-exports more than ~10 names, the package is doing two things and SHOULD be split.

## Requirements covered

NFR-006 (no hardcoded flows posture), FR-021 (contracts honored at every boundary), FR-023 (structured tool errors), NFR-005 (retry helper).

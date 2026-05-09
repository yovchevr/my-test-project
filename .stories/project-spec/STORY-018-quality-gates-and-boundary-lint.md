---
id: STORY-018
title: Wire boundary lint coverage gates and AST scans
initiative: .initiatives/project_spec.md
requirements: [FR-021, FR-024, NFR-006]
design_refs:
  - .design/foundation/architecture.md
  - .design/foundation/conventions.md
  - .design/foundation/naming-conventions.md
  - .design/components/communication.md
  - .design/technology/testing.md
  - .design/decisions/0001-layer-boundaries.md
  - .design/decisions/0002-typescript-end-to-end.md
status: ready
points: 3
depends_on: [STORY-002, STORY-003]
external_depends_on: []
wave: 4
---

## Goal / user value
Make the layer-boundary discipline that ADRs 0001/0002 and FR-024 demand structurally enforceable instead of aspirational. Wire the Nx `enforce-module-boundaries` rule (with package tags), the `madge --circular` cycle check, the `no-restricted-imports` rule for `Contract`-suffixed types, the AST scans NFR-006 / I-22 / I-27 require, the coverage floor for core packages, the no-inline-hex rule for `apps/ui`, and the test-name "MUST cite the FR/NFR ID" grep — all running in CI and as pre-commit hooks. Without this story, every other story's lint/AST acceptance criteria are unverifiable.

## Context
Per `tech-stack.md` the gate stack is ESLint 9.14.0 (flat config) + `typescript-eslint` 8.13.0 + Nx tags + `madge` 8.0.0 + Vitest 2.1.4 + Prettier 3.3.3 + lefthook 1.8.2. Per `technology/testing.md` the gates table is the canonical set: format / lint / type-check / unit+integration / contract / E2E (deferred to STORY-019) / cycle / coverage. Per ADR 0002 only `@neo-search/contracts` may export `*Contract` types. Per `agent.md` the agent's AST MUST contain zero `if (query === ...)` and zero `switch (sourceFilter)` blocks. Per `data-store-tool.md` the data-store handler MUST contain zero `switch (op)` blocks. Per `web-search-tool.md` the web-search handler MUST contain zero retry loops or backoff timers. Per `agent.md` `runWithBudget` is the only legal `setTimeout`-based wait in the agent package.

## Scope
- Configure Nx project tags per layer in `nx.json` and each package's `project.json`:
  - `apps/ui`: `layer:ui`
  - `services/api`: `layer:api`
  - `services/agent`: `layer:agent`
  - `packages/tools`, `packages/tools-web-search`, `packages/tools-data-store`: `layer:tools`
  - `packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`: `layer:data`
  - `packages/contracts`, `packages/ui-tokens`, `packages/test-fixtures`: `layer:shared`
- Add `enforce-module-boundaries` rule constraints encoding `communication.md` "Edges that MUST NOT exist":
  - `layer:ui` MAY import `layer:shared` only.
  - `layer:api` MAY import `layer:shared`, `layer:agent`.
  - `layer:agent` MAY import `layer:shared`, `layer:tools`. (NOT `layer:data`.)
  - `layer:tools` MAY import `layer:shared`, `layer:data`.
  - `layer:data` MAY import `layer:shared` only.
  - `layer:shared` MAY import `layer:shared` only.
- Add `no-restricted-imports` / `no-restricted-syntax` ESLint rules:
  - Forbid `Contract`-suffixed type declarations outside `@neo-search/contracts` (ADR 0002, naming convention).
  - Forbid hex literals (`#[0-9a-fA-F]{3,8}`) in `apps/ui/src/**/*.{ts,tsx}` outside `packages/ui-tokens` (NFR-002).
  - Forbid `console.log` in production code (`foundation/conventions.md`).
  - Forbid bare `TODO:` lines without an owner / FR ref (`foundation/conventions.md`).
- Add `madge --circular --extensions ts,tsx .` as a CI gate for I-20.
- Add Vitest coverage gate: `vitest run --coverage` MUST report ≥ 80% lines for `services/agent`, `packages/data-cache`, `packages/data-history`, `packages/data-bookmarks`, `packages/contracts`, `packages/tools`, `packages/tools-web-search`, `packages/tools-data-store` (per `technology/testing.md`).
- Add a custom AST-scan test under `tools/lint/no-hardcoded-flows.test.ts` (or equivalent) per `technology/testing.md` NFR-006 row. Asserts:
  - The agent loop file (`services/agent/src/agent-loop.ts` or wherever the loop lives) contains zero `if (query === ...)` AND zero `if (query.startsWith(...))` AND zero `switch (sourceFilter)` blocks.
  - The data-store tool handler contains zero `switch (op)` blocks (lookup table only).
  - The web-search tool handler contains zero `setTimeout` or backoff-loop calls (retry lives in `runWithBudget` only).
  - `runWithBudget` is the only file in `services/agent` that creates a derived `AbortSignal` from a budget timer.
- Add a repo-grep test asserting no schema in any `data-*` package contains a `user_id`, `tenant_id`, or `session` column (NFR-006 / OQ-005 — per STORY-006/007 acceptance criteria).
- Add a contract-test gate: `vitest run packages/contracts` MUST run as its own job and assert every example payload validates against its schema (ties STORY-002's contract tests to CI).
- Add a lefthook pre-commit config: runs `eslint --fix`, `prettier --check`, `vitest --run --changed` on staged files.
- Add a CI workflow file (`.github/workflows/ci.yml` or equivalent — picking GitHub Actions as the default per the testing-doc reference) running every gate on every push.
- Add a "test name MUST cite FR/NFR ID" grep job — for every FR-* / NFR-* listed in `.requirements/`, assert at least one test name in the codebase contains that ID. Fail the build if any FR/NFR has zero tests.
- Add a dependency-version audit: a small script that asserts no `package.json` contains a `^` or `~` range (per `tech-stack.md` versioning posture).
- Add a contract-test job specifically targeting the FR-021 boundary tests in `packages/contracts/src/__tests__/`.

## Out of scope / non-goals
- No E2E gate (STORY-019 owns the Playwright wiring; this story exposes the gate slot but the Playwright config lives there).
- No test-content authoring — this story enforces test PRESENCE per FR/NFR ID, not test quality.
- No security scanning (Snyk, Dependabot) — out of prototype scope per OQ-004.
- No deployment / release gating.

## Acceptance criteria
- A test attempt to add an `import { HistoryStore } from "@neo-search/data-history"` inside `services/agent/src/` MUST fail lint (Nx `enforce-module-boundaries` violation: `layer:agent` cannot import `layer:data`).
- A test attempt to declare `export type FooContract = ...` in any package other than `@neo-search/contracts` MUST fail lint (`no-restricted-syntax`).
- A test attempt to add `<div className="bg-[#ff0000]">` in `apps/ui/src/` MUST fail lint (no inline hex).
- `madge --circular --extensions ts,tsx .` MUST exit 0 on the current source tree.
- `vitest run --coverage` MUST exit 0 with ≥ 80% line coverage on each gated package.
- The AST-scan test MUST pass on the current code (zero hardcoded query branches in the agent; zero `switch (op)` in data-store tool; zero retry loop in web-search tool).
- The repo-grep MUST find no `user_id`/`tenant_id`/`session` column in any `data-*` migration.
- The "every FR/NFR has at least one test name citing it" grep MUST exit 0 against the current codebase (every FR-001..FR-025, NFR-001..NFR-006 has at least one test name containing the ID).
- The dependency-version audit MUST exit 0 (every dep is exact-pinned).
- The CI workflow MUST run each gate on push and on PR; a red gate MUST block merge.
- `pnpm pre-commit` (lefthook) MUST run on staged files and reject commits that violate any gate above.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- Each gate listed above is documented in repo `README.md` "Quality gates" section so a new contributor can run them locally.

## Test plan
- Unit (`tools/lint/*.test.ts`): the AST-scan implementation has unit tests for each scan rule (a tiny synthetic fixture with the offending pattern fails; a clean fixture passes).
- Integration: a meta-test runs `pnpm lint && pnpm type-check && pnpm test && pnpm madge && pnpm coverage` against the current tree and asserts exit 0.
- E2E: not applicable here.
- Adversarial / NFR coverage:
  - **NFR-006**: this story IS the structural guard for NFR-006 — the AST scans, no-`switch`, no-hardcoded-branch, and no-user-id-column rules together close the loop. A regression that adds any of these patterns fails CI.
  - **FR-024**: the `enforce-module-boundaries` constraints are the structural guard. ADR 0001's "lint must reliably catch agent → data-layer imports" risk is mitigated here.
  - **FR-021**: the `no-restricted-syntax` rule + the contract-test job make ADR 0002's "single source of truth" structural.

## Affected design surface
- `.design/foundation/architecture.md` — boundary rules are now structurally enforced.
- `.design/foundation/conventions.md` — every coding rule with a "lint MUST" or "MUST NOT" clause is wired here.
- `.design/foundation/naming-conventions.md` — the `Contract`-suffix rule, branch-name patterns (commit-msg gate, OPTIONAL).
- `.design/components/communication.md` — "Edges that MUST NOT exist" become the Nx tag constraints.
- `.design/technology/testing.md` — the gates table is the canonical reference.
- `.design/decisions/0001-layer-boundaries.md` — the agent-imports-data risk mitigation.
- `.design/decisions/0002-typescript-end-to-end.md` — the lint rule for `Contract`-suffix types.

## Dependencies
- **Depends on**: STORY-002 (the contract-test job needs the contracts to exist), STORY-003 (the registry's "no internal-import" `exports` field gets re-asserted by lint).
- **Enables**: every later story (002+ benefit from the gates as soon as they're wired). In particular, the AST scans depend on the agent code from STORY-011, the data-store handler from STORY-010, etc. — but the gates SHOULD be wired first; they pass trivially against an empty source tree, and tighten as code lands. New code violating a gate fails its own PR.

## Risks & assumptions
- Risk: a gate is too strict and blocks legitimate work (e.g. an explicit-permitted hex in a token file). Mitigation: explicit `eslint-disable` with an FR/ADR reference in a comment is acceptable per `foundation/conventions.md`; reviewers gate the exception.
- Risk: AST scans become brittle when source files move. Mitigation: scans operate on the package + symbol level (e.g. "the file exporting `agentLoop`"), not on hardcoded paths.
- Assumption: GitHub Actions is the CI substrate. If the team prefers another (CircleCI, GitLab), the workflow file is portable — gates run via `pnpm` scripts.

## Source excerpts
> CI MUST run every quality gate on every PR. A red gate MUST NOT be bypassed by `--no-verify` or by disabling the check.

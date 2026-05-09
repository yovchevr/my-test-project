---
id: STORY-019
title: Build the Playwright E2E smoke and NFR suites
initiative: .initiatives/project_spec.md
requirements: [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-012, FR-025, NFR-001, NFR-002, NFR-005]
design_refs:
  - .design/components/ui-shell.md
  - .design/components/web-search-tool.md
  - .design/components/agent.md
  - .design/technology/testing.md
status: ready
points: 5
depends_on: [STORY-013, STORY-017]
external_depends_on: ["TAVILY_API_KEY env var available in the smoke job", "ANTHROPIC_API_KEY env var available in the smoke job"]
wave: 11
---

## Goal / user value
Close the FR-001..FR-006 + FR-012 + NFR-001/002/005 verification loop with the Playwright suites `technology/testing.md` enumerates. This is the only test layer that exercises the running system end-to-end (UI → API → agent → tools → data layer). The smoke job is also the FR-025 deliverable's "end-to-end functional prototype" gate — if `pnpm install && pnpm dev` (or its docker-free equivalent) doesn't pass smoke, the deliverable is broken.

## Context
Per `technology/testing.md` Playwright tests live under `tests/e2e/<feature>.e2e.ts` at the repo root. The pinned runner is `@playwright/test@1.48.2`. Smoke runs against the live Tavily + Anthropic stack (gated by env-var key presence so PRs without the keys still pass non-smoke gates). Visual diffs are Playwright's screenshot snapshots. NFR-001 is a parameterized matrix at 320/375/768/1280/1920px. NFR-002 is a per-screen visual-system snapshot covering app-shell, results list, empty state, error state, source-filter bar — plus hover/focus assertions for visible affordances.

## Scope
- New `playwright.config.ts` at the repo root: pin `chromium` and `firefox` projects (per `technology/testing.md` "any FR-001..FR-006 scenario fails in Chromium and Firefox"); a separate `smoke` project gated by `process.env.TAVILY_API_KEY && process.env.ANTHROPIC_API_KEY`; a `webServer` config that boots `pnpm dev` (UI + API + agent in-process per `services/api/src/main.ts`) before the suite.
- New `tests/e2e/app-shell.e2e.ts` — top bar visible/sticky across pages and viewports (FR-001).
- New `tests/e2e/search-controls.e2e.ts` — full-width search bar at 320px, max-width on desktop, primary submit, loading state from submit until response (FR-002).
- New `tests/e2e/source-filter.e2e.ts` — exactly LIVE/HISTORY/BOOKMARK with icon + label; selecting one filters the results area (FR-003).
- New `tests/e2e/results-list.e2e.ts` — card rendering with title, snippet, domain, clickable link (FR-004).
- New `tests/e2e/empty-and-error-states.e2e.ts` — zero-result query → empty state; fault-injected (network-mocked) tool error → error state; both follow visual system (FR-005).
- New `tests/e2e/pagination.e2e.ts` — "load more" affordance present; skeleton/spinner during fetch; disappears on resolve (FR-006).
- New `tests/e2e/responsive.e2e.ts` — parameterized matrix at 320/375/768/1280/1920 across the FR-001..FR-006 surfaces; assertions: no horizontal scroll, no clipped text, every interactive element is keyboard-reachable (NFR-001).
- New `tests/e2e/visual-system.e2e.ts` — per-screen Playwright screenshot snapshots; assert no inline hex outside palette tokens (covered by lint in STORY-018; this is a visual-diff backstop); hover/focus state snapshots (NFR-002).
- New `tests/e2e/web-search-failure.e2e.ts` — Playwright network-mocking to inject (a) one transient failure → success after 1 retry; (b) two transient → success after 2; (c) three transient → FR-005 error state shown; (d) hang exceeding 10s → cancelled, FR-005 error state (NFR-005).
- New `tests/e2e/live-search.e2e.ts` — smoke-only, gated by `TAVILY_API_KEY`; one real search returns parsed structured results (FR-012).
- New `tests/e2e/smoke.e2e.ts` — smoke-only, gated by both keys: `pnpm install && pnpm build && pnpm dev` (background), navigate, perform a search, assert answer + references render, save a bookmark, switch to BOOKMARK filter, assert the bookmark appears (FR-025 working-prototype gate).
- Wire a `pnpm e2e` script at the root running non-smoke Playwright projects; `pnpm e2e:smoke` runs the smoke project.
- Wire the Playwright CI job in the workflow STORY-018 created — non-smoke runs on every PR; smoke runs on `main` push or via manual dispatch (env keys are repo secrets).

## Out of scope / non-goals
- No load testing beyond the NFR-003 stress in STORY-008 (which is Vitest, not Playwright).
- No accessibility audit beyond NFR-002's keyboard-reachability assertions (no axe-core wiring yet — could land as a follow-up).
- No mobile-device emulation beyond viewport-width parameters (no touch-event simulation).
- No A/B variant or multi-locale testing.

## Acceptance criteria
- `pnpm e2e` MUST pass on a clean checkout (non-smoke projects run against the dev stack with mocked network where required).
- Every Playwright spec listed in Scope MUST exist and MUST contain at least one assertion citing the FR/NFR ID it covers (per STORY-018's "test name MUST cite FR/NFR ID" grep).
- The non-smoke projects MUST pass in both Chromium AND Firefox (per `technology/testing.md`).
- The responsive matrix at 320/375/768/1280/1920px MUST pass for every FR-001..FR-006 scenario (NFR-001).
- The web-search-failure spec MUST cover all four NFR-005 sub-cases (1 transient + recover, 2 transient + recover, 3 transient + FR-005, hang > 10s + FR-005).
- The smoke spec MUST exit 0 when both env keys are present; MUST be skipped (not failed) when either is missing.
- Visual-system snapshots MUST be committed under `tests/e2e/__snapshots__/` and the suite MUST fail on a meaningful pixel diff (Playwright's default threshold).
- The Playwright CI job MUST run every PR (non-smoke) and MUST run smoke on `main` push.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass on the test sources.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The CI workflow YAML from STORY-018 is extended to include the Playwright job (non-smoke + smoke split).
- Repo `README.md` documents `pnpm e2e` and `pnpm e2e:smoke` and the env-var prerequisites.

## Test plan
- Unit: not applicable (this story IS the e2e harness).
- Integration: not applicable (the e2e harness IS the integration layer above the in-process integration tests).
- E2E: every spec in Scope.
- Adversarial / NFR coverage:
  - **NFR-001**: the responsive matrix is the canonical adversarial test — five viewport widths × every FR-001..FR-006 scenario; any horizontal scroll, clipped text, or unreachable control fails.
  - **NFR-002**: visual-diff snapshots backstop the lint rule from STORY-018; hover/focus state assertions catch missing rings.
  - **NFR-005**: the four sub-cases in `web-search-failure.e2e.ts` are the canonical adversarial set per `technology/testing.md`; complements STORY-011's unit-level retry tests with end-to-end network mocking.
  - **FR-012**: live-search smoke is the only test in the suite that hits the real Tavily API; without it, a Tavily contract change goes undetected until production demo.
  - **FR-025**: the smoke spec IS the "end-to-end functional prototype" gate — pre-flight before any deliverable demo.

## Affected design surface
- `.design/components/ui-shell.md` — every UI scenario asserted here.
- `.design/components/web-search-tool.md` — the failure taxonomy is exercised end-to-end.
- `.design/components/agent.md` — the budget + retry behavior is exercised end-to-end.
- `.design/technology/testing.md` — implements the entire Playwright section verbatim.

## Dependencies
- **Depends on**: STORY-013 (the API + agent run), STORY-017 (the UI renders the answer + references the smoke test asserts on).
- **Enables**: STORY-020 (deliverable docs reference the running smoke as evidence of "it works").

## Risks & assumptions
- Risk: smoke flakes on third-party API outages. Mitigation: smoke runs on `main` push (post-merge), not as a PR-gating job — a transient outage doesn't block PRs.
- Risk: Playwright snapshot diffs are noisy across OSes. Mitigation: pin the CI runner to one OS (`ubuntu-latest`) for snapshot tests; run cross-browser only for non-snapshot scenarios.
- Assumption: a single Vite dev server + a single Fastify API process in `webServer` is enough for the smoke; if any test ever needs a fresh data dir per spec, refactor to per-test setup.

## Source excerpts
> End-to-end UI tests MUST run under Playwright as `tests/e2e/<feature>.e2e.ts` at the repo root. Run the FR-001..FR-006 E2E suite at viewport widths 320px, 375px, 768px, 1280px, 1920px in a parameterized matrix.

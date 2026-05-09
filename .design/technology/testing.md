---
title: Testing strategy and quality gates
read_when: writing or running tests, or wiring a new quality gate
---

# Testing strategy and quality gates

Testing is the means by which the FR/NFR set becomes verifiable. Every requirement listed in `.requirements/` MUST have at least one test that fails when the requirement regresses. The `.requirements/` index is the source of truth; this document maps each entry to its test surface.

## Test runners

- Unit and integration tests MUST run under **Vitest** (see `technology/tech-stack.md`). Unit tests sit beside the file under test as `<name>.test.ts`; contract / integration tests sit as `<name>.spec.ts`.
- End-to-end UI tests MUST run under **Playwright** as `tests/e2e/<feature>.e2e.ts` at the repo root.
- Contract tests for the four FR-021 boundaries MUST live under `packages/contracts/src/__tests__/<boundary>.spec.ts` and MUST run on both sides of the boundary (provider and consumer).

## Quality gates (CI)

The following gates MUST all pass before any PR merges. A red gate MUST NOT be bypassed by `--no-verify` or by disabling the check.

| Gate | Tool | Failing condition |
| --- | --- | --- |
| Format | `prettier --check` | Any unformatted file. |
| Lint | `eslint .` (with `enforce-module-boundaries`) | Any error-level rule fires; any cross-layer import bypasses I-16..I-21. |
| Type-check | `tsc --noEmit` across the workspace | Any type error. |
| Unit + integration tests | `vitest run` | Any test fails or any FR/NFR-tagged test is missing. |
| Contract tests | `vitest run packages/contracts` | Any of the four boundary contracts is consumed with a shape that does not match its schema. |
| E2E | `playwright test` | Any FR-001..FR-006 scenario fails in Chromium and Firefox. |
| Cycle check | `madge --circular --extensions ts,tsx .` | Any cyclic import (I-20). |
| Coverage floor | `vitest run --coverage` | `lines < 80%` in `packages/agent`, `packages/data-layer`, `packages/contracts`, `packages/tools-*`. UI coverage is not gated; behavior is covered by Playwright. |

## FR coverage matrix

Every FR MUST have at least one test. Where a test exercises multiple FRs (common at the UI), the same test MAY appear in more than one row.

| FR | Test type | Test location (illustrative) | What it asserts |
| --- | --- | --- | --- |
| FR-001 | Playwright | `tests/e2e/app-shell.e2e.ts` | Top bar is visible, sticky, and renders product title + at least one global action across pages and viewports. |
| FR-002 | Playwright | `tests/e2e/search-controls.e2e.ts` | Search bar is full-width on a 320px viewport, max-width on desktop, has a primary submit, and shows a loading state while the agent runs. |
| FR-003 | Playwright | `tests/e2e/source-filter.e2e.ts` | Secondary bar exposes exactly LIVE/HISTORY/BOOKMARK with icon + label, and selecting one filters the results area. |
| FR-004 | Playwright | `tests/e2e/results-list.e2e.ts` | Results render as scrollable card-style rows with title, snippet, domain, and clickable link. |
| FR-005 | Playwright | `tests/e2e/empty-and-error-states.e2e.ts` | A zero-results query renders the empty state; a fault-injected tool error renders the error state. Both follow the visual system. |
| FR-006 | Playwright | `tests/e2e/pagination.e2e.ts` | Either page controls or "load more" affordance is present; skeleton/spinner is visible during a fetch and disappears on resolve. |
| FR-007 | Vitest unit | `services/agent/src/synthesis.test.ts` | Synthesis output contains a non-empty `answer_summary` in paragraph or bullet form, not a flat URL list, and addresses the query. |
| FR-008 | Vitest unit | `services/agent/src/synthesis.test.ts` | Every material claim in the summary carries a citation marker that resolves to a `references` entry; assertion fails if any claim lacks a citation. |
| FR-009 | Vitest unit | `services/agent/src/references.test.ts` | Every reference entry has non-empty `title`, `url`, `context`; no duplicate URLs; URLs are clickable strings. |
| FR-010 | Contract test | `packages/contracts/src/__tests__/ui-api.spec.ts` | Search response payload validates against `UiApiAnswerContract`; `answer_summary` and `references` fields are present and typed. Example payload from FR-025 deliverable validates. |
| FR-011 | Vitest integration | `services/agent/src/agent-loop.spec.ts` | The agent invokes tools via the registry (not direct calls) and routes per source-filter via lookup, not switch. Replacing the loop with a fixed pipeline fails this test. |
| FR-012 | Vitest integration + E2E | `packages/tools-web-search/src/web-search.spec.ts`, `tests/e2e/live-search.e2e.ts` | A live web search returns parsed structured results matching the contract; integration test runs against a recorded fixture, E2E hits the real API in the smoke job. |
| FR-013 | Vitest unit | `services/agent/src/synthesis.test.ts` | Synthesis is invoked once per search request (including HISTORY/BOOKMARK reads) and produces an output that satisfies FR-007/FR-008/FR-009. |
| FR-014 | Vitest integration | `packages/data-layer/src/history-store.spec.ts` | A search appends an entry; restarting the store and re-reading returns the same entry; zero-result searches are recorded too. |
| FR-015 | Vitest integration | `packages/data-layer/src/bookmark-store.spec.ts` | A bookmark save/retrieve round-trips across a process restart; lookup by id resolves to the saved record. |
| FR-016 | Vitest integration | `packages/data-layer/src/search-cache.spec.ts` | A LIVE search writes results to the cache; subsequent reads keyed by query hit the cache and do not invoke the web search tool. |
| FR-017 | Vitest unit | `packages/data-layer/src/chunker.test.ts` | A 1000-result input produces ≥ 10 chunks; no chunk holds the entire result set; chunk boundaries are deterministic. |
| FR-018 | Vitest integration | `packages/data-layer/src/search-cache.spec.ts` | A page-N read for a multi-chunk query touches strictly fewer chunks than the total chunk count (also covers NFR-004). |
| FR-019 | Doc + test | `packages/data-layer/README.md`, `packages/data-layer/src/chunker.test.ts` | Doc states the size policy and boundary criterion; the test asserts the implementation matches the doc. |
| FR-020 | Doc + test | `packages/data-layer/README.md`, `packages/data-layer/src/index.test.ts` | Doc states the index structure and lookup method; the test asserts the index returns the chunks the doc says it returns. |
| FR-021 | Contract tests | `packages/contracts/src/__tests__/*.spec.ts` | All four boundary contracts are defined exactly once in `@neo-search/contracts` and validated by both producers and consumers. |
| FR-022 | Vitest integration | `services/agent/src/tool-registry.spec.ts` | The tool registry contains at least two tools (`web-search`, `data-store`); each has a documented input/output/error schema; the agent invokes them through the registry only. |
| FR-023 | Vitest integration | `services/agent/src/error-handling.spec.ts` | A tool returning a `terminal` error surfaces as the FR-005 error state; a tool returning a `transient` error triggers the NFR-005 retry helper; a thrown exception is treated as terminal and does not crash the request. |
| FR-024 | Lint + Vitest | `eslint enforce-module-boundaries`, `services/agent/src/swap-data-layer.spec.ts` | Cross-layer imports fail lint; swapping the data-layer implementation behind the contract leaves the agent and API tests passing. |
| FR-025 | CI smoke + manual | `tests/e2e/smoke.e2e.ts`, repo-level `docs/` review | End-to-end prototype starts from a clean checkout (`pnpm install && pnpm dev` smoke); each named deliverable doc exists at the expected path. |

## NFR coverage matrix (with adversarial stress)

Per principle 10, every NFR MUST have at least one test that stresses it adversarially — not just a happy path.

| NFR | Test type | Test location | Adversarial stress |
| --- | --- | --- | --- |
| NFR-001 | Playwright | `tests/e2e/responsive.e2e.ts` | Run the FR-001..FR-006 E2E suite at viewport widths 320px, 375px, 768px, 1280px, 1920px in a parameterized matrix. Any horizontal scroll, clipped text, or unreachable control fails. |
| NFR-002 | Playwright + visual diff | `tests/e2e/visual-system.e2e.ts` | Snapshot the app shell, results list, empty state, error state, and source-filter bar; assert each uses palette tokens (no inline hex outside the documented tokens), the typography scale, and consistent spacing. Hover/focus state screenshots assert visible affordances. |
| NFR-003 | Vitest integration | `packages/data-layer/src/large-set.spec.ts` | Drive a 1000-, 5000-, and 10000-result fixture through ingest → chunk → store → page-N → render path. Assert (a) no crash, (b) peak heap stays under a fixed budget (≤ 256 MB), (c) page reads still satisfy NFR-004. |
| NFR-004 | Vitest integration | `packages/data-layer/src/search-cache.spec.ts` (`reads strictly fewer chunks than total when total > 1`) | Spy on the chunk-read path; for a query split into N > 1 chunks, assert the read count for page N is < N. Repeat with N = 2, 10, 100 to catch off-by-one regressions. |
| NFR-005 | Vitest integration + Playwright | `packages/tools-web-search/src/retry.spec.ts`, `tests/e2e/web-search-failure.e2e.ts` | Use injected clock + RNG and a fault-injecting fake transport. Test cases: (a) one transient failure recovers within budget; (b) two transient failures consume both retries and recover; (c) three transient failures exhaust retries and surface FR-005; (d) a hang exceeds the 10s budget and is cancelled via `AbortSignal`; (e) retry intervals are exactly 500ms (asserted via the injected clock). |
| NFR-006 | Static + integration | `services/agent/src/no-hardcoded-flows.test.ts` | (a) AST scan asserts the agent loop contains zero `if (query === ...)` or `if (query.startsWith(...))` branches and zero `switch (sourceFilter)` blocks (lookup tables only). (b) Add-a-tool integration test: register a brand-new no-op tool and run a search; the agent loop file MUST NOT have changed. (c) Add-a-source-filter integration test: extend the routing table; the synthesis step MUST NOT have changed. (d) Repo grep asserts no user-id columns / per-user namespaces in the data layer (per OQ-005). |

## Fixture conventions

- Fixtures MUST live in `__fixtures__/` adjacent to the test that uses them, or in `packages/test-fixtures/` if shared. See `foundation/naming-conventions.md`.
- A 1000-result fixture MUST exist at `packages/test-fixtures/src/large-result-set.json` for NFR-003 / FR-017 tests. The fixture MUST be generated deterministically from a seeded RNG so the test asserts the *system* under test, not the fixture's variance.
- A recorded `web-search` response MUST exist at `packages/tools-web-search/src/__fixtures__/tavily-response.json` for FR-012 integration tests.

## Forbidden test patterns

- Tests MUST NOT use `setTimeout` for waiting. Use the injected clock (per `foundation/conventions.md`) and `vi.useFakeTimers()`.
- Tests MUST NOT depend on test execution order. Vitest runs files in parallel by default; any test that breaks under parallelization MUST be fixed, not serialized.
- Tests MUST NOT hit the real Tavily API in the unit / integration tier. Only the smoke E2E job (gated by an env-var-supplied API key) hits the live API.
- Tests MUST NOT mutate shared fixtures in place. Clone before mutating.

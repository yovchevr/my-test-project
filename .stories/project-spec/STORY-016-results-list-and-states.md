---
id: STORY-016
title: Render results list with empty error and pagination states
initiative: .initiatives/project_spec.md
requirements: [FR-004, FR-005, FR-006]
design_refs:
  - .design/components/ui-shell.md
  - .design/components/search-api.md
status: ready
points: 5
depends_on: [STORY-002, STORY-014, STORY-013]
external_depends_on: []
wave: 9
---

## Goal / user value
Render search results as the scrollable card-style list FR-004 mandates, the purposeful empty/error states FR-005 mandates, and the progressive-loading "load more" affordance FR-006 mandates. Wire `SearchPanel` (STORY-015) into the API (STORY-013) via React Query so a submit fires `POST /api/search` and the results render — or the empty / error state does. This is the screen the user actually sees when they search.

## Context
Per `ui-shell.md` the chosen pagination mechanism is **progressive loading with a "load more" button** — the design fixes this single variant; the component MUST NOT branch on a runtime "pagination mode" flag. Per `search-api.md` write paths carry an optional `clientRequestId` (UUID) for 5s-window dedup — the UI client MUST attach a fresh UUID per submit. Network errors and structured `{ ok: false, error }` responses both surface as the FR-005 error state — distinct from the empty state. The empty state is for zero-result successful queries; the error state is for failed calls.

## Scope
- New `apps/ui/src/components/ResultsList.tsx` — vertically scrollable list of `ResultCard.tsx` rows. Each card renders title, snippet, domain, and a clickable link to `result.url`.
- New `apps/ui/src/components/ResultCard.tsx` — the per-row card; uses `@neo-search/ui-tokens`'s card style (rounded + elevation), respects hover/focus per NFR-002.
- New `apps/ui/src/components/EmptyState.tsx` — purposeful copy ("No results for that query — try a broader search."), follows the same visual system as the populated list (NFR-002).
- New `apps/ui/src/components/ErrorState.tsx` — purposeful copy keyed on the error `kind` (`validation` → "Your search couldn't be processed."; `terminal` → "The search service is unavailable. Try again."; `transient_exhausted` → "We couldn't reach search. Please retry."; `cancelled` → "The search took too long. Try again."), follows the same visual system.
- New `apps/ui/src/components/LoadMoreButton.tsx` — visible when `pagination.hasMore` is true; clicking fires another `POST /api/search` for `page + 1`; appends results to the list. While the fetch is in flight, the button MUST show a spinner (FR-006 acceptance criterion b).
- New `apps/ui/src/api-client.ts` — a thin wrapper over `fetch` returning typed `Result<UiApiAnswerContract, { kind, message }>`. Attaches a fresh UUID `clientRequestId` per write call.
- New `apps/ui/src/hooks/useSearch.ts` — React Query mutation that handles the `POST /api/search` call, exposes `data`, `isLoading`, `error`, and a `loadMore()` callback.
- Top-level `apps/ui/src/App.tsx` composes `AppShell` + `SearchPanel` + `ResultsList`/`EmptyState`/`ErrorState` (state-driven) + `LoadMoreButton` + a skeleton loader during the initial fetch.
- Initial-fetch skeleton: a series of placeholder `ResultCard` shapes (3–5 rows) with shimmer styling, visible during the first request.
- The components MUST NOT define a local copy of `UiApiAnswerContract`, `ResultCard`, or `Pagination` — all from `@neo-search/contracts` (I-34).
- The UI MUST NOT call agent or data-layer code directly — only the API via `api-client.ts` (I-16).

## Out of scope / non-goals
- No answer summary or references rendering (STORY-017).
- No bookmark save UI (STORY-017).
- No infinite-scroll variant (the design fixes "load more" — `ui-shell.md` "Variation accommodated" pins the single variant).
- No ARIA live-region for screen readers beyond Radix's defaults (acceptable at prototype scope; revisit if accessibility becomes a hard gate).

## Acceptance criteria
- A successful search response with N > 0 results MUST render N `ResultCard`s, each showing title, snippet, domain, and a clickable link (FR-004 acceptance criteria b, c, d).
- The link on each card MUST navigate to (or open in a new tab — `target="_blank"` + `rel="noopener noreferrer"` for safety) the result's `url` (FR-004 d).
- A successful response with zero results MUST render `EmptyState` (FR-005 a) — NOT a blank screen (FR-005 c).
- A failed call (network error OR structured `{ ok: false, error }`) MUST render `ErrorState` with copy keyed on the error `kind` (FR-005 b) — distinct from the empty state.
- The empty and error states MUST use the same `@neo-search/ui-tokens` palette / typography / spacing as the populated list (FR-005 d) — asserted by structural lint (no inline hex; STORY-018) and snapshot diffs in STORY-019.
- The results area MUST be vertically scrollable when content exceeds the viewport (FR-004 a).
- A `LoadMoreButton` MUST appear when `pagination.hasMore` is true (FR-006 a "load more affordance"); clicking MUST issue another search at `page + 1`; results MUST append to the list (NOT replace).
- A spinner MUST be visible during a `LoadMoreButton` fetch and MUST disappear when the fetch resolves (success or error) (FR-006 b).
- The initial-fetch skeleton MUST appear from submit until the first response arrives.
- Each `POST /api/search` write call MUST attach a fresh UUID `clientRequestId` (per `search-api.md`).
- The components MUST NOT import `services/agent`, `services/api` source, or any `packages/data-*` (I-16; lint-enforced in STORY-018).
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The Vite dev proxy from STORY-014 forwards `/api/*` → `localhost:3001` so the dev server actually hits the API service.

## Test plan
- Unit (`apps/ui/src/components/ResultsList.test.tsx`): renders N cards from a fixture; vertical scroll applies; cards have all four fields; empty array renders `EmptyState`.
- Unit (`apps/ui/src/components/ErrorState.test.tsx`): each `kind` produces the matching copy.
- Unit (`apps/ui/src/components/LoadMoreButton.test.tsx`): visible when `hasMore`, hidden otherwise; clicking calls `loadMore`; spinner appears during the fetch.
- Unit (`apps/ui/src/hooks/useSearch.test.tsx`): the React Query mutation forwards the `SearchRequestContract` shape; appends on `loadMore`; surfaces errors as the `error` state.
- Integration: `apps/ui/src/App.spec.tsx` — full mount with a mocked `fetch`; assert: submit shows skeleton → results render; zero-result response shows empty state; 502 response shows error state with `terminal` copy; load-more appends.
- E2E: deferred to STORY-019 (`tests/e2e/results-list.e2e.ts`, `tests/e2e/empty-and-error-states.e2e.ts`, `tests/e2e/pagination.e2e.ts` per `technology/testing.md`).
- Adversarial / NFR coverage:
  - **NFR-001**: results list scrolls correctly at 320px width; cards reflow without clipping (unit-level via JSDOM viewport; STORY-019 real-browser).
  - **NFR-002**: visual-system enforcement via the no-inline-hex lint rule; visual diff in STORY-019.
  - **FR-005 vs FR-006 separation**: a fault-injecting integration test asserts a `transient_exhausted` response shows ErrorState (NOT EmptyState) AND the loading spinner has stopped.

## Affected design surface
- `.design/components/ui-shell.md` — implements the results area, empty/error states, and the chosen progressive-loading variant verbatim.
- `.design/components/search-api.md` — consumes the `UiApiAnswerContract` and the error-status mapping table.

## Dependencies
- **Depends on**: STORY-002 (`UiApiAnswerContract`, `ResultCardContract`, `PaginationContract`), STORY-014 (shell + tokens), STORY-013 (API endpoints exist).
- **Enables**: STORY-017 (answer summary + references rendering on top of this list), STORY-019 (Playwright suites).

## Risks & assumptions
- Risk: React Query is not pinned in `tech-stack.md` (only "React Query" is mentioned). Mitigation: the developer pass adds `@tanstack/react-query` via a single-purpose `chore(deps):` commit per `naming-conventions.md` with a pinned version; document in `tech-stack.md`.
- Risk: a slow API + a fast user double-submit could race. Mitigation: the dedup window in STORY-013 (5s `clientRequestId`) handles it server-side; client-side, React Query's mutation also natively rejects overlapping calls.
- Assumption: append-on-load-more (vs. replace) is the right semantic for progressive loading; matches `ui-shell.md`'s "lower interaction cost on mobile" rationale.

## Source excerpts
> The system MUST render search results as a scrollable list of card-style rows, each carrying a title, a summary snippet, the originating domain or site name, and an explicit clickable link to the source. The system MUST render purposeful empty and error states in the results area instead of a blank screen.

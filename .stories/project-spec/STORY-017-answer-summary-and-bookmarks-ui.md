---
id: STORY-017
title: Render the answer summary references and bookmark UI
initiative: .initiatives/project_spec.md
requirements: [FR-007, FR-008, FR-009, FR-015]
design_refs:
  - .design/components/ui-shell.md
  - .design/components/synthesis.md
  - .design/components/search-api.md
status: ready
points: 3
depends_on: [STORY-013, STORY-016]
external_depends_on: []
wave: 10
---

## Goal / user value
Render the primary user-facing payload — the `answer_summary` with inline `[N]` markers (FR-007 / FR-008) above the results list, and the structured `references[]` (FR-009) as a dedicated section. Wire the bookmark-save action (FR-015 UI side) on each result card and on the answer itself, calling `POST /api/bookmarks`. With this story merged, the user sees what FR-007 promised: a cited answer, not a link dump.

## Context
Per `synthesis.md` the citation marker form is **inline numeric markers** `[1]`, `[2]`, … pointing into the references list — other forms MUST NOT be substituted. The references block sits below the answer summary and above the underlying `ResultsList` from STORY-016. Per `ui-shell.md` the UI's contract for save/list bookmarks is the API endpoints; `BookmarkSaveRequestContract` carries either a `resultId` or an `answerId`. Per FR-009 / I-3 every reference has non-empty title/url/context — the validator (STORY-012) ensures the API never returns a bad shape, so the UI MAY assume well-formed data and render directly.

## Scope
- New `apps/ui/src/components/AnswerSummary.tsx` — renders `answer_summary` text, parsing inline `[N]` markers into clickable anchors that scroll-to or highlight the matching reference entry. Rendered above the `ResultsList`.
- New `apps/ui/src/components/ReferencesList.tsx` — renders `references[]` as a numbered list (1, 2, …) with title (linked to `url`), domain, and the one-line `context`. Each entry is the target of an in-page anchor `#ref-N`.
- New `apps/ui/src/components/BookmarkButton.tsx` — a small icon button rendered on each `ResultCard` and on the `AnswerSummary`. Clicking calls `POST /api/bookmarks` with `{ kind: "result", payload: <result> }` or `{ kind: "answer", payload: <answer> }`. Toggles to a "saved" visual state on success.
- Update `apps/ui/src/components/App.tsx` (or its equivalent) to compose `AnswerSummary` + `ReferencesList` + the existing `ResultsList` from STORY-016 into the search response layout.
- Update `apps/ui/src/api-client.ts` (from STORY-016) with `saveBookmark(req)`, `listBookmarks(page)`, `listHistory(page)` calls. Each write call attaches a fresh UUID `clientRequestId`.
- The HISTORY and BOOKMARK source filters MUST trigger different fetch paths (handled at the API; the UI simply forwards the chosen filter as part of `SearchRequestContract`). When the source filter is BOOKMARK, the existing `useSearch` hook still returns a `UiApiAnswerContract` — the response includes the same `answer_summary` + `references` shape, just synthesized from saved data per FR-013 / `agent.md` "Synthesis is invoked uniformly".
- Citation marker rendering MUST be the only marker form — no footnote variant, no "Sources:" block (per `synthesis.md`).
- Keyboard navigation: clicking a `[N]` marker (or pressing Enter on it) MUST move focus to the matching `ReferencesList` entry.

## Out of scope / non-goals
- No bookmark-delete UI (no FR/AC asks for it; deferred).
- No history-detail drill-in beyond the standard search flow with the HISTORY filter.
- No streaming summary rendering (deferred per `synthesis.md`).
- No edit/share-bookmark features.

## Acceptance criteria
- `AnswerSummary` MUST render the `answer_summary` text and convert inline `[N]` substrings into anchor elements pointing at `#ref-N` (FR-007 + FR-008).
- Each anchor MUST be keyboard-focusable; activating it (Enter or click) MUST scroll the matching `ReferencesList` entry into view and visually highlight it.
- `ReferencesList` MUST render every `references[]` entry as a numbered list item with the entry's title (linked to `url` with `target="_blank" rel="noopener noreferrer"`), domain, and the one-line `context` (FR-009 a, c).
- A response with empty `references[]` MUST NOT render the `ReferencesList` block (the empty state from STORY-016 covers no-results).
- `BookmarkButton` on a `ResultCard` MUST call `POST /api/bookmarks` with `{ kind: "result", payload: { resultId: <result.id> } }` (or whatever shape `BookmarkSaveRequestContract` defines) on click; on success, toggle to a "saved" visual state.
- `BookmarkButton` on the `AnswerSummary` MUST call `POST /api/bookmarks` with `{ kind: "answer", payload: { answerId: <answer.id> } }` on click; on success, toggle to "saved" state.
- A failed bookmark save MUST surface a brief inline error notification (toast or inline message) but MUST NOT replace the answer/results view with `ErrorState` (the answer is still valid; the bookmark just didn't save).
- The components MUST NOT define a local copy of `UiApiAnswerContract`, `ReferenceEntryContract`, `BookmarkSaveRequestContract`, or `BookmarkSaveResponseContract` (I-34).
- The components MUST NOT render footnotes or a "Sources:" block — only `[N]` markers + the dedicated `ReferencesList` (per `synthesis.md`).
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.

## Test plan
- Unit (`apps/ui/src/components/AnswerSummary.test.tsx`): inline `[N]` markers render as anchors; clicking a marker scrolls/focuses the matching ref entry; no-marker text renders as-is.
- Unit (`apps/ui/src/components/ReferencesList.test.tsx`): numbered rendering; each entry shows title/url/context; empty list renders nothing; entries have `id="ref-N"` for marker anchoring.
- Unit (`apps/ui/src/components/BookmarkButton.test.tsx`): click triggers the right API call shape; "saved" state toggles on success; failure surfaces an inline notification (not a page-level error state).
- Integration (`apps/ui/src/App.spec.tsx`, extending STORY-016's): full mount with mocked `fetch` returning a sample `UiApiAnswerContract` payload; assert AnswerSummary, ReferencesList, ResultsList all render in the expected DOM order.
- E2E: deferred to STORY-019 (smoke run hits the live agent + synthesis pipeline).
- Adversarial / NFR coverage:
  - **FR-008**: a fixture payload where `[N]` markers point at a non-existent reference index would have been caught by STORY-012's validator BEFORE reaching the UI — but a UI-level guard test asserts the marker's anchor renders even if it points at a missing id (defense in depth: a missing target renders the marker as plain text with a console warning, not a crash).
  - **FR-009 visual / I-3**: a fixture with an empty `context` field would have been caught by STORY-012's validator; the UI test asserts the validator's contract holds (a contract test in STORY-002 asserts the schema rejects an empty context).
  - **NFR-002**: BookmarkButton uses tokenized colors for "saved" vs "unsaved" — no inline hex.

## Affected design surface
- `.design/components/ui-shell.md` — confirms the answer + references rendering shape; bookmark POST endpoint usage.
- `.design/components/synthesis.md` — the citation marker form (`[N]`) is the only form rendered.
- `.design/components/search-api.md` — consumes `BookmarkSaveRequestContract`, `BookmarkSaveResponseContract`.

## Dependencies
- **Depends on**: STORY-013 (the bookmark endpoint exists and is wired through the agent), STORY-016 (the results list and `App` composition surface exist).
- **Enables**: STORY-019 (Playwright smoke / FR-008 / FR-009 e2e), STORY-020 (deliverable docs reference the live answer rendering).

## Risks & assumptions
- Risk: a real Anthropic synthesis output could include text that looks like `[N]` but isn't a citation (e.g. `[1.5x]`). Mitigation: the marker parser MUST only match `\[\d+\]` substrings, and only those whose `N - 1` is a valid index into `references` — all others render as literal text.
- Assumption: `BookmarkSaveRequestContract` exposes `resultId` and `answerId` as documented in `ui-shell.md` (confirmed in STORY-002's contract definitions).

## Source excerpts
> Each material claim or bullet in the summary MUST carry at least one citation reference (inline marker, footnote, or "Sources" block entry) pointing to a result. Each cited source returned with a search response MUST be a structured entry containing at minimum a title, a URL, and a one-line context.

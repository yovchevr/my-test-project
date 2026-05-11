# Test Cases

This document lists the seven test cases the initiative names and maps each to its test implementation.

## Overview

FR-025 acceptance criterion (h) requires listing each of the seven cases the initiative names, each with a test file path and an assertion summary. The seven cases cover the full FR/NFR surface:

1. Live web results (FR-012 + STORY-019 smoke)
2. Summary + cited references (FR-007/008/009 + STORY-012 + STORY-017)
3. History persists and retrieves (FR-014 + STORY-006)
4. Bookmarks persist and retrieve (FR-015 + STORY-007)
5. Chunked data retrieval (FR-018 + STORY-005)
6. Large dataset (NFR-003 + STORY-008)
7. UI source-filters/search-bar/pagination (FR-001..FR-006 + STORY-019)

Each case has at least one automated test that would fail if the requirement regressed. The tests run in CI on every push and are gated by the `pnpm test` and `pnpm coverage` commands.

## 1. Live web results (FR-012)

**Requirements**: FR-012 (live web search integration)

**Test file**: `packages/tools-web-search/src/web-search.spec.ts`

**What it asserts**: A live web search returns parsed structured results matching the `WebSearchOutputContract`. The integration test runs against a recorded fixture from the Tavily API; the E2E smoke job (STORY-019, run with `TAVILY_API_KEY` set) hits the real API and asserts a non-empty result list.

**Assertion summary**:

- Input: `{ query: "TypeBox JSON Schema", maxResults: 10 }`.
- Output: `{ ok: true, value: [result1, result2, ...] }` where each result has non-empty `title`, `snippet`, `domain`, `url`.
- The integration test uses a recorded fixture (`packages/tools-web-search/src/__fixtures__/tavily-response.json`).
- The STORY-019 smoke job (`tests/e2e/smoke.e2e.ts`, planned) exercises the live API end-to-end.

## 2. Summary + cited references (FR-007, FR-008, FR-009)

**Requirements**: FR-007 (summarized answer response), FR-008 (grounded citations), FR-009 (structured reference entries)

**Test files**:

- `services/agent/src/synthesis/synthesis.test.ts` — unit tests for synthesis output.
- `services/agent/src/synthesis/validator.test.ts` — unit tests for citation validator.
- `tests/integration/synthesis-wiring.spec.ts` — integration test for synthesis wiring.
- `packages/contracts/src/__tests__/ui-api.spec.ts` — contract test for the example UI ↔ API payload.

**What it asserts**:

- **FR-007**: Synthesis output contains a non-empty `answer_summary` in paragraph or bullet form, not a flat URL list, and addresses the query.
- **FR-008**: Every material claim in the summary carries a citation marker (`[1]`, `[2]`, …) that resolves to a `references` entry. The validator asserts every `[N]` resolves to `references[N-1]` and every paragraph or bullet contains at least one citation marker.
- **FR-009**: Every reference entry has non-empty `title`, `url`, `context`; no duplicate URLs; URLs are clickable strings.

**Assertion summary**:

- Input: `{ query: "best coffee in SF", results: [result1, result2, ...] }`.
- Output: `{ answer_summary: "...", references: [{title, url, context}, ...] }`.
- The validator rejects output where any citation marker does not resolve or any reference URL is missing from the input results.
- The contract test validates the example payload (`packages/contracts/src/__fixtures__/example-ui-api-answer.json`) against `UiApiAnswerContract`.

## 3. History persists and retrieves (FR-014)

**Requirements**: FR-014 (history store)

**Test files**:

- `packages/data-history/src/history-store.test.ts` — unit tests for history store methods.
- `packages/data-history/src/history-store.spec.ts` — integration tests for history store persistence.

**What it asserts**: A search appends an entry to the history store; restarting the store (simulated by closing and reopening the SQLite connection) and re-reading returns the same entry. Zero-result searches are recorded too.

**Assertion summary**:

- Append: `historyStore.append({ query: "best coffee", sourceFilter: "LIVE", ts, resultChunkIds })` returns `{ id }`.
- List: `historyStore.list(page: 1)` returns `{ entries: [{ query: "best coffee", ... }], pagination }`.
- Persistence: close the SQLite connection, reopen, call `list(page: 1)` again → the entry is still there.

## 4. Bookmarks persist and retrieve (FR-015)

**Requirements**: FR-015 (bookmark store)

**Test files**:

- `packages/data-bookmarks/src/bookmark-store.test.ts` — unit tests for bookmark store methods.
- `packages/data-bookmarks/src/bookmark-store.spec.ts` — integration tests for bookmark store persistence.

**What it asserts**: A bookmark save/retrieve round-trips across a process restart; lookup by id resolves to the saved record.

**Assertion summary**:

- Save: `bookmarkStore.save({ kind: "result", payload: resultCard })` returns `{ id }`.
- Get: `bookmarkStore.get(id)` returns `{ kind: "result", payload: resultCard }`.
- Persistence: close the SQLite connection, reopen, call `get(id)` again → the bookmark is still there.

## 5. Chunked data retrieval (FR-018)

**Requirements**: FR-018 (targeted chunk retrieval)

**Test file**: `packages/data-cache/src/chunker.test.ts`

**What it asserts**: A page-N read for a multi-chunk query touches strictly fewer chunks than the total chunk count (also covers NFR-004).

**Assertion summary**:

- Input: a 1000-result fixture (produces 10 chunks at 100 results/chunk).
- Write: `searchCache.write(query, results)` returns `{ chunkIds: [id0, id1, ..., id9] }`.
- Read page 1: `searchCache.read(query, page: 1)` returns `{ results: [1..25], chunksRead: 1 }`.
- Assertion: `chunksRead < totalChunks` (1 < 10, passes).
- Read page 5: `searchCache.read(query, page: 5)` returns `{ results: [101..125], chunksRead: 1 }`.
- Assertion: `chunksRead < totalChunks` (1 < 10, passes).

## 6. Large dataset (NFR-003)

**Requirements**: NFR-003 (large result set capacity)

**Test file**: `packages/data-cache/src/large-set.spec.ts`

**What it asserts**: Drive a 1000-, 5000-, and 10000-result fixture through ingest → chunk → store → page-N → render path. Assert (a) no crash, (b) peak heap stays under a fixed budget (≤ 256 MB), (c) page reads still satisfy NFR-004.

**Assertion summary**:

- Input: deterministically-generated fixtures at 1000, 5000, 10000 results (from `packages/test-fixtures/src/large-result-set.json` or inline in the test).
- Write: `searchCache.write(query, results)` for each fixture size.
- Read page 1: `searchCache.read(query, page: 1)` → assert `results.length === 25`, `chunksRead < totalChunks`.
- Read page 200 (for 10k-result fixture): `searchCache.read(query, page: 200)` → assert `results.length === 25`, `chunksRead < 100`.
- Heap: use `process.memoryUsage().heapUsed` before and after; assert peak < 256 MB.

## 7. UI source-filters/search-bar/pagination (FR-001..FR-006)

**Requirements**: FR-001 (app shell top bar), FR-002 (primary search controls), FR-003 (source filter controls), FR-004 (results list cards), FR-005 (empty and error states), FR-006 (pagination or progressive loading)

**Test files** (Playwright E2E, planned in STORY-019):

- `tests/e2e/app-shell.e2e.ts` — FR-001: top bar is visible, sticky, renders product title.
- `tests/e2e/search-controls.e2e.ts` — FR-002: search bar is full-width on 320px viewport, max-width on desktop, has a primary submit, shows a loading state.
- `tests/e2e/source-filter.e2e.ts` — FR-003: secondary bar exposes LIVE/HISTORY/BOOKMARK with icon + label, selecting one filters the results area.
- `tests/e2e/results-list.e2e.ts` — FR-004: results render as scrollable card-style rows with title, snippet, domain, clickable link.
- `tests/e2e/empty-and-error-states.e2e.ts` — FR-005: zero-results query renders empty state; fault-injected tool error renders error state.
- `tests/e2e/pagination.e2e.ts` — FR-006: page controls or "load more" affordance is present; skeleton/spinner visible during fetch and disappears on resolve.

**What it asserts** (STORY-019 owns the Playwright harness; these are the planned assertions):

- **FR-001**: `page.locator('[data-testid="app-shell-top-bar"]').isVisible()` → true across pages and viewports.
- **FR-002**: `page.locator('[data-testid="search-bar"]')` has `width: 100%` at 320px, `max-width: <token>` at 1280px. Loading state: `page.locator('[data-testid="search-loading"]').isVisible()` → true while agent runs, false after.
- **FR-003**: `page.locator('[data-testid="source-filter-LIVE"]').click()` → results area updates, URL param `?source=LIVE`.
- **FR-004**: `page.locator('[data-testid="result-card"]').count()` > 0; each card has visible title, snippet, domain, clickable link.
- **FR-005**: Submit a zero-results query → `page.locator('[data-testid="empty-state"]').isVisible()` → true. Inject a tool error → `page.locator('[data-testid="error-state"]').isVisible()` → true.
- **FR-006**: `page.locator('[data-testid="pagination-next"]')` or `page.locator('[data-testid="load-more"]')` is present. Loading affordance: `page.locator('[data-testid="skeleton"]').isVisible()` → true during fetch, false after.

## Runnable prototype gate (FR-025 a)

**Requirement**: FR-025 (a) — end-to-end functional prototype, runnable from a clean checkout.

**Command**: `pnpm e2e:smoke` (STORY-019's smoke job, to be wired)

**What it asserts**: The full stack (UI + API + agent + tools + data layer) starts from a clean checkout, boots, and satisfies a representative end-to-end scenario (e.g. submit a live search, render answer + references + results, click a history entry, render the same answer).

**Assertion summary**:

- Clone the repo, `pnpm install`, `pnpm build`, set `TAVILY_API_KEY` and `ANTHROPIC_API_KEY`, run `pnpm e2e:smoke`.
- Smoke test boots the API (`services/api`) and UI (`apps/ui`) in dev mode, submits a LIVE search via Playwright, asserts the answer summary is non-empty, asserts the references list is non-empty, asserts the results list is non-empty.
- Smoke test clicks the history tab, asserts the history entry appears, clicks the entry, asserts the same results render.

This is the structural guard for "runnable from a clean checkout" — without the smoke job passing, the deliverable is broken.

## Requirements covered

- **FR-001..FR-006** — UI smoke tests (Playwright).
- **FR-007** — Synthesis output test (`synthesis.test.ts`).
- **FR-008** — Citation validator test (`validator.test.ts`).
- **FR-009** — Reference entry test (`synthesis.test.ts`).
- **FR-012** — Web search integration test (`web-search.spec.ts`).
- **FR-014** — History store integration test (`history-store.spec.ts`).
- **FR-015** — Bookmark store integration test (`bookmark-store.spec.ts`).
- **FR-018** — Chunked retrieval test (`chunker.test.ts`).
- **NFR-001** — Responsive min-width (Playwright `responsive.e2e.ts` planned in STORY-019).
- **NFR-002** — Visual polish (Playwright `visual-system.e2e.ts` planned in STORY-019).
- **NFR-003** — Large dataset test (`large-set.spec.ts`).
- **NFR-004** — No full-scan test (`chunker.test.ts`, `large-set.spec.ts`).
- **FR-025** — Runnable prototype gate (`pnpm e2e:smoke`, STORY-019).

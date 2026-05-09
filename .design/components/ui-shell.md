---
title: UI shell
read_when: implementing or modifying UI behavior, layout, or visual treatment
boundary: periphery
requirements: [FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, NFR-001, NFR-002]
---

# UI shell

The browser-facing app: app shell, search controls, source-filter bar, results list, empty/error states, and pagination affordance. Lives in `apps/ui` (Vite + React + Tailwind + Radix per `technology/tech-stack.md`).

## Responsibilities

- Render the app shell with a sticky top bar that anchors the product title and at least one global action across pages and viewports (FR-001).
- Render the primary search controls — a prominent search bar (full-width on mobile, max-width on desktop), a primary submit, and a visible loading state while the agent runs (FR-002).
- Render the secondary source-filter bar with the closed enum `LIVE` / `HISTORY` / `BOOKMARK`, each as a button or tab with icon and text label (FR-003). Selecting an option MUST switch the results area's source filter via the API contract.
- Render search results as scrollable card-style rows with title, snippet, domain, and clickable source link (FR-004).
- Render purposeful empty and error states distinct from the populated list (FR-005). Empty state for zero-result queries, error state for FR-023 terminal errors. Both MUST follow the same visual system as the populated list.
- Provide either pagination controls or progressive loading with a visible skeleton/spinner during fetch (FR-006). The implementation MUST pick exactly one and document it; the design fixes **progressive loading with a "load more" button** as the chosen mechanism (lower interaction cost on mobile, plays well with chunked retrieval).
- Stay readable and operable from a 320px viewport upward (NFR-001).
- Apply a coherent visual system: documented Tailwind palette tokens, a typography scale, a spacing rhythm, rounded/elevated cards, and visible hover/focus states (NFR-002).

## What this component MUST NOT do

- It MUST NOT import agent code or data-layer code directly. The only legal seam is `@neo-search/contracts` and the API HTTP surface (I-16, FR-024).
- It MUST NOT issue tool calls or hit external services. All data flows through the API.
- It MUST NOT define its own copy of the answer/citations shape. The shape is `UiApiAnswerContract` from `@neo-search/contracts` (I-34).
- It MUST NOT use ad-hoc inline colors outside the Tailwind palette tokens (NFR-002 acceptance criterion).

## Public contract

The UI component is a frontend bundle, not a callable service. Its "public contract" is the set of API endpoints it consumes, all defined in `@neo-search/contracts/ui-api.ts` (FR-010, FR-021). See `components/search-api.md` for the wire shape.

| Endpoint | Method | Request contract | Response contract |
| --- | --- | --- | --- |
| `/api/search` | POST | `SearchRequestContract` (query, sourceFilter, page) | `UiApiAnswerContract` (answer_summary, references, results, pagination) |
| `/api/bookmarks` | POST | `BookmarkSaveRequestContract` (resultId or answerId) | `BookmarkSaveResponseContract` (id) |
| `/api/bookmarks` | GET | (none) | `BookmarkListResponseContract` (entries[]) |
| `/api/history` | GET | (none, paginated via query) | `HistoryListResponseContract` (entries[], pagination) |

All four endpoints MUST return either `{ ok: true, value }` or `{ ok: false, error }` per `foundation/conventions.md`. Network errors MUST be caught and surfaced as the FR-005 error state.

## Variation accommodated

- **Source filter** is a closed enum of three values — closed by design (principle 5: variants as data). Adding a fourth source type is an ADR moment, not a UI fork.
- **Pagination mechanism** is a single picked variant (load-more). The component MUST NOT branch on a runtime "pagination mode" flag.

## Layering

`ui-shell` sits above the API contract. It MUST NOT call agent or data-layer code directly. It MAY depend on `@neo-search/contracts` (types only) and `@neo-search/ui-tokens` (the Tailwind preset that encodes NFR-002).

## Idempotency and versioning

- Read endpoints (`/api/history`, `/api/bookmarks` GET, `/api/search` for HISTORY/BOOKMARK reads) MUST be idempotent and safely retried by the UI client.
- Write endpoints (`/api/search` for LIVE — writes to history + cache as a side effect; `/api/bookmarks` POST) MUST be idempotent on retry within a 5s window — the contract carries an optional `client_request_id` (UUID) that the API uses to deduplicate. (See `components/search-api.md`.)
- Contract version is encoded in the `@neo-search/contracts` package version. A breaking change to any of these endpoints MUST land via a superseding ADR (I-33).

## Accessibility floor

NFR-002's hover/focus state requirement implies keyboard reachability. Every interactive element MUST be reachable via Tab; visible focus rings MUST be present. Radix primitives provide the substrate. ARIA attributes for the source-filter tab pattern MUST follow Radix's `Tabs` defaults.

## Open follow-ups

- The exact Tailwind palette tokens (the NFR-002 checklist's "documented color palette") are not pinned in this design pass — they are a UI-side ADR-worthy choice and are deferred to the developer agent's first UI pass.

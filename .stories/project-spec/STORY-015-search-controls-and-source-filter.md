---
id: STORY-015
title: Render search controls and the source filter bar
initiative: .initiatives/project_spec.md
requirements: [FR-002, FR-003]
design_refs:
  - .design/components/ui-shell.md
  - .design/domain/glossary.md
status: ready
points: 3
depends_on: [STORY-002, STORY-014]
external_depends_on: []
wave: 3
---

## Goal / user value
Drop the primary search controls (FR-002: prominent search bar, primary submit, loading state) and the secondary source-filter bar (FR-003: LIVE / HISTORY / BOOKMARK with icon + text label) into the app shell from STORY-014. These two surfaces are the user's only entry points; without them the rest of the UI has nothing to render against. No real API call yet — the submit handler accepts an injected callback so STORY-016 can wire it to the real API once results rendering exists.

## Context
Per `ui-shell.md` the search bar is full-width on mobile, max-width on desktop, and shows a loading state from submission until response. The source-filter bar uses Radix `Tabs` (per `tech-stack.md`) with the closed enum `LIVE | HISTORY | BOOKMARK` from `domain/glossary.md`. The closed enum is enforced at the contract layer (STORY-002) — adding a fourth source type is an ADR moment, not a UI fork. The components consume `@neo-search/contracts` for the `SourceFilterEnum` and `SearchRequestContract` types.

## Scope
- New `apps/ui/src/components/SearchBar.tsx` — a controlled input + a primary submit button, full-width on `xs` (320px+), max-width via Tailwind `max-w-2xl` on `md+`. Visible loading affordance (spinner inside the button + button disabled) bound to a `isLoading: boolean` prop. The component MUST be the visually most prominent input on the screen (largest typography scale step, prominent color from the palette).
- New `apps/ui/src/components/SourceFilterBar.tsx` — a Radix `Tabs.Root` with three `Tabs.Trigger`s for LIVE, HISTORY, BOOKMARK. Each trigger shows an icon (Lucide React or equivalent — pin via `tech-stack.md` follow-up) and a text label. Selecting a trigger calls an `onChange(filter: SourceFilter)` prop.
- New `apps/ui/src/components/SearchPanel.tsx` — composes `SearchBar` + `SourceFilterBar` and slots into `AppShell`. Owns the source-filter state (default `LIVE`) and the `query` state via `useState`. On submit, calls an injected `onSearch(req: SearchRequestContract)` prop — STORY-016 wires this to the API call.
- Keyboard accessibility: the search bar's submit MUST trigger on Enter; tabs MUST be navigable via arrow keys (Radix default).
- The `SourceFilterEnum` MUST be imported from `@neo-search/contracts` — no local copy of the three string literals (I-34).
- ARIA: tabs use Radix's `Tabs` ARIA defaults; the search input has a visible label or `aria-label`.

## Out of scope / non-goals
- No actual API call (STORY-016 wires it).
- No results rendering (STORY-016).
- No bookmark save action (STORY-017).
- No empty/error state UI (STORY-016).

## Acceptance criteria
- `SearchBar` MUST render a text input and a primary submit button (FR-002 acceptance criteria a, b).
- The search bar MUST be full-width at 320px viewport (no horizontal scroll); MUST be constrained to `max-w-2xl` (or equivalent design-token limit) at `md` breakpoint and above (FR-002 a).
- Pressing Enter inside the input OR clicking the submit button MUST call `onSearch` exactly once with `{ query, sourceFilter, page: 1 }` (FR-002 b).
- When `isLoading` is true, the submit button MUST be disabled and MUST display a spinner; clicking it MUST NOT trigger `onSearch` (FR-002 c).
- The search bar MUST be the visually most prominent input on the screen (asserted by a snapshot or DOM size assertion in STORY-019; here, by token usage).
- `SourceFilterBar` MUST render exactly three triggers labeled LIVE, HISTORY, BOOKMARK (FR-003 b) — neither more nor fewer.
- Each trigger MUST show both an icon and a text label (FR-003 c).
- Selecting a trigger MUST call `onChange(filter)` and MUST visually mark the selected one (Radix's `data-state="active"` is sufficient).
- `SearchPanel` MUST default to `sourceFilter = "LIVE"` on mount.
- Tabs MUST be navigable via arrow keys (Radix default; asserted in STORY-019's keyboard-reachability test).
- The components MUST NOT define their own `SourceFilter` type — `SourceFilterEnum` from `@neo-search/contracts` only.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.

## Test plan
- Unit (`apps/ui/src/components/SearchBar.test.tsx`): renders input + submit; Enter triggers `onSearch`; click triggers `onSearch`; `isLoading` disables submit and renders spinner.
- Unit (`apps/ui/src/components/SourceFilterBar.test.tsx`): renders exactly three triggers with icon + label; selecting a trigger calls `onChange` with the right enum value; default selected is LIVE.
- Unit (`apps/ui/src/components/SearchPanel.test.tsx`): default source filter is LIVE; submit forwards the right `SearchRequestContract` shape (query, sourceFilter, page=1).
- Integration: not applicable here.
- E2E: deferred to STORY-019 (`tests/e2e/search-controls.e2e.ts` and `tests/e2e/source-filter.e2e.ts` per `technology/testing.md`).
- Adversarial / NFR coverage:
  - **NFR-001**: 320px viewport renders search bar full-width without horizontal scroll — unit-level via JSDOM viewport mock; STORY-019 owns the real-browser assertion.
  - **NFR-002**: components use only token-derived classes (no inline hex); the lint rule from STORY-014 catches violations.
  - **FR-003 / NFR-006 underpin**: the closed-enum source filter from `@neo-search/contracts` makes "adding a fourth source type" require a contract change, not a UI fork.

## Affected design surface
- `.design/components/ui-shell.md` — implements the search controls and source-filter bar per the documented variants.
- `.design/domain/glossary.md` — closed-enum source filter is honored verbatim.

## Dependencies
- **Depends on**: STORY-002 (`SourceFilterEnum`, `SearchRequestContract`), STORY-014 (the shell has slots; the Tailwind tokens are in place).
- **Enables**: STORY-016 (results list consumes the source-filter and query state via API calls).

## Risks & assumptions
- Risk: an icon library isn't pinned in `tech-stack.md`. Mitigation: the developer pass MAY add `lucide-react` via a single-purpose `chore(deps):` commit per `naming-conventions.md`, with the version pinned.
- Assumption: a single visible search bar (not a modal-driven search) is the right shape; no FR/AC argues otherwise.

## Source excerpts
> The search bar MUST be full-width on mobile viewports and MUST be constrained to a maximum width on desktop viewports. A primary submit control MUST be present and MUST trigger the search. A visible loading state MUST appear from submission until the agent's response (or error) is received.

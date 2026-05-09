---
id: STORY-014
title: Stand up the UI shell with top bar and visual tokens
initiative: .initiatives/project_spec.md
requirements: [FR-001, NFR-001, NFR-002]
design_refs:
  - .design/components/ui-shell.md
  - .design/foundation/architecture.md
  - .design/technology/tech-stack.md
status: ready
points: 5
depends_on: [STORY-001]
external_depends_on: []
wave: 2
---

## Goal / user value
Lay down the UI app shell every other UI story renders inside: Vite + React + Tailwind + Radix wired into `apps/ui`, the sticky top bar with product title and one global action (FR-001), the documented Tailwind palette tokens / typography scale / spacing rhythm (NFR-002 visual system), and responsive layout from 320px upward (NFR-001). No business endpoints called yet — this story is pure shell so STORY-015..STORY-017 have a coherent surface to drop into.

## Context
Per `ui-shell.md` the UI lives in `apps/ui` (Vite 5.4.10 + React 18.3.1 + Tailwind 3.4.14 + Radix). The visual system is documented per NFR-002 (palette / typography / spacing / cards / hover-focus). The Tailwind palette tokens live in a shared preset under `packages/ui-tokens/` so the values are versioned with the rest of the contract surface. Per `ui-shell.md` "Open follow-ups" the exact palette values are an ADR-worthy choice deferred to the developer's first UI pass — this story IS that first UI pass and pins the tokens. Radix primitives (`@radix-ui/react-tabs@1.1.1`, `@radix-ui/react-dialog@1.1.2`) provide the accessible substrate STORY-015 (filter tabs) and STORY-017 (any modal) consume.

## Scope
- New module `apps/ui/src/main.tsx` — React root, mounts the app shell.
- `apps/ui/src/components/AppShell.tsx` — top bar (sticky/fixed), product title, one global action (e.g. "New search" button or theme toggle placeholder per FR-001 acceptance — the spec says "for example a refresh affordance and a settings placeholder"; pick refresh).
- `apps/ui/src/components/AppShell.tsx` MUST host outlet/slot for STORY-015's search controls and STORY-016's results area — agreed slot structure documented in the file's TSDoc.
- New package `@neo-search/ui-tokens` at `packages/ui-tokens/` exporting a Tailwind preset with: a documented color palette (e.g. `primary`, `surface`, `text-default`, `text-muted`, `border`, `error`, `success`), a typography scale (e.g. `display`, `heading`, `body`, `caption`), a spacing scale (4 / 8 / 16 / 24 / 32 px), card styles (rounded corners + elevation), and hover/focus state utilities.
- `apps/ui/tailwind.config.ts` MUST extend `@neo-search/ui-tokens`'s preset.
- `apps/ui/postcss.config.js` and Vite + Tailwind wiring.
- Responsive breakpoints in the Tailwind config: `xs: 320px`, `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`. Layout MUST be tested at 320px (NFR-001).
- A README at `packages/ui-tokens/README.md` documents the palette, scale, spacing, card styles, and hover/focus rules — the NFR-002 "documented" checklist.
- The shell MUST NOT import any agent or data-layer code — only `@neo-search/contracts` (types) and `@neo-search/ui-tokens` (Tailwind preset). Lint-enforced in STORY-018.
- Vite dev server runs at `localhost:5173` (default) and proxies `/api/*` to the API at `localhost:3001` (dev convenience).

## Out of scope / non-goals
- No search controls (STORY-015), no results list (STORY-016), no answer renderer (STORY-017).
- No state management library beyond React's built-in `useState`/`useReducer` and React Query (per `tech-stack.md` Stack-level prohibitions).
- No production build pipeline beyond `vite build`; STORY-019 covers e2e packaging.
- No internationalization (out of scope for the prototype).

## Acceptance criteria
- `pnpm --filter @neo-search/ui dev` MUST start the Vite dev server and serve a page at `localhost:5173`.
- The page MUST render an `AppShell` containing a sticky top bar with the product title and at least one global action button (FR-001 acceptance criteria a, b, c).
- The top bar MUST have a consistent height across viewport widths from 320px to 1920px (FR-001 acceptance criterion d) — asserted by Playwright in STORY-019.
- At 320px viewport width, no horizontal scrollbar appears on the shell (NFR-001 acceptance criterion).
- A documented Tailwind preset in `packages/ui-tokens/` MUST exist and `apps/ui` MUST consume it via the `tailwind.config.ts` `presets` array (NFR-002 acceptance "documented color palette").
- An ESLint rule MUST forbid hex literals in `apps/ui/src/**/*.{ts,tsx}` outside the token definitions (NFR-002 "ad-hoc inline colors outside the palette MUST NOT appear"). Implementation: `no-restricted-syntax` against hex-literal regex, OR a Tailwind-specific lint plugin. STORY-018 wires this lint into CI.
- Every interactive element MUST have a visible focus ring (Tailwind `focus-visible:ring-*`) — asserted in STORY-019's NFR-002 visual diff suite.
- Radix `Tabs` and `Dialog` packages MUST be installed and importable from `apps/ui` (the substrate for STORY-015/STORY-017).
- `tsc --noEmit`, `eslint`, `vitest` MUST pass on `apps/ui` and `packages/ui-tokens`.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The Tailwind preset README + the `AppShell` component each include a screenshot or ASCII diagram showing the slot structure for downstream UI stories.

## Test plan
- Unit (`apps/ui/src/components/AppShell.test.tsx`): React Testing Library — renders product title, renders a global action button, renders the children slot, sticky top bar applies the right Tailwind class.
- Unit (`packages/ui-tokens/src/preset.test.ts`): asserts the token export shape (palette names, scale entries) — a regression catches an accidental rename.
- Integration: not applicable here (UI integration is the rendered DOM; STORY-019 owns Playwright).
- E2E: deferred to STORY-019 (FR-001 / NFR-001 / NFR-002 Playwright suites).
- Adversarial / NFR coverage:
  - **NFR-001**: the 320px-width breakpoint test runs in Vitest's `@testing-library/react` with a JSDOM viewport mock for unit-level assertion; STORY-019 owns the real-browser matrix at 320/375/768/1280/1920.
  - **NFR-002**: the "no inline hex" lint rule is the structural guard — a regression that hardcodes a color outside the palette fails CI.

## Affected design surface
- `.design/components/ui-shell.md` — implements the shell, top bar, and visual-system substrate verbatim. Closes the "Open follow-ups" item by pinning the palette tokens.
- `.design/foundation/architecture.md` — confirms UI's only legal seam is the API contract.
- `.design/technology/tech-stack.md` — Vite, Tailwind, Radix versions consumed here.

## Dependencies
- **Depends on**: STORY-001 (workspace + `apps/ui` directory).
- **Enables**: STORY-015 (drops controls into the shell's slot), STORY-016 (drops results into the shell's slot), STORY-018 (consumes the no-inline-hex lint rule).

## Risks & assumptions
- Risk: choosing a palette without designer input may produce a less polished result. Mitigation accepted at prototype scope (OQ-002 / OQ-003 are best-effort); the structural NFR-002 guards (palette tokens, focus rings, spacing scale) are what the rubric checks, not subjective taste.
- Assumption: a single-page React app is sufficient; no router needed yet (STORY-015..017 all live within the same view).

## Source excerpts
> The system MUST present a fixed or sticky top bar that anchors product context and global actions across every page of the UI.

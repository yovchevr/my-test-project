---
id: NFR-001
title: Stay readable from 320px viewport upward
source: .initiatives/project_spec.md
status: approved
category: usability
metric: minimum supported viewport width
target: ≥ 320px
---

## Statement
The UI MUST remain readable and operable on viewport widths of 320 pixels or greater.

## Acceptance criteria
- At 320px viewport width, all primary controls (search bar FR-002, source filters FR-003, results list FR-004, pagination FR-006) MUST be reachable and operable without horizontal scrolling.
- At 320px viewport width, text in result cards MUST remain legible (no overlapping, no clipping of titles or links).
- The UI MUST scale upward — wider viewports MUST NOT regress functionality available at 320px.
- Layout breakpoints MUST be tested at 320px as the lower bound; widths below 320px are out of scope.

## Rationale
Mobile coverage is non-negotiable for a search UI; the initiative pins the lower bound at "~320px" as the smallest viewport the layout must accommodate.

## Source excerpts
> - **Visual polish ("slick")**: Coherent **color system**, **typography scale**, spacing rhythm, rounded corners or elevation on cards, hover/focus states on interactive elements, and responsive layout (readable from ~320px width upward). The UI should feel intentional and demo-ready, not a raw HTML list.

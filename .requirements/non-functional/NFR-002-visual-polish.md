---
id: NFR-002
title: Apply coherent visual system across the UI
source: .initiatives/project_spec.md
status: approved
category: usability
metric: visual-system coverage (categorical checklist)
target: every checklist item present and consistent
---

## Statement
The UI MUST apply a coherent visual system covering color, typography, spacing, card treatment, and interaction states so the product reads as intentional rather than as raw HTML.

## Acceptance criteria
- A documented color palette MUST be applied consistently — ad-hoc inline colors outside the palette MUST NOT appear.
- A typography scale (sizes / weights for headings, body, captions) MUST be applied consistently across screens.
- Spacing rhythm MUST follow a consistent scale (e.g. 4 / 8 / 16 / 24 px or similar) across components.
- Cards (FR-004) MUST use rounded corners and / or elevation, applied consistently.
- Interactive elements MUST have visible hover and focus states that satisfy keyboard-navigation reachability.
- A reviewer MUST be able to inspect the UI and confirm each checklist item is in place; any missing item MUST fail this NFR.

## Rationale
The initiative explicitly requires a "slick", "demo-ready" feel and lists the elements of the visual system. Treating these as an NFR (rather than a vague aesthetic goal) gives reviewers a categorical checklist to evaluate against.

## Source excerpts
> - **Visual polish ("slick")**: Coherent **color system**, **typography scale**, spacing rhythm, rounded corners or elevation on cards, hover/focus states on interactive elements, and responsive layout (readable from ~320px width upward). The UI should feel intentional and demo-ready, not a raw HTML list.

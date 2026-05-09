---
id: FR-004
title: Render results as scrollable card-style list
source: .initiatives/project_spec.md
status: approved
area: ui
---

## Statement
The system MUST render search results as a scrollable list of card-style rows, each carrying a title, a summary snippet, the originating domain or site name, and an explicit clickable link to the source.

## Acceptance criteria
- The results area MUST be vertically scrollable when content exceeds the viewport.
- Each result MUST be rendered as a card-style row.
- Each card MUST display a title, a summary snippet, the domain or site name of the source, and an explicit link to the source URL.
- The link on each card MUST be clickable and MUST navigate to (or open) the source URL.

## Rationale
A consistent card layout per result lets users scan many hits quickly, and the explicit per-card link is what makes citations verifiable rather than opaque. The initiative spells out each of the four required fields.

## Source excerpts
> - **Results area**: Scrollable **results list** with card-style rows (title, summary snippet, domain or site name, **explicit link** to source). Empty and error states are designed (not a blank screen).

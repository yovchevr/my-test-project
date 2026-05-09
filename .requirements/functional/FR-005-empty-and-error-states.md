---
id: FR-005
title: Provide designed empty and error states
source: .initiatives/project_spec.md
status: approved
area: ui
---

## Statement
The system MUST render purposeful empty and error states in the results area instead of a blank screen.

## Acceptance criteria
- When a search returns zero results, the UI MUST render an empty state with explanatory copy and (where applicable) a suggested next action.
- When a search fails (network error, agent error, tool error), the UI MUST render an error state with explanatory copy distinct from the empty state.
- Neither the empty nor the error state MUST leave the results area visually blank.
- The empty and error states MUST follow the same visual system as the populated results list (FR-004).

## Rationale
The initiative explicitly singles out empty and error states as design surfaces, not afterthoughts. Blank screens are a common failure mode that hides what the system is actually doing.

## Source excerpts
> - **Results area**: Scrollable **results list** with card-style rows (title, summary snippet, domain or site name, **explicit link** to source). Empty and error states are designed (not a blank screen).

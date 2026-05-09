---
id: FR-002
title: Expose primary search controls with submit and loading
source: .initiatives/project_spec.md
status: approved
area: ui
---

## Statement
The system MUST provide a prominent search bar with an explicit submit control and a visible loading indicator while the agent runs.

## Acceptance criteria
- The search bar MUST be full-width on mobile viewports and MUST be constrained to a maximum width on desktop viewports.
- A primary submit control (button or equivalent) MUST be present and MUST trigger the search.
- A visible loading state MUST appear from submission until the agent's response (or error) is received.
- The search bar MUST be the visually most prominent input on the search screen.

## Rationale
Search is the product's primary action, so the entry point must be unambiguous, accessible across viewports, and give the user feedback while the agent is working. The initiative makes this an explicit acceptance item.

## Source excerpts
> - **Primary search controls**: Prominent **search bar** (full-width on mobile, constrained max-width on desktop), primary **Search** button or equivalent submit control, and visible loading state while the agent runs.

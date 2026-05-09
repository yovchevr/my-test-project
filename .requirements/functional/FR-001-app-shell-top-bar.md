---
id: FR-001
title: Provide app shell with persistent top bar
source: .initiatives/project_spec.md
status: approved
area: ui
---

## Statement
The system MUST present a fixed or sticky top bar that anchors product context and global actions across every page of the UI.

## Acceptance criteria
- The top bar MUST be visible on every page of the UI and MUST remain in view (fixed or sticky) when the page is scrolled.
- The top bar MUST display the product title or equivalent context label.
- The top bar MUST expose at least one global action control (for example a refresh affordance and a settings placeholder).
- The top bar MUST render with a consistent height and spacing across pages and viewports.

## Rationale
The initiative calls out an "App shell" as the first UI-layer requirement, framing the top bar as the consistent home for product identity and global actions. This anchors the rest of the UI and is checked first in the acceptance list.

## Source excerpts
> ### UI Layer
> - **App shell**: Fixed or sticky **top bar** with product title / context, global actions (e.g. refresh, settings placeholder), and consistent height and spacing.

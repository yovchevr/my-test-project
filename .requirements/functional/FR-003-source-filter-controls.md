---
id: FR-003
title: Provide source filter controls for LIVE HISTORY BOOKMARK
source: .initiatives/project_spec.md
status: approved
area: ui
---

## Statement
The system MUST provide a secondary control bar that lets the user switch or filter results by source type across LIVE, HISTORY, and BOOKMARK.

## Acceptance criteria
- The UI MUST render a secondary bar or segmented control distinct from the primary search controls (FR-002).
- The control MUST expose exactly the three options `LIVE`, `HISTORY`, and `BOOKMARK`.
- Each option MUST be rendered as a button or tab and MUST display both an icon and a text label.
- Selecting an option MUST switch or filter the results area (FR-004) to that source type.

## Rationale
The initiative names three distinct result sources and requires the user to be able to switch between them. Dedicating a secondary bar (rather than burying the choice in a menu) makes the active source visible at a glance.

## Source excerpts
> - **Source filters / tabs**: A **secondary bar** or segmented control with clear controls to switch or filter by source type; each option is a **button** or tab with icon + label:
>   - `LIVE`
>   - `HISTORY`
>   - `BOOKMARK`

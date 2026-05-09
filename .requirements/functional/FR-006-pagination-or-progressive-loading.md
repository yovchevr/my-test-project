---
id: FR-006
title: Provide pagination or progressive loading with fetch indicators
source: .initiatives/project_spec.md
status: approved
area: ui
---

## Statement
The system MUST offer either pagination controls or progressive (infinite) loading for the results list, and MUST show a skeleton or spinner while a page or batch is being fetched.

## Acceptance criteria
- The results area MUST expose either page navigation controls or a "load more" / infinite-scroll affordance — at least one of the two MUST be present.
- A skeleton or spinner MUST be visible during a page or batch fetch and MUST disappear when the fetch resolves (success or error).
- The chosen mechanism MUST work for result sets large enough to require pagination (see NFR-003).
- **No numeric latency target is set** for how quickly a fetch completes (best effort, per OQ-003). The loading affordances above remain mandatory regardless of how long the fetch takes.

## Rationale
The initiative requires the system to handle large result sets, which means the UI cannot render everything at once. The user needs both a way to ask for more and a clear signal that a fetch is in flight.

## Source excerpts
> - **Pagination / loading**: Pagination controls **or** progressive / infinite loading; show page or "load more" affordances and **skeleton or spinner** during fetch.

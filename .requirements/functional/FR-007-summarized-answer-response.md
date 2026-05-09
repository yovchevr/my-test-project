---
id: FR-007
title: Return a summarized answer per search not a link dump
source: .initiatives/project_spec.md
status: approved
area: answers
---

## Statement
For each search, the system MUST present a short, readable summary (paragraph or bullet form) that directly addresses the user's query, in addition to the underlying results.

## Acceptance criteria
- Every successful search response MUST include a non-empty `answer_summary` (or equivalent) field — see FR-010.
- The summary MUST be presented in paragraph or bullet form, not as a raw list of URLs.
- The summary MUST address the user's query — a generic boilerplate string MUST NOT be acceptable.
- Raw search results MUST remain available to the UI alongside the summary (for FR-004 and FR-006), not replaced by it.

## Rationale
The initiative is explicit that the product is an "answer", not a link dump. A summary is the primary user-facing response; results stay accessible for detail and pagination.

## Source excerpts
> ### Search answers (not "link dumps")
> - **Summarized response**: For each search, the system presents a **short, readable summary** (paragraph or bullet answer) that directly addresses the user's query—**not** only a flat list of URLs.

> - **Produce answer-quality output**: The agent (or a dedicated synthesis step) turns raw hits into a **concise summary** with **explicit web references** (see "Search answers" under UI / product expectations above). Raw search results remain available for pagination and detail, but the primary user-facing response is **summarized and cited**, not an unordered link list.

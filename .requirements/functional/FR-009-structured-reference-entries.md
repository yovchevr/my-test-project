---
id: FR-009
title: Provide structured reference entries for cited sources
source: .initiatives/project_spec.md
status: approved
area: answers
---

## Statement
Each cited source returned with a search response MUST be a structured entry containing at minimum a title, a URL, and a one-line context describing why it was used or what it supports.

## Acceptance criteria
- Every reference entry MUST include a `title` field, a `url` field, and a one-line `context` field — all three MUST be non-empty.
- The `url` field MUST be a stable, clickable reference; opaque or duplicated URLs lacking context MUST NOT be accepted.
- Duplicate URLs MUST NOT appear as separate reference entries; if the same source supports multiple claims, the citation marker (FR-008) MUST point to the single entry.
- The reference list MUST be returned as part of the API contract (see FR-010).

## Rationale
The initiative makes the reference shape explicit (title + URL + context) and warns against opaque or duplicated link dumps. A structured shape is what makes the references usable both in the UI and downstream.

## Source excerpts
> - **Structured references**: Each cited source entry includes at minimum: **title**, **URL**, and **one-line context** (why it was used or what it supports). Links are **stable, clickable references**, not opaque or duplicated "random" URLs without context.

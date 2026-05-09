---
id: FR-008
title: Ground every summary claim in a cited source
source: .initiatives/project_spec.md
status: approved
area: answers
---

## Statement
The system MUST tie every material claim or bullet in the summary to one or more underlying web results via an explicit citation marker.

## Acceptance criteria
- Each material claim or bullet in the summary (FR-007) MUST carry at least one citation reference (inline marker, footnote, or "Sources" block entry) pointing to a result in FR-009.
- The citation reference MUST resolve unambiguously to a specific entry in the references list — generic "see sources" text MUST NOT count.
- A summary MUST NOT contain a material claim that cannot be traced to a source in the underlying results.
- The mechanism (inline markers vs. footnotes vs. block) MAY be chosen by the implementation but MUST be applied consistently across responses.

## Rationale
The initiative draws a sharp line between an "answer" and a "link dump"; what makes the answer trustworthy is the per-claim citation. Without grounding, the summary is unverifiable.

## Source excerpts
> - **Grounded citations**: Summary points are **tied to sources**: each material claim or bullet should reference **which web result** supports it (e.g. inline citation markers, footnotes, or a "Sources" block).

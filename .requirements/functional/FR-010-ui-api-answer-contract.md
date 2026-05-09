---
id: FR-010
title: Define UI to API contract for summary and citations
source: .initiatives/project_spec.md
status: approved
area: contracts
---

## Statement
The UI ↔ API response contract MUST include explicit fields for the answer summary and the citations / references list so the answer-quality requirements (FR-007 through FR-009) can be implemented consistently.

## Acceptance criteria
- The API response schema for a search MUST include a field named `answer_summary` (or a documented equivalent) holding the value defined by FR-007.
- The API response schema MUST include a field named `citations` or `references` (or a documented equivalent) holding the structured entries defined by FR-009.
- The schema MUST be defined once and reused across UI, agent, and any synthesis component — see FR-021.
- An example payload MUST be published as part of the architecture deliverables (per the initiative's "Contracts: Defined schemas / Example payloads").

## Rationale
Naming the fields in the contract is what stops the summary and citations from drifting between layers. The initiative makes this an explicit requirement under "Contracts" inside the answers section.

## Source excerpts
> - **Contracts**: The UI ↔ API contract includes fields for **answer_summary** (or equivalent) and **citations** / **references** so the generator can implement this consistently.

> 6. Contracts
> - Defined schemas
> - Example payloads

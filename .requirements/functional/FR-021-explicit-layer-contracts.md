---
id: FR-021
title: Define explicit contracts at all four layer boundaries
source: .initiatives/project_spec.md
status: approved
area: contracts
---

## Statement
The system MUST define explicit, structured, reusable input/output contracts at every layer boundary: UI ↔ Backend/API, Backend/API ↔ Agent, Agent ↔ Tools, and Agent ↔ Data layer.

## Acceptance criteria
- A contract definition MUST exist for each of the four boundaries listed above — none of them MUST rely on undocumented payload shapes.
- Each contract MUST be structured (schema-defined, e.g. via TypeScript types, JSON Schema, Pydantic models, or equivalent), not free-form prose.
- Each contract MUST be reusable — a single definition MUST be referenced by both sides of the boundary, not duplicated.
- Each contract MUST be clearly defined — every field MUST have a name, a type, and (where the meaning is not obvious) a description.
- The UI ↔ API contract MUST include the answer-summary and citations fields from FR-010.

## Rationale
The initiative makes contract binding MANDATORY at all four named boundaries and disqualifies systems that lack contracts. This is the spine that lets every other layer be implemented and tested independently.

## Source excerpts
> ### Contract Binding (MANDATORY)
> System must use explicit contracts:
> - Input/output contracts between:
>   - UI ↔ Backend/API
>   - Backend/API ↔ Agent layer
>   - Agent layer ↔ Tools
>   - Agent layer ↔ Data layer
> Contracts must be:
> - Structured
> - Reusable
> - Clearly defined

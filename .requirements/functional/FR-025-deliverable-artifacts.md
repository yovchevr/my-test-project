---
id: FR-025
title: Produce the required deliverable artifacts
source: .initiatives/project_spec.md
status: approved
area: deliverables
---

## Statement
The system MUST be accompanied by the deliverable artifacts named in the initiative — a working end-to-end prototype, an architecture document, a problem-decomposition write-up, an agent-design write-up, a data-strategy write-up, a contracts write-up with example payloads, a design-patterns write-up framed in Neo workflow design patterns, and a test-cases document.

## Acceptance criteria
- An end-to-end functional prototype MUST be runnable from a clean checkout — the initiative explicitly disqualifies broken or non-functional pull requests.
- An architecture document MUST exist and MUST contain a system diagram, the data flow, agent interactions, and tool interactions (cross-references FR-024).
- A "problem decomposition" write-up MUST explicitly document how the problem was broken down, why the chosen architecture was chosen, and the tradeoffs considered.
- An "agent design" write-up MUST document agent responsibilities, how decisions are made, and how orchestration works.
- A "data strategy" write-up MUST cover chunking approach, indexing approach, and storage format (cross-references FR-019, FR-020).
- A "contracts" write-up MUST publish defined schemas and example payloads (cross-references FR-010, FR-021).
- A "design patterns used" write-up MUST be expressed in **Neo workflow design patterns** (e.g. contract binding, agent orchestration, data partitioning, tool abstraction) and MUST NOT substitute generic application architecture patterns.
- A test-cases document MUST list the specific cases the initiative names: live web results, summary + cited references in the response, history persists + retrieves, bookmarks persist + retrieve, chunked data retrieval works, large dataset handling without failure, and UI behavior for source filters / tabs, search bar + primary action, and pagination / progressive loading.
- The implementation MUST satisfy the initiative's evaluation criteria: it works, it is architecturally sound, it is genuinely agentic (not fake-agentic), it can scale beyond demo size, and the team can defend what they built.

## Rationale
The initiative lists eight required deliverables and a five-question evaluation rubric. These are not optional appendices — they are how the system is judged. Treating them as a single FR keeps every deliverable traceable without exploding the FR count.

## Source excerpts
> ## 📊 REQUIRED DELIVERABLES
>
> 1. Working System
> - End-to-end functional prototype

> 3. Problem Decomposition ("Show Your Work")
> - Explicitly document:
>   - How you broke down the problem
>   - Why you chose your architecture
>   - Tradeoffs considered

> 4. Agent Design
> - Agent responsibilities
> - How decisions are made
> - How orchestration works

> 7. Design Patterns Used (Workflow related)
> This section refers specifically to **Neo workflow design patterns** used in your solution, not general application architecture patterns.
> - Examples:
>   - Contract binding
>   - Agent orchestration
>   - Data partitioning
>   - Tool abstraction

> 8. Test Cases
> - Must include:
>   - Search returns live results
>   - Response includes a **summary** plus **cited references** (titles + URLs + context), not only bare links
>   - History persists + retrieves
>   - Bookmarks persist + retrieve
>   - Chunked data retrieval works
>   - System handles large dataset without failure
>   - UI: source filters/tabs, search bar + primary action, and pagination or progressive loading behave as specified

> ## 🧪 EVALUATION CRITERIA
> You will be assessed on:
> - Does it work?
> - Is it architecturally sound?
> - Is it agentic or fake-agentic?
> - Can it scale beyond demo size?
> - Do you understand what you built?

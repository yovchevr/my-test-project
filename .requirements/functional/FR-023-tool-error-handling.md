---
id: FR-023
title: Handle tool invocation errors explicitly
source: .initiatives/project_spec.md
status: approved
area: tooling
---

## Statement
The agent MUST handle tool invocation errors explicitly — failures from any tool MUST produce a structured error that the agent can react to, and MUST NOT crash the request.

## Acceptance criteria
- Each tool MUST return errors in a documented error shape (per FR-021's contract requirements).
- The agent MUST distinguish between transient errors (which MAY be retried — see NFR-005) and terminal errors (which MUST surface as the FR-005 error state).
- For the web search tool specifically, the agent's retry handling MUST follow the policy pinned in NFR-005 / FR-012: up to **2 retries**, **fixed 500ms backoff** between attempts, **10s total per-request timeout budget** (per OQ-001). Other tools MAY adopt the same defaults but MUST document any deviation.
- A tool failure MUST NOT cause the API to return an unstructured 500 with no body — the user-facing error path is FR-005.
- The chosen retry / surface strategy per tool MUST be documented as part of the tool interface.

## Rationale
The initiative lists "Error handling" as one of the three things the tooling layer must demonstrate. Without explicit error handling, every other failure-resilience requirement (NFR-005) is unverifiable.

## Source excerpts
> ### MCP / Tooling Layer
> Must include:
> - At least 2 tools, such as:
>   - Web search tool
>   - Data storage/retrieval tool
> Show:
> - Tool interface design
> - How agents invoke tools
> - Error handling

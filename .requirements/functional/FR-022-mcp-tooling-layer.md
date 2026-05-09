---
id: FR-022
title: Provide an MCP tooling layer with at least two tools
source: .initiatives/project_spec.md
status: approved
area: tooling
---

## Statement
The system MUST expose an MCP / tooling layer containing at least two tools, including a web search tool and a data storage / retrieval tool.

## Acceptance criteria
- At least two distinct tools MUST be registered in the tooling layer; one MUST be a web search tool (satisfying FR-012) and one MUST be a data storage / retrieval tool (covering the stores in FR-014, FR-015, FR-016).
- Each tool MUST have a documented interface (input schema, output schema, error shape) per the contract requirements of FR-021.
- The agent (FR-011) MUST invoke the tools through this interface; ad-hoc bypassing of the tool interface MUST NOT be acceptable.
- The two MAY be implemented as MCP servers, in-process tool handlers, or another agentic tool-calling mechanism — the integration style is implementation-defined as long as the interface is documented.

## Rationale
The initiative names the MCP / tooling layer as a required component with a minimum count of two tools and gives concrete examples for each role. Defining the tool interface separately is what lets the agent be tested in isolation.

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

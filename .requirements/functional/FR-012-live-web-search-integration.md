---
id: FR-012
title: Integrate a real web search tool with live results
source: .initiatives/project_spec.md
status: approved
area: tooling
---

## Statement
The system MUST integrate a real web search tool or API that fetches live results, parses them into a structured format, and handles failures with retries.

## Acceptance criteria
- A real (non-mock) web search tool or API MUST be wired in and MUST be invoked when the user issues a LIVE search.
- Raw responses from the search tool MUST be parsed into a structured representation (matching the contract referenced by FR-009 / FR-021) before being passed downstream.
- The integration MUST handle failures (transport errors, rate limits, malformed responses) without crashing the request — see also NFR-005.
- A mock-only implementation MUST NOT satisfy this requirement (see Constraints — non-acceptable).

## Rationale
The initiative requires live web search and explicitly forbids hardcoded mock-only systems. Parsing into a structured format is what lets every downstream layer (cache, synthesis, UI) consume the same shape.

## Source excerpts
> ### Web Search Integration
> Must use a real web search tool/API. Must:
> - Fetch live results
> - Parse results into structured format
> - Handle failures + retries

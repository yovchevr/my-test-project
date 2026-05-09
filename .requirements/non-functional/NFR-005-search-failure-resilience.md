---
id: NFR-005
title: Recover from web search tool failures with retries
source: .initiatives/project_spec.md
status: draft
category: availability
metric: retry behavior on transient web search failures
target: open — retry count, backoff strategy, and timeout budget unspecified by the initiative (see assumptions.md → Open questions)
---

## Statement
The system MUST handle failures from the web search tool with retries on transient errors and MUST surface persistent failures as the FR-005 error state.

## Acceptance criteria
- Transient errors from the web search tool (network errors, 5xx responses, rate limits) MUST trigger at least one retry.
- Persistent failures (after the configured retry budget is exhausted) MUST surface as an FR-005 error state in the UI rather than as a crash or blank screen.
- The retry policy (count, backoff, timeout) MUST be documented; this NFR is `draft` until the policy targets are decided — see assumptions.md "Open questions" entry tagged NFR-005.
- A test MUST inject a transient failure and assert that the system recovers; a separate test MUST inject a persistent failure and assert the FR-005 error state is rendered.

## Rationale
The initiative requires the integration to "Handle failures + retries" but does not pin the retry count or timing. The behavior is required; the specific numbers are an open question.

## Source excerpts
> ### Web Search Integration
> Must use a real web search tool/API. Must:
> - Fetch live results
> - Parse results into structured format
> - Handle failures + retries

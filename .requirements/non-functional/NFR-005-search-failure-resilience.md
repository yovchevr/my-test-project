---
id: NFR-005
title: Recover from web search tool failures with retries
source: .initiatives/project_spec.md
status: approved
category: availability
metric: retry behavior on transient web search failures
target: up to 2 retries, fixed 500ms backoff between attempts, 10s total per-request timeout budget (per OQ-001)
---

## Statement
The system MUST handle failures from the web search tool with retries on transient errors and MUST surface persistent failures as the FR-005 error state.

## Acceptance criteria
- Transient errors from the web search tool (network errors, 5xx responses, rate limits) MUST trigger up to **2 retries** before the request is treated as failed.
- The delay between attempts MUST be a **fixed 500ms backoff** (no exponential ramp, no jitter).
- The total time spent across the original attempt plus any retries for a single user request MUST NOT exceed a **10s timeout budget**; once exceeded, the request MUST be treated as failed even if a retry is still pending.
- Persistent failures (after the retry budget or the 10s timeout is exhausted) MUST surface as an FR-005 error state in the UI rather than as a crash or blank screen.
- A test MUST inject a transient failure that recovers within the retry budget and assert that the system returns a successful result; a separate test MUST inject a persistent failure (or one that exhausts the 10s budget) and assert the FR-005 error state is rendered.

## Rationale
The initiative requires the integration to "Handle failures + retries" but does not pin the retry count or timing. The user resolved this via OQ-001 (assess checkpoint, 2026-05-09): 2 retries, 500ms fixed backoff, 10s total budget. With the policy pinned, the requirement is testable end-to-end.

## Source excerpts
> ### Web Search Integration
> Must use a real web search tool/API. Must:
> - Fetch live results
> - Parse results into structured format
> - Handle failures + retries

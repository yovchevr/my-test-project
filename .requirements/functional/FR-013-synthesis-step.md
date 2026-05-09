---
id: FR-013
title: Synthesize raw hits into summary plus references
source: .initiatives/project_spec.md
status: approved
area: agent
---

## Statement
The agent (or a dedicated synthesis step driven by it) MUST turn raw search hits into a concise summary with explicit web references that satisfies FR-007, FR-008, and FR-009.

## Acceptance criteria
- A synthesis step MUST exist as a discrete unit of work invoked by the agent for every search.
- Its output MUST conform to the contract from FR-010 — an `answer_summary` and a `citations` / `references` list.
- It MUST NOT bypass the citation requirement: every material claim in its summary MUST be backed by an entry in the references list (FR-008).
- The synthesis step MUST consume the parsed structured results from FR-012 (and may consume cached chunks from FR-016 / FR-018).

## Rationale
The initiative is specific that "the agent (or a dedicated synthesis step) turns raw hits into a concise summary with explicit web references". Naming this as its own requirement keeps the answer-quality contract testable in isolation from raw search.

## Source excerpts
> - **Produce answer-quality output**: The agent (or a dedicated synthesis step) turns raw hits into a **concise summary** with **explicit web references** (see "Search answers" under UI / product expectations above). Raw search results remain available for pagination and detail, but the primary user-facing response is **summarized and cited**, not an unordered link list.

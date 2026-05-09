---
title: Domain invariants
read_when: changing rules the system must preserve, or modifying a contract
---

# Domain invariants

Declarative rules the system MUST preserve at all times. These are the constraints that any implementation, refactor, or feature addition MUST satisfy. They are stated *what*, not *how* (per principle 4). If you find yourself writing a procedure that checks one of these at runtime, look for the structural change that makes the violation impossible instead.

## Search-response invariants

- **I-1.** Every successful search response MUST contain a non-empty `answer_summary` and a non-empty `references` list. (FR-007, FR-009, FR-010)
- **I-2.** Every material claim or bullet in the `answer_summary` MUST cite at least one entry in the `references` list via a citation marker. A claim with no citation is malformed. (FR-008)
- **I-3.** Every entry in the `references` list MUST have a non-empty `title`, a non-empty `url`, and a non-empty `context`. A reference missing any of the three fields MUST NOT be returned. (FR-009)
- **I-4.** No two entries in a single `references` list MUST share the same `url`. Duplicate sources MUST be merged into one entry that the citation marker(s) point to. (FR-009)
- **I-5.** Every reference entry's `url` MUST resolve back to a result returned by the search. References fabricated by the synthesis step (no underlying result) MUST NOT exist. (FR-008, FR-013)

## Source-type invariants

- **I-6.** A search request's `source_filter` MUST be exactly one of `LIVE`, `HISTORY`, or `BOOKMARK`. No other value MUST be accepted. (FR-003)
- **I-7.** A `LIVE` search MUST trigger a `web-search` tool invocation. A `HISTORY` or `BOOKMARK` search MUST NOT trigger a `web-search` tool invocation. (FR-012, FR-014, FR-015)
- **I-8.** Every `LIVE` search that reaches the agent MUST result in (a) a write to the search cache (FR-016) and (b) an append to the history store (FR-014), even if the result count is zero.

## Storage invariants

- **I-9.** No single chunk MUST hold the entire result set of a query whose total exceeds the chunk-size policy in `decisions/0003-chunking-strategy.md`. Storing the full result as one document MUST NOT be acceptable. (FR-017, NFR-003)
- **I-10.** A page-N read MUST touch strictly fewer chunks than the total chunk count for the query when the total is greater than one. (FR-018, NFR-004)
- **I-11.** A bookmark or detail lookup keyed by identifier MUST resolve via the index (FR-020) without iterating the full chunk set. (FR-018, NFR-004)
- **I-12.** Persisted entries (history, bookmarks, cache) MUST survive a process restart — in-memory-only storage MUST NOT satisfy these stores. (FR-014, FR-015, FR-016)
- **I-13.** No store MUST auto-purge entries on age, size, or count by default. Retention is out of scope per OQ-004. (FR-014, FR-015, FR-016)
- **I-14.** No store MUST carry a user-id column, per-user namespace, or session-keyed isolation. The system is single-user per OQ-005. (NFR-006)
- **I-15.** No store MUST gate reads or writes behind authentication. There is no auth regime per OQ-004. (FR-014, FR-015, FR-016)

## Layer-boundary invariants

- **I-16.** UI code MUST NOT import agent code or data-layer code directly. The only legal seam is the UI ↔ API contract. (FR-021, FR-024)
- **I-17.** API code MUST NOT touch the data layer or call tools directly. The only legal seam is the API ↔ Agent contract. (FR-021, FR-024)
- **I-18.** Agent code MUST NOT import data-layer modules directly. The only legal seam is the `data-store` tool through the tooling layer. (FR-021, FR-022, FR-024)
- **I-19.** Agent code MUST NOT issue raw HTTP calls to external services. The only legal seam is a registered tool. (FR-022, FR-024)
- **I-20.** No two layers MUST have a cyclic import relationship. CI MUST enforce this. (FR-024)
- **I-21.** Each of the four layer boundary contracts MUST be defined exactly once and imported by both sides. Duplicated shape definitions MUST NOT exist. (FR-021)

## Agent-loop invariants

- **I-22.** The agent's control flow MUST NOT contain branches keyed on specific query strings or specific known result shapes. (NFR-006)
- **I-23.** Adding a new tool to the registry MUST be possible without modifying the agent's main loop. (NFR-006, FR-022)
- **I-24.** Adding a new source filter MUST be possible without modifying the synthesis step. (NFR-006, FR-013)
- **I-25.** Every tool invocation MUST be cancellable via `AbortSignal` and MUST be subject to the agent's request budget (10s for `web-search` per NFR-005). (NFR-005)

## Error-handling invariants

- **I-26.** Every tool MUST return errors in the structured shape defined by the agent ↔ tools contract — `{ ok: false, error: { kind, message, ... } }`. Throwing an exception across the tool boundary MUST be treated as a terminal error by the agent. (FR-023)
- **I-27.** Transient errors from the `web-search` tool MUST trigger up to 2 retries with a fixed 500ms backoff, bounded by the 10s request budget. The retry helper MUST be a single shared implementation. (NFR-005, FR-023)
- **I-28.** A persistent failure (retry budget exhausted or 10s timeout) MUST surface to the UI as the FR-005 error state. An unstructured 500 with no body MUST NOT be returned. (FR-005, FR-023)
- **I-29.** Empty results MUST surface as the FR-005 empty state — they MUST NOT be conflated with the error state, and they MUST NOT be returned as a blank screen. (FR-005)

## Determinism invariants

- **I-30.** Chunking MUST be deterministic given the same input result set and the same chunking policy. The same input MUST produce the same chunk boundaries on every run. (FR-017, FR-019)
- **I-31.** Indexing MUST be deterministic given the same chunk set. The same input MUST produce the same index entries on every run. (FR-020)
- **I-32.** Time and randomness MUST be injected (clock and RNG passed in), not read directly from the global environment, anywhere in the agent or data layers. This is what makes I-27 and I-30 testable. (NFR-005, FR-019)

## Contract-versioning invariants

- **I-33.** A breaking change to any of the four layer boundary contracts MUST be accompanied by a superseding ADR and a synchronized update on both sides of the boundary. Silent contract drift MUST NOT occur. (FR-021)
- **I-34.** Contract types MUST be exported only from `@neo-search/contracts`. A layer MUST NOT define its own copy of a contract type, even structurally identical. (FR-021)

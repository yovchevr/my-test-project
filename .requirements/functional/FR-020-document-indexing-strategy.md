---
id: FR-020
title: Document the indexing strategy
source: .initiatives/project_spec.md
status: approved
area: data
---

## Statement
The system MUST document the indexing strategy used to look up chunks, including the lookup method.

## Acceptance criteria
- The architecture document MUST describe the index structure (e.g. hash map keyed by query, sorted index by timestamp, inverted index by token).
- The architecture document MUST describe the lookup method — what the index returns given a query, page, or filter.
- The documented method MUST be the one actually used by FR-018's targeted retrieval.
- The documentation MUST live in the same architecture deliverable as FR-019.

## Rationale
"Indexing strategy (lookup method)" is required as a separate demonstration alongside chunking. Without an explicit index, FR-018's "no full scan" guarantee cannot be reasoned about.

## Source excerpts
> ### Chunking + Indexing
> Must demonstrate:
>  - Chunking strategy (size, boundaries)
>  - Indexing strategy (lookup method)
>  - Retrieval efficiency (not full-scan)

> 5. Data Strategy
> - Chunking approach
> - Indexing approach
> - Storage format

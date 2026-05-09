---
id: NFR-004
title: Retrieve without full scans of stored data
source: .initiatives/project_spec.md
status: approved
category: performance
metric: chunks read per page-N request relative to total chunks for the query
target: chunks read MUST be strictly less than the total chunk count when the total is greater than one
---

## Statement
The data layer MUST retrieve only the chunks needed to satisfy a read; full-scan retrieval over a query's complete chunk set MUST NOT be acceptable.

## Acceptance criteria
- For a query whose results are split into N > 1 chunks, a single-page read MUST touch strictly fewer than N chunks.
- A bookmark or detail lookup keyed by identifier MUST resolve via the index (FR-020) — it MUST NOT iterate the entire chunk set.
- A retrieval-efficiency test MUST be present in the test suite and MUST assert the bound above.
- Implementations that satisfy FR-018 procedurally but still scan all chunks at runtime MUST fail this NFR.

## Rationale
The initiative requires "Retrieval efficiency (not full-scan)" as one of the demonstrable properties of chunking + indexing. This is the property that makes scaling to 1000+ results meaningful.

## Source excerpts
> ### Chunking + Indexing
> Must demonstrate:
>  - Chunking strategy (size, boundaries)
>  - Indexing strategy (lookup method)
>  - Retrieval efficiency (not full-scan)

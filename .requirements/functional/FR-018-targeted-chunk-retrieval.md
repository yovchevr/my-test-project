---
id: FR-018
title: Retrieve only relevant chunks on read
source: .initiatives/project_spec.md
status: approved
area: data
---

## Statement
The system MUST retrieve only the chunks relevant to a given read (page, range, or filter) and MUST NOT load the full result set when a partial read is sufficient.

## Acceptance criteria
- A pagination read for page N MUST load only the chunk(s) covering page N, not the entire query's result set.
- A bookmark or detail lookup MUST resolve through the index (FR-020) to a specific chunk rather than scanning all chunks.
- A test MUST be able to demonstrate that loading page N reads strictly fewer chunks than the total chunk count for the query (when the total is greater than one).
- See NFR-004 for the categorical "no full scan" retrieval property.

## Rationale
Chunking is only valuable if reads are targeted; a chunked store that always loads every chunk is no better than the monolith it replaced. The initiative pairs chunking and "retrieve only relevant chunks" deliberately.

## Source excerpts
> ### Large Data Requirement (MANDATORY)
> System must handle large result sets:
>  - Simulate or fetch 1000+ results per query
> Must:
>   - Chunk data into partitions
>   - Store as segmented JSON or indexed structure
>   - Retrieve only relevant chunks

> ### Chunking + Indexing
> Must demonstrate:
>  - Chunking strategy (size, boundaries)
>  - Indexing strategy (lookup method)
>  - Retrieval efficiency (not full-scan)

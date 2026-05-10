# `@neo-search/data-cache`

The indexed search cache: stores fetched web results in chunks so reads return
only the chunks they need (FR-016, FR-017, FR-018, NFR-003, NFR-004).

> Layering: this package is part of the data layer. Per
> `.design/foundation/architecture.md` and ADR 0001, the agent MUST NOT import
> this package directly — the only legal entry point is the `data-store` tool.

## Public surface (current state)

STORY-004 ships the deterministic chunker primitive. STORY-005 will add the
SQLite-backed `SearchCache` that consumes it.

```ts
import { chunk, DEFAULT_MAX_CHUNK_SIZE, DEFAULT_OVERSIZE_BYTE_LIMIT } from '@neo-search/data-cache';
```

| Export                        | Kind     | Notes                                                                                     |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `chunk(results, opts?)`       | function | Pure, deterministic. Partitions an ordered `ResultCardContract[]` into ordered `Chunk[]`. |
| `Chunk`                       | type     | `{ sequence: number; results: ResultCardContract[]; byteSize: number }`.                  |
| `ChunkOptions`                | type     | `{ maxChunkSize?: number; oversizeByteLimit?: number }`.                                  |
| `DEFAULT_MAX_CHUNK_SIZE`      | constant | Pinned at `100` per ADR 0003.                                                             |
| `DEFAULT_OVERSIZE_BYTE_LIMIT` | constant | Pinned at `64 * 1024` per ADR 0003.                                                       |

## Chunking strategy (FR-019)

The chunking strategy is pinned in ADR 0003
([`.design/decisions/0003-chunking-strategy.md`](../../.design/decisions/0003-chunking-strategy.md))
and re-stated here so any reader of this package can verify the strategy from
the chunks on disk.

- **Chunk size policy**: a fixed **100 results per chunk** (the default
  `maxChunkSize`). Larger chunks would weaken NFR-004's "strictly fewer than
  total" bound; smaller chunks would inflate the on-disk file count for a
  10000-result query.
- **Boundary criterion**: ordinal position in the parsed result list.
  Results 1..100 land in `sequence: 0`, 101..200 in `sequence: 1`, and so on.
  Boundaries are deterministic and reproducible from the input list alone —
  a reviewer can predict any chunk's contents by counting (I-30).
- **Override condition (safety valve)**: if a single result's serialized
  `byteSize` would push the in-flight chunk past **64 KB** AND the chunk
  already holds at least one result, the chunk is sealed early and a new
  chunk starts. A brand-new chunk MAY hold a single oversized result. This
  is the only way the size-100 boundary is broken; the **ordinal sequence
  numbering MUST stay contiguous** even when a seal fires — the override is
  about file size, not about routing.
- **Determinism (I-30, I-32)**: the chunker is a pure function — no clock
  reads, no `Math.random`, no global state. Same input → byte-identical
  output on every run. This is what makes FR-019's "documented strategy"
  verifiable from the chunks on disk: a reviewer can re-run the chunker on
  the same input and get the same chunks.

The 1000-result deterministic fixture used by this package's tests (and by
STORY-008's NFR-003 stress suite) lives at
`packages/test-fixtures/src/large-result-set.json`. The seeded generator that
produced it is `generateResults` from `@neo-search/test-fixtures`; the same
`(count, seed)` always yields byte-identical output.

## Indexing strategy

STORY-005 owns the SQLite index. See
[`components/data-layer.md`](../../.design/components/data-layer.md) for the
shape (`cache_index(query, page, chunk_id)`) and the FR-020 lookup rule.

## Out of scope (this package)

- No SQLite, no filesystem, no `data-store` tool wiring — the chunker is a
  pure transform. STORY-005 owns persistence.
- No history or bookmark store concerns — those are `@neo-search/data-history`
  and `@neo-search/data-bookmarks`.

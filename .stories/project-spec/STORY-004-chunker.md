---
id: STORY-004
title: Implement the deterministic chunker
initiative: .initiatives/project_spec.md
requirements: [FR-017, FR-019]
design_refs:
  - .design/components/data-layer.md
  - .design/decisions/0003-chunking-strategy.md
  - .design/foundation/conventions.md
status: ready
points: 3
depends_on: [STORY-002]
external_depends_on: []
wave: 3
---

## Goal / user value
Provide the shared chunking primitive every store will use to satisfy FR-017's "no monolithic blob" rule. A pure function `chunk(results: ResultCard[]): Chunk[]` that splits an ordered list into chunks of exactly 100 results each (the last chunk MAY be smaller), keyed by ordinal sequence. Deterministic — the same input MUST produce the same chunks on every run (I-30). This is the load-bearing primitive that makes FR-019's documented strategy verifiable from the chunks on disk.

## Context
Per ADR 0003 the chunk size is fixed at 100, the boundary criterion is ordinal position, and the override condition (a single `Result` exceeding 64 KB MAY seal a chunk early) is a safety valve. Per `data-layer.md` the chunker lives in `packages/data-cache/src/chunker.ts` so the cache (STORY-005) can import it. It does NOT touch SQLite or the filesystem — that's the cache's job. This story ships the pure transform plus its FR-019 documentation.

## Scope
- New module `packages/data-cache/src/chunker.ts` exporting `chunk(results: ResultCard[], opts?: { maxChunkSize?: number; oversizeByteLimit?: number }): Chunk[]`.
- `Chunk = { sequence: number; results: ResultCard[]; byteSize: number }` — define and export from the same module (NOT a contract type per `naming-conventions.md`; an internal record).
- Default `maxChunkSize = 100`, `oversizeByteLimit = 64 * 1024`. The defaults MUST be exported as named constants so tests can reference them.
- Deterministic: results 1–100 → `sequence: 0`, 101–200 → `sequence: 1`, … No randomness, no clock reads, no global state.
- Oversize seal: if including the next result would push the accumulated `byteSize` of an in-progress chunk past `oversizeByteLimit`, AND the chunk already has at least one result, seal the chunk and start a new one. The ordinal boundary policy MUST hold — sequence numbers MUST stay contiguous.
- Document the strategy in `packages/data-cache/README.md` per FR-019: state the size policy (100 default), boundary criterion (ordinal position), the override (oversize-seal at 64 KB), and link to ADR 0003.

## Out of scope / non-goals
- No persistence (STORY-005 owns SQLite + filesystem).
- No index (STORY-005 owns the index).
- No history/bookmark concerns (STORY-006/007).

## Acceptance criteria
- `chunk([])` MUST return `[]`.
- `chunk([oneResult])` MUST return one chunk with `sequence: 0` and `results.length === 1`.
- `chunk(<1000 deterministic results>)` MUST return exactly 10 chunks; chunks 0–9 MUST each contain exactly 100 results; sequence numbers MUST be `0, 1, …, 9` in order.
- The function MUST be deterministic — calling `chunk(input)` twice MUST produce structurally identical outputs (asserted by `expect(chunk(input)).toEqual(chunk(input))` after a fresh require/import to rule out memoization).
- A `Result` whose serialized size on its own exceeds `oversizeByteLimit` MUST land in its own chunk (the chunk seals before adding the oversized result if there's already one in flight; a brand-new chunk MAY hold a single oversized result).
- The ordinal boundary policy MUST hold even when the oversize seal fires — sequence numbers MUST be contiguous integers starting at 0.
- `byteSize` on each chunk MUST equal the total `JSON.stringify(results).length` of its contents.
- `tsc --noEmit` and `eslint` MUST pass.
- `packages/data-cache/README.md` MUST document the chunk size policy and boundary criterion per FR-019, with a link to `decisions/0003-chunking-strategy.md`.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The shared 1000-result fixture lands at `packages/test-fixtures/src/large-result-set.json` and is generated deterministically from a seeded RNG (referenced by both this story's tests and STORY-008).

## Test plan
- Unit (`packages/data-cache/src/chunker.test.ts`): the seven acceptance criteria above, plus a property-style test asserting `flatMap(chunks, c => c.results)` deep-equals the input list (no result loss, no reorder).
- Integration: not applicable here; STORY-005's cache tests cover end-to-end ingest.
- E2E: not applicable.
- Adversarial / NFR coverage: this story underpins NFR-003 (large set) and NFR-004 (no full scan); the chunker itself is exercised adversarially in STORY-008 (1000 / 5000 / 10000 fixtures) and STORY-005 (no-full-scan assertion). The determinism test here is the structural guard that makes I-30 hold.

## Affected design surface
- `.design/components/data-layer.md` — chunking strategy section is implemented here.
- `.design/decisions/0003-chunking-strategy.md` — pinned policy is the contract this story honors.
- `.design/foundation/conventions.md` — determinism rule (no `Date.now`, no `Math.random` in business logic).

## Dependencies
- **Depends on**: STORY-002 (imports `ResultCardContract` to type `ResultCard`).
- **Enables**: STORY-005 (cache writes use the chunker), STORY-008 (NFR-003 large-set fixture).

## Risks & assumptions
- Risk: a future requirement asks for a different chunk size or boundary criterion. Mitigation: any change is a superseding ADR per ADR 0003; the constants are exported so the test surface catches a silent change.
- Assumption: `JSON.stringify` is a stable proxy for on-disk byte size for the prototype's purposes (close enough for the 64 KB safety valve).

## Source excerpts
> Chunk size policy: a fixed 100 results per chunk. Chunk boundary criterion: ordinal position in the parsed result list. Boundaries are deterministic and reproducible from the input list.

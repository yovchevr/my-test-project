---
id: STORY-008
title: Adversarially stress the cache at one thousand plus results
initiative: .initiatives/project_spec.md
requirements: [NFR-003]
design_refs:
  - .design/components/data-layer.md
  - .design/decisions/0003-chunking-strategy.md
  - .design/technology/testing.md
status: ready
points: 3
depends_on: [STORY-005]
external_depends_on: []
wave: 5
---

## Goal / user value
Prove the data-layer holds at the NFR-003 scale floor (1000 results per query) and degrades gracefully past it (5000, 10000), without exceeding a fixed heap budget. This is the categorical "system handles large dataset without failure" test the initiative names. Without a deliberate stress harness, the chunker + cache pass at small sizes and silently regress at the demo.

## Context
Per `technology/testing.md` the NFR-003 stress lives at `packages/data-layer/src/large-set.spec.ts` (logically; physically it lands under `packages/data-cache/` since the cache is what's stressed). Three fixture sizes — 1000 (the floor), 5000 (intermediate), 10000 (10× headroom). Heap budget pinned at ≤ 256 MB peak per the testing-doc reference. The fixture file `packages/test-fixtures/src/large-result-set.json` is already produced by STORY-004 (deterministic seeded generator) at 1000 results; this story extends the generator to optionally produce 5000 and 10000 sizes (or generate-on-demand in the test using the same seeded RNG).

## Scope
- Add a deterministic generator to `packages/test-fixtures/src/generate-results.ts` exporting `generateResults(count, seed): ResultCard[]` (seeded RNG so the test asserts the system, not fixture variance per `technology/testing.md` "Fixture conventions").
- New spec `packages/data-cache/src/large-set.spec.ts` running three parameterized cases at 1000, 5000, 10000 results.
- Each case: `cache.write(query, generated)` → `cache.read(query, page=N)` for several N — assert (a) no throw, (b) `chunksRead < totalChunks` for every page, (c) peak heap (sampled via `process.memoryUsage().heapUsed` deltas) stays under 256 MB across the full ingest+read pass.
- Use `vi.useFakeTimers()` to make any timing-sensitive code deterministic per `technology/testing.md` "Forbidden test patterns".

## Out of scope / non-goals
- No cache eviction or shrinking (I-13).
- No multi-process or multi-machine stress (OQ-002).
- No latency-percentile measurement (OQ-003 = best-effort, no numeric target).
- No UI-side stress (STORY-019's responsive matrix covers UI-layer breadth).

## Acceptance criteria
- The 1000-result case MUST complete the full ingest → store → page-N → return path without throwing for `page = 1, 5, 10` (NFR-003 floor).
- The 5000-result case MUST complete without throwing for `page = 1, 50, 100, 200`.
- The 10000-result case MUST complete without throwing for `page = 1, 100, 200, 400`.
- For every case, `chunksRead < totalChunks(query)` MUST hold for every sampled page (this re-asserts NFR-004 at scale, complementing STORY-005's smaller-fixture assertion).
- For every case, peak `heapUsed` measured during the ingest+read pass MUST stay strictly under 256 MB.
- The fixture generator MUST be deterministic — calling `generateResults(1000, "seed-a")` twice MUST produce structurally identical lists.
- `tsc --noEmit`, `eslint`, `vitest` MUST pass on the affected packages.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- The 1000-result fixture file exists at `packages/test-fixtures/src/large-result-set.json` (committed, generated from the seeded generator). 5000/10000 variants generate in-test to keep the fixture file count low.

## Test plan
- Unit: not applicable (this story IS the integration spec).
- Integration: the three parameterized cases above (1k, 5k, 10k) at `packages/data-cache/src/large-set.spec.ts`.
- E2E: not applicable here; STORY-019 includes a smoke run at the 1000-result floor.
- Adversarial / NFR coverage: this entire story IS the NFR-003 adversarial test per `technology/testing.md`. The heap-budget assertion catches a regression where someone accidentally loads all chunks into memory; the per-page `chunksRead < totalChunks` assertion catches a regression where the index degrades to a full scan at large N.

## Affected design surface
- `.design/components/data-layer.md` — confirms NFR-003 holds against the implemented cache.
- `.design/decisions/0003-chunking-strategy.md` — the 100-results-per-chunk choice is what makes the headroom math work.
- `.design/technology/testing.md` — implements the named NFR-003 stress harness verbatim.

## Dependencies
- **Depends on**: STORY-005 (the cache being stressed).
- **Enables**: nothing downstream — this is a quality gate that locks in NFR-003.

## Risks & assumptions
- Risk: `process.memoryUsage()` is not perfectly deterministic across runs — GC timing varies. Mitigation: use a generous 256 MB ceiling (≫ the actual working set for 10k results at ~1 KB per result + chunk metadata) so the test catches real regressions, not GC noise.
- Assumption: 10k results is a representative ceiling; 100k+ would warrant additional structural changes (out of prototype scope).

## Source excerpts
> A test MUST exercise a query that produces or simulates ≥ 1000 results and MUST complete the full ingest → store → retrieve → render path without error. The system MUST NOT load all 1000+ results into memory at once when serving a single page.

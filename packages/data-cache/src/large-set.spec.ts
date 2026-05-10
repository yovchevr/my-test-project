/**
 * STORY-008 / NFR-003 — adversarial large-result-set stress harness for the
 * indexed search cache.
 *
 * Per `.design/technology/testing.md` (NFR coverage matrix):
 *
 *   > Drive a 1000-, 5000-, and 10000-result fixture through ingest → chunk →
 *   > store → page-N → render path. Assert (a) no crash, (b) peak heap stays
 *   > under a fixed budget (≤ 256 MB), (c) page reads still satisfy NFR-004.
 *
 * The 1000-result floor (NFR-003) is the categorical "system handles large
 * dataset without failure" point the initiative names. The 5000 and 10000
 * cases give 5× and 10× headroom respectively; the heap budget catches a
 * regression where someone accidentally loads all chunks into memory, and the
 * per-page `chunksRead < totalChunks` assertion catches a regression where
 * the index degrades to a full scan at large N.
 *
 * Per `.design/foundation/conventions.md` and the testing-doc "Forbidden test
 * patterns" we use `vi.useFakeTimers()` so any timing-sensitive code under
 * test (e.g. internal retry/backoff that could appear in a future cache
 * iteration) is deterministic. The cache itself is synchronous through
 * `better-sqlite3`, so no fake-time behavior is exercised today — the call is
 * future-proofing per the testing doc, not load-bearing for the assertions.
 *
 * Per the testing-doc "Fixture conventions" the test asserts the system under
 * test, not the fixture's variance — every result list is generated
 * deterministically by `generateResults(count, seed)` from
 * `@neo-search/test-fixtures`. The 5000 and 10000 sizes are generated
 * in-test so the committed fixture file count stays low (1000 stays on disk;
 * larger sizes regenerate on demand).
 *
 * The matching FR-016 / FR-018 / NFR-004 round-trip lives in
 * `cache.spec.ts`; this file is exclusively the NFR-003 stress harness.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateResults } from '@neo-search/test-fixtures';
import { createSearchCache, DEFAULT_PAGE_SIZE, type SearchCache } from './index.js';

// ──────────────── NFR-003 budget constants ────────────────

/**
 * Heap-budget ceiling pinned by `.design/technology/testing.md` NFR-003 row:
 * "peak heap stays under a fixed budget (≤ 256 MB)". Generous compared to the
 * actual working set (10k × ~1 KB results + chunk metadata ≈ 10 MB) so the
 * assertion catches real regressions, not GC noise (per the story's "Risks &
 * assumptions" section).
 */
const HEAP_BUDGET_BYTES = 256 * 1024 * 1024;

/**
 * Deterministic seed for fixture generation. Keeping it constant across the
 * three sizes means a flaky failure can be reproduced byte-for-byte from the
 * seed alone — this is what makes the suite asserting the *system*, not the
 * fixture's variance (per testing.md "Fixture conventions").
 */
const STRESS_SEED = 0xdeadbeef;

// ──────────────── Heap-measurement helper ────────────────

/**
 * Sample `process.memoryUsage().heapUsed`, encouraging a GC first if the
 * runtime exposes one (it does when Node is started with `--expose-gc`). The
 * Vitest worker is NOT started with `--expose-gc` by default, so the helper
 * gracefully no-ops on the GC call and falls back to a raw sample. The
 * 256 MB ceiling is wide enough that GC noise does not push a healthy run
 * past it.
 *
 * The story's heap-budget AC says "peak `heapUsed` measured during the
 * ingest+read pass MUST stay strictly under 256 MB". We sample at every
 * meaningful boundary (after `write`, after each `read`) and track the max.
 */
const sampleHeap = (): number => {
  const maybeGc: undefined | (() => void) = (globalThis as unknown as { gc?: () => void }).gc;
  if (typeof maybeGc === 'function') {
    maybeGc();
  }
  return process.memoryUsage().heapUsed;
};

/**
 * Capture the *delta* peak — the largest excess over the baseline taken
 * before the work began. The absolute `heapUsed` includes Vitest's worker
 * overhead, the test runner, and any prior-test residue; the delta isolates
 * the cost of THIS test case so the 256 MB ceiling is meaningful.
 */
interface HeapTracker {
  baseline: number;
  peakDelta: number;
  observe(): void;
}

const startHeapTracker = (): HeapTracker => {
  const baseline = sampleHeap();
  return {
    baseline,
    peakDelta: 0,
    observe(): void {
      const current = sampleHeap();
      const delta = current - this.baseline;
      if (delta > this.peakDelta) {
        this.peakDelta = delta;
      }
    },
  };
};

// ──────────────── Suite-wide fake-timer wiring ────────────────

beforeAll(() => {
  // testing.md "Forbidden test patterns": do not use `setTimeout` for waiting;
  // use `vi.useFakeTimers()`. The cache is synchronous today, but pinning the
  // fake-timer posture at suite scope future-proofs the harness so any clock
  // touch added later (NFR-005-style retry, periodic GC, etc.) cannot leak
  // wall-clock time into assertions.
  vi.useFakeTimers();
});

afterAll(() => {
  vi.useRealTimers();
});

// ──────────────── Per-case fixture infrastructure ────────────────

let dataDir: string;
let cache: SearchCache;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'neo-search-large-set-'));
});

afterEach(() => {
  try {
    cache.close();
  } catch {
    // ignore — close is idempotent in production but tests may have
    // already closed it.
  }
  rmSync(dataDir, { recursive: true, force: true });
});

// ──────────────── Parameterized cases ────────────────

interface StressCase {
  /** Number of generated results — drives chunk count and page count. */
  resultCount: number;
  /** Pages the AC names for this case. */
  pages: number[];
  /** Expected chunk count: ceil(resultCount / 100) per ADR 0003. */
  expectedChunks: number;
}

const STRESS_CASES: readonly StressCase[] = [
  // NFR-003 floor — the categorical "system handles large dataset without
  // failure" point; pages 1, 5, 10 are the AC named in
  // `.stories/project-spec/STORY-008-large-result-set-stress.md`.
  { resultCount: 1000, pages: [1, 5, 10], expectedChunks: 10 },
  // 5× the floor — intermediate stress; pages span the entire range.
  { resultCount: 5000, pages: [1, 50, 100, 200], expectedChunks: 50 },
  // 10× headroom over the floor; pages 1, 100, 200, 400.
  { resultCount: 10000, pages: [1, 100, 200, 400], expectedChunks: 100 },
];

describe('NFR-003 / STORY-008 — large-result-set stress harness', () => {
  // Determinism guard for the fixture generator. The story's AC says calling
  // `generateResults(1000, seed)` twice MUST produce structurally identical
  // lists. The test name cites the requirement so the FR-coverage grep in
  // `naming-conventions.md` finds it.
  it('NFR-003 — generateResults is deterministic for the same (count, seed) pair', () => {
    const first = generateResults(1000, STRESS_SEED);
    const second = generateResults(1000, STRESS_SEED);
    expect(first).toEqual(second);
    // Belt-and-braces against accidental shared mutable state: stringify both
    // so a hidden non-enumerable diff surfaces too. Mirrors the chunker
    // determinism check in `chunker.test.ts`.
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // Also: the same property at 5000 and 10000 sizes (the in-test sizes
    // used by the stress cases below). One assertion per size keeps the
    // failure message specific.
    expect(generateResults(5000, STRESS_SEED)).toEqual(generateResults(5000, STRESS_SEED));
    expect(generateResults(10000, STRESS_SEED)).toEqual(generateResults(10000, STRESS_SEED));
  });

  STRESS_CASES.forEach(({ resultCount, pages, expectedChunks }) => {
    describe(`NFR-003 — ${resultCount.toString()}-result case`, () => {
      it(`completes ingest → store → page-N read for pages [${pages.join(', ')}] without throwing, holds chunksRead < totalChunks, and stays under the ${(HEAP_BUDGET_BYTES / 1024 / 1024).toString()} MB heap budget`, async () => {
        const tracker = startHeapTracker();
        const results = generateResults(resultCount, STRESS_SEED);
        tracker.observe();

        cache = createSearchCache({ dataDir });
        tracker.observe();

        // ─── ingest ───
        const { chunkIds } = await cache.write(`stress-${resultCount.toString()}`, results);
        expect(chunkIds).toHaveLength(expectedChunks);
        tracker.observe();

        // ─── page reads ───
        for (const page of pages) {
          const read = await cache.read(`stress-${resultCount.toString()}`, page);
          tracker.observe();

          // (a) no throw — passing the await above already proves this for
          //     the call itself, but the assertion makes the AC explicit and
          //     gives a useful message if a later regression returns a
          //     malformed shape that crashes the assertions below.
          expect(read).toBeDefined();
          expect(read.pagination).toBeDefined();

          // (b) chunksRead < totalChunks — re-asserts NFR-004 at scale,
          //     complementing STORY-005's smaller-fixture assertion. This is
          //     load-bearing: if the index degrades to a full scan, this
          //     assertion fails before the heap budget does.
          expect(read.chunksRead).toBeLessThan(read.pagination.totalChunks);
          expect(read.pagination.totalChunks).toBe(expectedChunks);

          // The page MUST contain the slice the ordinal-boundary policy
          // predicts. Verifies the index lookup returned the right chunk —
          // a regression where a stale chunk is loaded would slip past the
          // chunksRead assertion alone.
          const ordinalStart = (page - 1) * DEFAULT_PAGE_SIZE;
          const expected = results.slice(ordinalStart, ordinalStart + DEFAULT_PAGE_SIZE);
          expect(read.results).toEqual(expected);

          // hasMore mirrors `page < ceil(resultCount / pageSize)`. For the
          // last paged element, hasMore is false; otherwise true.
          const totalPages = Math.ceil(resultCount / DEFAULT_PAGE_SIZE);
          expect(read.pagination.hasMore).toBe(page < totalPages);
        }

        // (c) peak heap delta stays under the 256 MB budget. The delta
        //     isolates THIS case's cost from the runner's overhead. The
        //     ceiling is pinned by `.design/technology/testing.md` NFR-003.
        expect(tracker.peakDelta).toBeLessThan(HEAP_BUDGET_BYTES);
      });
    });
  });
});

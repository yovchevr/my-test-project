/**
 * `@neo-search/test-fixtures` — deterministic generator for synthetic
 * `ResultCardContract` arrays.
 *
 * STORY-004 ships this generator alongside the chunker so both this story's
 * tests and STORY-008's NFR-003 stress suite share one shape definition. Per
 * `.design/foundation/conventions.md` and I-30 / I-32, fixtures backing
 * deterministic-chunking tests MUST be themselves deterministic — generated
 * from a seeded RNG, never `Math.random`. Per the testing-doc "Fixture
 * conventions" the test asserts the system under test, not the fixture's
 * variance.
 *
 * Algorithm: a tiny mulberry32 PRNG seeded with the caller's seed. Pure
 * function: same `(count, seed)` → byte-identical output on every run.
 */
import type { ResultCardContract } from '@neo-search/contracts';

/**
 * Mulberry32 — 32-bit PRNG used for deterministic fixture generation.
 * Picked over Math.random (non-deterministic) and over a heavier algorithm
 * because the only requirement is reproducibility, not cryptographic strength.
 */
const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const DOMAIN_POOL = [
  'example.com',
  'wikipedia.org',
  'github.com',
  'arxiv.org',
  'mdn.dev',
  'developer.mozilla.org',
  'stackoverflow.com',
  'news.ycombinator.com',
  'reddit.com',
  'medium.com',
];

const TITLE_WORDS = [
  'introduction',
  'overview',
  'guide',
  'reference',
  'deep',
  'dive',
  'practical',
  'tutorial',
  'analysis',
  'comparison',
];

const SNIPPET_WORDS = [
  'chunking',
  'indexing',
  'retrieval',
  'cache',
  'agent',
  'search',
  'pagination',
  'partition',
  'ordinal',
  'deterministic',
  'budget',
  'tool',
  'response',
  'summary',
];

const pick = <T>(rng: () => number, pool: readonly T[]): T => {
  // pool is non-empty by construction; the cast keeps strict
  // `noUncheckedIndexedAccess` honest without a runtime check.
  const idx = Math.floor(rng() * pool.length);
  return pool[idx] as T;
};

/**
 * Build a deterministic `ResultCardContract[]` of length `count`. The shape
 * matches `ResultCardContract` from `@neo-search/contracts`: every field is
 * non-empty, the URL parses as a `uri`. The ordinal index of each result is
 * encoded into its `title` and `url` so reviewers can verify ordering by eye
 * and tests can assert which result landed in which chunk.
 *
 * @param count Number of results to generate. MUST be ≥ 0.
 * @param seed  Integer seed for the RNG. Same `(count, seed)` → identical output.
 */
export const generateResults = (count: number, seed: number): ResultCardContract[] => {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`generateResults: count MUST be a non-negative integer, got ${count}`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`generateResults: seed MUST be an integer, got ${seed}`);
  }
  const rng = mulberry32(seed);
  const out: ResultCardContract[] = [];
  for (let i = 0; i < count; i++) {
    const domain = pick(rng, DOMAIN_POOL);
    const titleA = pick(rng, TITLE_WORDS);
    const titleB = pick(rng, TITLE_WORDS);
    const snippetA = pick(rng, SNIPPET_WORDS);
    const snippetB = pick(rng, SNIPPET_WORDS);
    const snippetC = pick(rng, SNIPPET_WORDS);
    out.push({
      title: `Result ${i.toString().padStart(5, '0')} — ${titleA} ${titleB}`,
      snippet: `${snippetA} ${snippetB} ${snippetC} (entry ${i})`,
      domain,
      url: `https://${domain}/posts/${i.toString().padStart(5, '0')}`,
    });
  }
  return out;
};

/**
 * Default seed used to materialize `large-result-set.json`. Exported so
 * STORY-008 (and any future stress story) can re-derive the same fixture
 * on demand without re-reading the file.
 */
export const LARGE_RESULT_SET_SEED = 0xc0ffee;

/**
 * Default count used to materialize `large-result-set.json`. The 1000-result
 * floor matches the NFR-003 lower bound (`technology/testing.md`).
 */
export const LARGE_RESULT_SET_COUNT = 1000;

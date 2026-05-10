/**
 * `@neo-search/test-fixtures` — shared test fixtures and deterministic
 * fixture generators.
 *
 * STORY-004 introduces the `generateResults` seeded generator and the
 * 1000-result `large-result-set.json` it produces; STORY-008 reuses both
 * for the NFR-003 large-set stress suite.
 */
import type { ResultCardContract } from '@neo-search/contracts';
import largeResultSet from './large-result-set.json' with { type: 'json' };

export {
  generateResults,
  LARGE_RESULT_SET_SEED,
  LARGE_RESULT_SET_COUNT,
} from './generate-results.js';

/**
 * The pre-materialized 1000-result fixture. Generated deterministically by
 * `generateResults(LARGE_RESULT_SET_COUNT, LARGE_RESULT_SET_SEED)`. Cast at
 * the boundary; the generator is the source of truth for shape correctness.
 */
export const largeResultSetFixture: ResultCardContract[] = largeResultSet as ResultCardContract[];

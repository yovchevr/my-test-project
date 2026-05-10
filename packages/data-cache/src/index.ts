/**
 * `@neo-search/data-cache` — public surface.
 *
 * STORY-004 ships the deterministic chunker primitive (FR-017, FR-019, ADR 0003).
 * STORY-005 adds the SQLite-backed `SearchCache` that consumes it (FR-016,
 * FR-018, FR-020, NFR-004).
 */
export {
  chunk,
  DEFAULT_MAX_CHUNK_SIZE,
  DEFAULT_OVERSIZE_BYTE_LIMIT,
  type Chunk,
  type ChunkOptions,
} from './chunker.js';
export {
  createSearchCache,
  DEFAULT_PAGE_SIZE,
  type CacheFs,
  type CacheReadResult,
  type CacheWriteResult,
  type CreateSearchCacheOptions,
  type Pagination,
  type ResultCard,
  type SearchCache,
} from './cache.js';

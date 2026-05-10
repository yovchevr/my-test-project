/**
 * `@neo-search/data-cache` — public surface.
 *
 * STORY-004 ships the deterministic chunker (FR-017, FR-019, ADR 0003).
 * STORY-005 will add the SQLite-backed `SearchCache` that consumes it.
 */
export {
  chunk,
  DEFAULT_MAX_CHUNK_SIZE,
  DEFAULT_OVERSIZE_BYTE_LIMIT,
  type Chunk,
  type ChunkOptions,
} from './chunker.js';

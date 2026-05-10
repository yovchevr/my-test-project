/**
 * Deterministic chunker — the shared primitive every cache write uses to
 * partition a query's result list.
 *
 * Pinned policy (ADR 0003 / `decisions/0003-chunking-strategy.md`):
 *   - **Chunk size**: a fixed 100 results per chunk (default).
 *   - **Boundary criterion**: ordinal position in the parsed result list.
 *     Results 1..100 → sequence 0, 101..200 → sequence 1, and so on.
 *   - **Override**: if a result would push the in-flight chunk's serialized
 *     `byteSize` past `oversizeByteLimit` (default 64 KB) AND the chunk
 *     already holds at least one result, seal the chunk and start a new
 *     one. This is a safety valve, not a routing rule — sequence numbers
 *     stay contiguous.
 *
 * Determinism (I-30, I-32): pure function — no clock, no RNG, no global
 * state. Same input → byte-identical output on every run. The chunking-
 * strategy doc in `packages/data-cache/README.md` cites this module as the
 * implementation of FR-019.
 *
 * This module MUST NOT import the SQLite substrate, the filesystem, or
 * any other side-effecting layer — STORY-005 (the cache) owns persistence;
 * this story owns the pure transform.
 */
import type { ResultCardContract } from '@neo-search/contracts';

/**
 * Default maximum number of results per chunk. Pinned at 100 by ADR 0003.
 * Exported as a named constant so a test can fail loudly if it ever changes
 * silently.
 */
export const DEFAULT_MAX_CHUNK_SIZE = 100;

/**
 * Default oversize-seal threshold in bytes. If including the next result
 * would push the in-flight chunk's `byteSize` past this number AND the
 * chunk already has at least one result, the chunk is sealed early. Pinned
 * at 64 KB by ADR 0003 ("safety valve"). Exported so tests can reference
 * it without redeclaring the magic number.
 */
export const DEFAULT_OVERSIZE_BYTE_LIMIT = 64 * 1024;

/**
 * A single chunk of a query's result list. Internal record (not a contract
 * type per `naming-conventions.md`); STORY-005 reads/writes these via the
 * cache, but the wire shape on the data-store boundary is the chunk-id
 * list, not the chunk body.
 *
 *  - `sequence`: 0-based ordinal position of this chunk within the query.
 *    Sequence numbers MUST be contiguous integers across the chunk array.
 *  - `results`: the slice of input results assigned to this chunk, in
 *    input order.
 *  - `byteSize`: `JSON.stringify(results).length`. Used by the oversize-seal
 *    rule and by STORY-005 when sizing on-disk segments.
 */
export interface Chunk {
  sequence: number;
  results: ResultCardContract[];
  byteSize: number;
}

/**
 * Per-call overrides for the pinned defaults. Both knobs MUST be positive
 * integers when supplied; the function throws on bad input rather than
 * silently producing degenerate chunks.
 */
export interface ChunkOptions {
  maxChunkSize?: number;
  oversizeByteLimit?: number;
}

/**
 * Compute the serialized byte size of a result list. Uses `JSON.stringify`
 * since per ADR 0003 it is a stable proxy for on-disk byte size for the
 * prototype's purposes (close enough for the 64 KB safety valve).
 */
const sizeOf = (results: ResultCardContract[]): number => JSON.stringify(results).length;

/**
 * Partition `results` into ordered chunks per the FR-019 strategy.
 *
 * @param results The ordered list of `ResultCardContract` items.
 * @param opts Optional overrides for the pinned defaults.
 * @returns A list of `Chunk` records with contiguous `sequence` values
 *          starting at 0. The concatenation of every chunk's `results`
 *          equals `results` (no loss, no reorder).
 */
export const chunk = (results: ResultCardContract[], opts: ChunkOptions = {}): Chunk[] => {
  const maxChunkSize = opts.maxChunkSize ?? DEFAULT_MAX_CHUNK_SIZE;
  const oversizeByteLimit = opts.oversizeByteLimit ?? DEFAULT_OVERSIZE_BYTE_LIMIT;

  if (!Number.isInteger(maxChunkSize) || maxChunkSize < 1) {
    throw new Error(
      `chunk: maxChunkSize MUST be a positive integer, got ${String(opts.maxChunkSize)}`,
    );
  }
  if (!Number.isInteger(oversizeByteLimit) || oversizeByteLimit < 1) {
    throw new Error(
      `chunk: oversizeByteLimit MUST be a positive integer, got ${String(opts.oversizeByteLimit)}`,
    );
  }

  const chunks: Chunk[] = [];
  let current: ResultCardContract[] = [];
  let sequence = 0;

  const seal = (): void => {
    chunks.push({ sequence, results: current, byteSize: sizeOf(current) });
    sequence += 1;
    current = [];
  };

  for (const result of results) {
    if (current.length > 0) {
      // Oversize-seal probe: if appending would push `byteSize` past the
      // 64 KB limit AND the chunk already holds at least one result, seal
      // first. The "already has at least one" rule is what lets a brand-new
      // chunk hold a single oversized result (ADR 0003).
      const projectedSize = sizeOf([...current, result]);
      if (projectedSize > oversizeByteLimit) {
        seal();
      }
    }
    current.push(result);
    if (current.length >= maxChunkSize) {
      seal();
    }
  }
  if (current.length > 0) {
    seal();
  }
  return chunks;
};

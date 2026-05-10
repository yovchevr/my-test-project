/**
 * STORY-004 acceptance tests for the deterministic chunker (FR-017, FR-019,
 * ADR 0003, I-30, I-32).
 *
 * Each `it(...)` name cites the FR / ADR / invariant the case covers so
 * grep-by-id (`naming-conventions.md`) finds the test for any regressed
 * requirement. Determinism is the load-bearing property — the chunker
 * underpins the chunking strategy reviewers must be able to verify from
 * the chunks on disk.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  generateResults,
  largeResultSetFixture,
  LARGE_RESULT_SET_COUNT,
  LARGE_RESULT_SET_SEED,
} from '@neo-search/test-fixtures';
import type { ResultCardContract } from '@neo-search/contracts';
import {
  chunk,
  DEFAULT_MAX_CHUNK_SIZE,
  DEFAULT_OVERSIZE_BYTE_LIMIT,
  type Chunk,
} from './chunker.js';

describe('FR-017 / FR-019 / ADR 0003 — deterministic chunker', () => {
  it('returns [] for an empty input list', () => {
    expect(chunk([])).toEqual([]);
  });

  it('returns one chunk with sequence:0 and length 1 for a single result', () => {
    const single: ResultCardContract = {
      title: 'Solo',
      snippet: 'just the one',
      domain: 'example.com',
      url: 'https://example.com/0',
    };
    const chunks = chunk([single]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sequence).toBe(0);
    expect(chunks[0]?.results).toHaveLength(1);
    expect(chunks[0]?.results[0]).toEqual(single);
  });

  it('FR-017 — splits a 1000-result list into exactly 10 chunks of 100 with sequences 0..9', () => {
    const results = generateResults(1000, 0xc0ffee);
    const chunks = chunk(results);
    expect(chunks).toHaveLength(10);
    chunks.forEach((c, idx) => {
      expect(c.sequence).toBe(idx);
      expect(c.results).toHaveLength(100);
    });
    // Sequence numbers contiguous.
    expect(chunks.map((c) => c.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('I-30 — same input produces structurally identical output on every call', () => {
    const results = generateResults(257, 7);
    const a = chunk(results);
    const b = chunk(results);
    expect(a).toEqual(b);
    // Belt-and-braces against accidental shared mutable state: stringify both
    // so a hidden non-enumerable diff surfaces too.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('I-30 — re-imports the chunker fresh and still produces structurally identical output', async () => {
    const results = generateResults(523, 0xdeadbeef);
    const fromFirst = chunk(results);
    // `vi.resetModules()` + dynamic `import('./chunker.js')` rebuilds the
    // module from source, ruling out a hidden memo or shared mutable
    // closure state. The dynamic-import path goes through Vite's loader so
    // the second instance is structurally separate from the static import.
    vi.resetModules();
    const fresh = (await import('./chunker.js')) as { chunk: typeof chunk };
    const fromFresh = fresh.chunk(results);
    expect(fromFresh).toEqual(fromFirst);
  });

  it('ADR 0003 — a single oversized result lands in its own chunk and the in-flight chunk seals first', () => {
    // 100-byte snippet × 800 chars → ~80 KB serialized, well past the 64 KB
    // safety valve. Surrounding results are normal-sized so a sealing event
    // is the ONLY way the oversize result lands cleanly.
    const big: ResultCardContract = {
      title: 'oversize',
      snippet: 'X'.repeat(80_000),
      domain: 'example.com',
      url: 'https://example.com/big',
    };
    const small = (idx: number): ResultCardContract => ({
      title: `small-${idx}`,
      snippet: `s${idx}`,
      domain: 'example.com',
      url: `https://example.com/${idx}`,
    });
    const input: ResultCardContract[] = [small(0), small(1), big, small(2)];
    const chunks = chunk(input);

    // Sequence numbers contiguous (ordinal-boundary policy holds even when
    // the seal fires).
    expect(chunks.map((c) => c.sequence)).toEqual(
      Array.from({ length: chunks.length }, (_, i) => i),
    );

    // The big result MUST land in a chunk by itself.
    const bigChunk = chunks.find((c) => c.results.some((r) => r.title === 'oversize'));
    expect(bigChunk).toBeDefined();
    expect(bigChunk?.results).toHaveLength(1);
    expect(bigChunk?.results[0]?.title).toBe('oversize');

    // The chunk that held the smalls preceding the big one MUST have sealed
    // before the big arrived (it does NOT contain the big).
    const preBigChunk = chunks[(bigChunk?.sequence ?? 0) - 1];
    expect(preBigChunk).toBeDefined();
    expect(preBigChunk?.results.map((r) => r.title)).toEqual(['small-0', 'small-1']);
  });

  it('ADR 0003 — a brand-new chunk MAY hold a single oversized result without seal-first', () => {
    const big: ResultCardContract = {
      title: 'oversize-first',
      snippet: 'Y'.repeat(80_000),
      domain: 'example.com',
      url: 'https://example.com/biggest',
    };
    const chunks = chunk([big]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sequence).toBe(0);
    expect(chunks[0]?.results).toHaveLength(1);
  });

  it('ordinal-boundary policy holds even when the oversize seal fires multiple times', () => {
    // Mix oversized and normal results so multiple seals fire in sequence.
    const mk = (idx: number, isBig: boolean): ResultCardContract => ({
      title: `r-${idx}`,
      snippet: isBig ? 'Z'.repeat(80_000) : `s${idx}`,
      domain: 'example.com',
      url: `https://example.com/${idx}`,
    });
    const input: ResultCardContract[] = [
      mk(0, false),
      mk(1, true),
      mk(2, false),
      mk(3, true),
      mk(4, false),
    ];
    const chunks = chunk(input);
    // Contiguous sequences starting at 0.
    expect(chunks.map((c) => c.sequence)).toEqual(
      Array.from({ length: chunks.length }, (_, i) => i),
    );
    // No result is dropped or reordered.
    expect(chunks.flatMap((c) => c.results.map((r) => r.title))).toEqual([
      'r-0',
      'r-1',
      'r-2',
      'r-3',
      'r-4',
    ]);
  });

  it('byteSize MUST equal JSON.stringify(results).length on every chunk', () => {
    const results = generateResults(450, 99);
    const chunks = chunk(results);
    chunks.forEach((c) => {
      expect(c.byteSize).toBe(JSON.stringify(c.results).length);
    });
  });

  it('property: flatMap(chunks, c => c.results) deep-equals the input list (no loss, no reorder)', () => {
    const results = generateResults(723, 1234);
    const chunks = chunk(results);
    expect(chunks.flatMap((c: Chunk) => c.results)).toEqual(results);
  });

  it('uses the documented defaults — DEFAULT_MAX_CHUNK_SIZE === 100, DEFAULT_OVERSIZE_BYTE_LIMIT === 64 KB', () => {
    expect(DEFAULT_MAX_CHUNK_SIZE).toBe(100);
    expect(DEFAULT_OVERSIZE_BYTE_LIMIT).toBe(64 * 1024);
  });

  it('honors caller-supplied maxChunkSize override', () => {
    const results = generateResults(25, 1);
    const chunks = chunk(results, { maxChunkSize: 10 });
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.results).toHaveLength(10);
    expect(chunks[1]?.results).toHaveLength(10);
    expect(chunks[2]?.results).toHaveLength(5);
  });

  it('rejects a non-positive maxChunkSize', () => {
    expect(() => chunk([], { maxChunkSize: 0 })).toThrow(/maxChunkSize/);
    expect(() => chunk([], { maxChunkSize: -1 })).toThrow(/maxChunkSize/);
  });

  it('rejects a non-positive oversizeByteLimit', () => {
    expect(() => chunk([], { oversizeByteLimit: 0 })).toThrow(/oversizeByteLimit/);
  });
});

describe('STORY-004 fixture wiring', () => {
  it('the committed large-result-set.json matches generateResults(1000, LARGE_RESULT_SET_SEED)', () => {
    expect(largeResultSetFixture).toHaveLength(LARGE_RESULT_SET_COUNT);
    expect(largeResultSetFixture).toEqual(
      generateResults(LARGE_RESULT_SET_COUNT, LARGE_RESULT_SET_SEED),
    );
  });

  it('chunking the committed fixture yields 10 chunks of 100 (FR-017 acceptance criterion)', () => {
    const chunks = chunk(largeResultSetFixture);
    expect(chunks).toHaveLength(10);
    chunks.forEach((c, idx) => {
      expect(c.sequence).toBe(idx);
      expect(c.results).toHaveLength(100);
    });
  });
});

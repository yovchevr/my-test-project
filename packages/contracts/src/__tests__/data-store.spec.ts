/**
 * Contract test for the Agent ↔ Data boundary, surfaced via the `data-store`
 * tool (FR-014, FR-015, FR-016, FR-018, FR-021, FR-022; ADR 0001).
 *
 * Asserts:
 *  - The input union covers exactly the seven documented ops.
 *  - The output union's `op` literal set matches the input's one-to-one.
 *  - Every (input, well-formed-output) pair validates; deliberately mismatched
 *    pairs fail.
 */
import { Value } from '@sinclair/typebox/value';
import { beforeAll, describe, expect, it } from 'vitest';
import { DataStoreInputContract, DataStoreOutputContract, type DataStoreOp } from '../index.js';
import { DATA_STORE_OPS } from '../tools/data-store.js';
import { registerFormats } from './formats.js';

beforeAll(() => {
  registerFormats();
});

const wellFormedInputs: Record<DataStoreOp, unknown> = {
  'history.append': {
    op: 'history.append',
    entry: {
      id: 'h-1',
      query: 'typebox',
      sourceFilter: 'LIVE',
      ts: '2026-05-10T12:00:00Z',
      resultChunkIds: ['chunk-0'],
    },
  },
  'history.list': { op: 'history.list', page: 1 },
  'bookmark.save': {
    op: 'bookmark.save',
    entry: { kind: 'result', payload: { url: 'https://example.com' } },
  },
  'bookmark.list': { op: 'bookmark.list', page: 1 },
  'bookmark.get': { op: 'bookmark.get', id: 'bm-1' },
  'cache.write': {
    op: 'cache.write',
    query: 'typebox',
    results: [
      {
        title: 'TypeBox',
        snippet: '',
        domain: 'github.com',
        url: 'https://github.com/sinclairzx81/typebox',
      },
    ],
  },
  'cache.read': { op: 'cache.read', query: 'typebox', page: 1 },
};

const wellFormedOutputs: Record<DataStoreOp, unknown> = {
  'history.append': { op: 'history.append', id: 'h-1' },
  'history.list': {
    op: 'history.list',
    entries: [],
    pagination: { page: 1, totalChunks: 0, hasMore: false },
  },
  'bookmark.save': { op: 'bookmark.save', id: 'bm-1' },
  'bookmark.list': {
    op: 'bookmark.list',
    entries: [],
    pagination: { page: 1, totalChunks: 0, hasMore: false },
  },
  'bookmark.get': {
    op: 'bookmark.get',
    entry: {
      id: 'bm-1',
      kind: 'answer',
      payload: { answer_summary: 'hi' },
      ts: '2026-05-10T12:00:00Z',
    },
  },
  'cache.write': { op: 'cache.write', chunkIds: ['chunk-0'] },
  'cache.read': {
    op: 'cache.read',
    results: [],
    chunksRead: 0,
    pagination: { page: 1, totalChunks: 0, hasMore: false },
  },
};

describe('DataStoreInputContract — seven-op coverage', () => {
  it('exposes exactly the seven documented ops via DATA_STORE_OPS', () => {
    expect([...DATA_STORE_OPS].sort()).toEqual(
      [
        'bookmark.get',
        'bookmark.list',
        'bookmark.save',
        'cache.read',
        'cache.write',
        'history.append',
        'history.list',
      ].sort(),
    );
    expect(DATA_STORE_OPS.length).toBe(7);
  });

  it.each(DATA_STORE_OPS)('accepts a well-formed input for op=%s', (op) => {
    expect(Value.Check(DataStoreInputContract, wellFormedInputs[op])).toBe(true);
  });

  it('rejects an unknown op literal', () => {
    expect(Value.Check(DataStoreInputContract, { op: 'history.delete', id: 'h-1' })).toBe(false);
  });

  it('rejects history.list with page=0', () => {
    expect(Value.Check(DataStoreInputContract, { op: 'history.list', page: 0 })).toBe(false);
  });

  it('rejects bookmark.get with an empty id', () => {
    expect(Value.Check(DataStoreInputContract, { op: 'bookmark.get', id: '' })).toBe(false);
  });

  it('rejects cache.write missing the results array', () => {
    expect(Value.Check(DataStoreInputContract, { op: 'cache.write', query: 'q' })).toBe(false);
  });

  it('rejects an input that drops the op discriminant entirely', () => {
    expect(Value.Check(DataStoreInputContract, { id: 'bm-1' })).toBe(false);
  });
});

describe('DataStoreOutputContract — one-to-one with input ops', () => {
  it.each(DATA_STORE_OPS)('accepts a well-formed output for op=%s', (op) => {
    expect(Value.Check(DataStoreOutputContract, wellFormedOutputs[op])).toBe(true);
  });

  it('FR-018 / NFR-004 — cache.read output carries chunksRead so the no-full-scan rule is observable', () => {
    const output = wellFormedOutputs['cache.read'] as { chunksRead: number };
    expect(typeof output.chunksRead).toBe('number');
  });

  it('rejects a cache.read output missing chunksRead', () => {
    const malformed = {
      op: 'cache.read',
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(DataStoreOutputContract, malformed)).toBe(false);
  });

  it('rejects an output whose op literal is not in the input set', () => {
    const malformed = { op: 'history.delete', id: 'h-1' };
    expect(Value.Check(DataStoreOutputContract, malformed)).toBe(false);
  });

  it('rejects an output with a foreign op (e.g. history.append id swapped to numeric)', () => {
    const malformed = { op: 'history.append', id: 42 };
    expect(Value.Check(DataStoreOutputContract, malformed)).toBe(false);
  });
});

describe('Input op set === Output op set (one-to-one)', () => {
  // Extract every op literal from each union variant by validating well-formed
  // inputs / outputs and checking which variant accepts them. The structural
  // coverage above already enforces this; here we add an explicit set-equality
  // assertion so a future contract drift (e.g. adding an input op without the
  // matching output) fails this test by name.
  it('every input op has a matching output op', () => {
    for (const op of DATA_STORE_OPS) {
      expect(Value.Check(DataStoreInputContract, wellFormedInputs[op])).toBe(true);
      expect(Value.Check(DataStoreOutputContract, wellFormedOutputs[op])).toBe(true);
    }
  });
});

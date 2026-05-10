/**
 * Contract test for the API ↔ Agent boundary (FR-021).
 *
 * Asserts the discriminated `AgentSearchResponseContract` on `ok: boolean`,
 * the closed `SourceFilterEnum` of LIVE/HISTORY/BOOKMARK (per
 * `.design/domain/glossary.md`), and the four-variant `AgentErrorContract`
 * `kind` field.
 */
import { Value } from '@sinclair/typebox/value';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AgentErrorContract,
  AgentSearchRequestContract,
  AgentSearchResponseContract,
  SourceFilterEnum,
} from '../index.js';
import { registerFormats } from './formats.js';

beforeAll(() => {
  registerFormats();
});

describe('SourceFilterEnum — closed enum (glossary)', () => {
  it.each(['LIVE', 'HISTORY', 'BOOKMARK'])('accepts %s', (value) => {
    expect(Value.Check(SourceFilterEnum, value)).toBe(true);
  });

  it('rejects STARRED (closed-enum guard)', () => {
    expect(Value.Check(SourceFilterEnum, 'STARRED')).toBe(false);
  });

  it('rejects lowercase live (case-sensitive enum)', () => {
    expect(Value.Check(SourceFilterEnum, 'live')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(Value.Check(SourceFilterEnum, '')).toBe(false);
  });
});

describe('AgentSearchRequestContract', () => {
  const wellFormed = {
    query: 'typebox json schema',
    sourceFilter: 'LIVE',
    page: 1,
    budgetMs: 10_000,
  };

  it('accepts a well-formed agent request', () => {
    expect(Value.Check(AgentSearchRequestContract, wellFormed)).toBe(true);
  });

  it('rejects budgetMs above the documented 60s ceiling', () => {
    expect(Value.Check(AgentSearchRequestContract, { ...wellFormed, budgetMs: 60_001 })).toBe(
      false,
    );
  });

  it('rejects budgetMs of 0 (must be ≥ 1ms)', () => {
    expect(Value.Check(AgentSearchRequestContract, { ...wellFormed, budgetMs: 0 })).toBe(false);
  });

  it('rejects an unknown sourceFilter literal', () => {
    expect(Value.Check(AgentSearchRequestContract, { ...wellFormed, sourceFilter: 'ALL' })).toBe(
      false,
    );
  });
});

describe('AgentSearchResponseContract — Result<T,E> on ok:boolean (conventions)', () => {
  it('accepts the success variant', () => {
    const success = {
      ok: true,
      value: {
        answer_summary: 'ok',
        references: [],
        results: [],
        pagination: { page: 1, totalChunks: 0, hasMore: false },
      },
    };
    expect(Value.Check(AgentSearchResponseContract, success)).toBe(true);
  });

  it('accepts the error variant for each documented kind', () => {
    for (const kind of ['validation', 'terminal', 'transient', 'cancelled'] as const) {
      const errorVariant = { ok: false, error: { kind, message: 'oops' } };
      expect(Value.Check(AgentSearchResponseContract, errorVariant)).toBe(true);
    }
  });

  it('rejects ok: "true" (string discriminant — must be a boolean literal)', () => {
    const malformed = {
      ok: 'true',
      value: {
        answer_summary: 'ok',
        references: [],
        results: [],
        pagination: { page: 1, totalChunks: 0, hasMore: false },
      },
    };
    expect(Value.Check(AgentSearchResponseContract, malformed)).toBe(false);
  });

  it('rejects a success variant whose value lacks answer_summary', () => {
    const malformed = {
      ok: true,
      value: {
        references: [],
        results: [],
        pagination: { page: 1, totalChunks: 0, hasMore: false },
      },
    };
    expect(Value.Check(AgentSearchResponseContract, malformed)).toBe(false);
  });

  it('rejects an error variant whose kind is not in the documented set', () => {
    const malformed = { ok: false, error: { kind: 'unknown', message: 'oops' } };
    expect(Value.Check(AgentSearchResponseContract, malformed)).toBe(false);
  });
});

describe('AgentErrorContract', () => {
  it('accepts an error with optional details', () => {
    const errorWithDetails = {
      kind: 'validation',
      message: 'bad input',
      details: { field: 'query' },
    };
    expect(Value.Check(AgentErrorContract, errorWithDetails)).toBe(true);
  });

  it('rejects an empty message', () => {
    expect(Value.Check(AgentErrorContract, { kind: 'terminal', message: '' })).toBe(false);
  });
});

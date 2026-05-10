/**
 * Contract test for the UI ↔ API boundary (FR-010, FR-021).
 *
 * Per `.design/technology/testing.md`, this spec exercises the boundary from
 * BOTH directions: a well-formed payload MUST validate; a malformed payload
 * MUST be rejected by the schema's invariants. The frozen example fixture
 * is the FR-025-deliverable example payload referenced by STORY-020.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from '@sinclair/typebox/value';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BookmarkListResponseContract,
  BookmarkSaveRequestContract,
  BookmarkSaveResponseContract,
  HistoryListResponseContract,
  SearchRequestContract,
  UiApiAnswerContract,
} from '../index.js';
import { registerFormats } from './formats.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', '__fixtures__', 'example-ui-api-answer.json');

beforeAll(() => {
  registerFormats();
});

describe('FR-010 / FR-021 UiApiAnswerContract — frozen example payload', () => {
  const example = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown;

  it('accepts the FR-025 deliverable example payload', () => {
    expect(Value.Check(UiApiAnswerContract, example)).toBe(true);
  });

  it('FR-010 — exposes answer_summary (min 1) and references[]', () => {
    const value = example as { answer_summary: string; references: unknown[] };
    expect(value.answer_summary.length).toBeGreaterThan(0);
    expect(Array.isArray(value.references)).toBe(true);
  });

  it('FR-009 — every reference has non-empty title, url, context', () => {
    const refs = (example as { references: { title: string; url: string; context: string }[] })
      .references;
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.title.length).toBeGreaterThan(0);
      expect(ref.url.length).toBeGreaterThan(0);
      expect(ref.context.length).toBeGreaterThan(0);
    }
  });
});

describe('FR-010 UiApiAnswerContract — adversarial', () => {
  it('rejects an empty answer_summary', () => {
    const malformed = {
      answer_summary: '',
      references: [],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(UiApiAnswerContract, malformed)).toBe(false);
  });

  it('rejects a missing answer_summary field', () => {
    const malformed = {
      references: [],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(UiApiAnswerContract, malformed)).toBe(false);
  });

  it('FR-009 — rejects a reference with an empty title', () => {
    const malformed = {
      answer_summary: 'ok',
      references: [{ id: 'r1', title: '', url: 'https://example.com', context: 'why' }],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(UiApiAnswerContract, malformed)).toBe(false);
  });

  it('FR-009 — rejects a reference with an empty context', () => {
    const malformed = {
      answer_summary: 'ok',
      references: [{ id: 'r1', title: 't', url: 'https://example.com', context: '' }],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(UiApiAnswerContract, malformed)).toBe(false);
  });

  it('FR-009 — rejects a reference whose url is not uri-formatted', () => {
    const malformed = {
      answer_summary: 'ok',
      references: [{ id: 'r1', title: 't', url: 'not a url', context: 'why' }],
      results: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(UiApiAnswerContract, malformed)).toBe(false);
  });
});

describe('FR-021 SearchRequestContract', () => {
  it('accepts a well-formed search request without clientRequestId', () => {
    const wellFormed = { query: 'typebox', sourceFilter: 'LIVE', page: 1 };
    expect(Value.Check(SearchRequestContract, wellFormed)).toBe(true);
  });

  it('accepts a request with a uuid clientRequestId', () => {
    const wellFormed = {
      query: 'typebox',
      sourceFilter: 'HISTORY',
      page: 1,
      clientRequestId: '00000000-0000-0000-0000-000000000000',
    };
    expect(Value.Check(SearchRequestContract, wellFormed)).toBe(true);
  });

  it('rejects an empty query', () => {
    const malformed = { query: '', sourceFilter: 'LIVE', page: 1 };
    expect(Value.Check(SearchRequestContract, malformed)).toBe(false);
  });

  it('rejects an unknown source filter (closed-enum guard, glossary)', () => {
    const malformed = { query: 'q', sourceFilter: 'STARRED', page: 1 };
    expect(Value.Check(SearchRequestContract, malformed)).toBe(false);
  });

  it('rejects page = 0', () => {
    const malformed = { query: 'q', sourceFilter: 'LIVE', page: 0 };
    expect(Value.Check(SearchRequestContract, malformed)).toBe(false);
  });

  it('rejects a non-uuid clientRequestId', () => {
    const malformed = {
      query: 'q',
      sourceFilter: 'LIVE',
      page: 1,
      clientRequestId: 'not-a-uuid',
    };
    expect(Value.Check(SearchRequestContract, malformed)).toBe(false);
  });
});

describe('FR-015 BookmarkSaveRequestContract / BookmarkSaveResponseContract', () => {
  it('accepts a save request with kind=result', () => {
    const wellFormed = {
      kind: 'result',
      payload: { title: 't', url: 'https://example.com', snippet: '', domain: 'example.com' },
    };
    expect(Value.Check(BookmarkSaveRequestContract, wellFormed)).toBe(true);
  });

  it('rejects a save request with an unknown kind', () => {
    const malformed = { kind: 'note', payload: {} };
    expect(Value.Check(BookmarkSaveRequestContract, malformed)).toBe(false);
  });

  it('accepts a save response with a non-empty id', () => {
    expect(Value.Check(BookmarkSaveResponseContract, { id: 'bm-1' })).toBe(true);
  });

  it('rejects a save response with an empty id', () => {
    expect(Value.Check(BookmarkSaveResponseContract, { id: '' })).toBe(false);
  });
});

describe('FR-014 / FR-015 list responses carry pagination', () => {
  it('accepts an empty bookmark list response', () => {
    const wellFormed = {
      entries: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(BookmarkListResponseContract, wellFormed)).toBe(true);
  });

  it('accepts an empty history list response', () => {
    const wellFormed = {
      entries: [],
      pagination: { page: 1, totalChunks: 0, hasMore: false },
    };
    expect(Value.Check(HistoryListResponseContract, wellFormed)).toBe(true);
  });

  it('rejects a history response missing the pagination block', () => {
    const malformed = { entries: [] };
    expect(Value.Check(HistoryListResponseContract, malformed)).toBe(false);
  });
});

/**
 * FR-009 references contract tests — STORY-012.
 *
 * Per `.design/technology/testing.md` FR coverage matrix:
 *   "FR-009 — Vitest unit — services/agent/src/references.test.ts —
 *    Every reference entry has non-empty `title`, `url`, `context`; no
 *    duplicate URLs; URLs are clickable strings."
 *
 * The tests here exercise the synthesis layer's contract guarantees about
 * the `references` array — every entry round-tripped through `validateSynthesis`
 * has the three required fields populated and there are no duplicate URLs.
 *
 * The synthesizer is the producer; this file is the FR-009-cited test surface
 * the lint audit (`tools/lint/fr-nfr-test-presence.test.ts`) greps for.
 */
import { describe, expect, it } from 'vitest';
import type { ResultCardContract } from '@neo-search/contracts';
import { createSynthesizer, validateSynthesis, type AnthropicLike } from './synthesis/index.js';

const inputResults: ResultCardContract[] = [
  {
    title: 'First',
    snippet: 'first snippet',
    domain: 'example.com',
    url: 'https://example.com/1',
  },
  {
    title: 'Second',
    snippet: 'second snippet',
    domain: 'example.org',
    url: 'https://example.org/2',
  },
];

const buildFakeAnthropic = (body: unknown): AnthropicLike => ({
  messages: {
    create: async () => ({
      content: [{ type: 'text', text: JSON.stringify(body) }],
    }),
  },
});

describe('FR-009 — every reference entry has non-empty title, url, and context', () => {
  it('FR-009: synthesis success path produces references with all three fields populated', async () => {
    const synth = createSynthesizer({
      anthropic: buildFakeAnthropic({
        answer_summary: 'Topic A [1] and topic B [2].',
        references: [
          {
            id: 'r-1',
            title: 'First',
            url: 'https://example.com/1',
            context: 'first snippet',
          },
          {
            id: 'r-2',
            title: 'Second',
            url: 'https://example.org/2',
            context: 'second snippet',
          },
        ],
      }),
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.value.references.length).toBeGreaterThan(0);
    for (const ref of result.value.references) {
      expect(ref.title.trim().length).toBeGreaterThan(0);
      expect(ref.url.trim().length).toBeGreaterThan(0);
      expect(ref.context.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('FR-009 — no duplicate URLs in references', () => {
  it('FR-009: validator rejects two references that share a URL', () => {
    const result = validateSynthesis(
      {
        answer_summary: 'Both cites [1] [2].',
        references: [
          {
            id: 'r-1',
            title: 'First',
            url: 'https://example.com/1',
            context: 'a',
          },
          {
            id: 'r-2',
            title: 'First again',
            url: 'https://example.com/1',
            context: 'b',
          },
        ],
      },
      inputResults,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'duplicate-url')).toBe(true);
  });
});

describe('FR-009 — every reference URL is a clickable string (uri format on the contract)', () => {
  // The `ReferenceEntryContract` schema (in @neo-search/contracts) marks `url`
  // as `format: 'uri'` and `minLength: 1`. Here we assert the synthesis
  // module preserves that posture: the validator rejects empty URLs.
  it('FR-009: validator rejects an empty url', () => {
    const result = validateSynthesis(
      {
        answer_summary: 'A claim [1].',
        references: [
          {
            id: 'r-1',
            title: 'First',
            url: '',
            context: 'a',
          },
        ],
      },
      inputResults,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some((f) => f.kind === 'reference-missing-field' && f.field === 'url'),
    ).toBe(true);
  });
});

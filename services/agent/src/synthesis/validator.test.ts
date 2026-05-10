/**
 * Unit tests for `validateSynthesis` — STORY-012.
 *
 * These tests cover the four structural rules in isolation per the story
 * scope:
 *   - duplicate URL (I-4)
 *   - fabricated URL (I-5)
 *   - missing citation (I-2 / FR-008 — the "material claim" heuristic)
 *   - empty summary (I-1 / FR-007)
 *
 * Plus the supporting rules:
 *   - reference-missing-field (I-3 / FR-009)
 *   - citation-out-of-range (I-2 / FR-008)
 *
 * The validator is a pure function — no SDK, no env vars, no clock.
 */
import { describe, expect, it } from 'vitest';
import type { ResultCardContract } from '@neo-search/contracts';
import { validateSynthesis } from './validator.js';
import type { SynthesisOutput } from './contract.js';

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

const validOutput: SynthesisOutput = {
  answer_summary: 'The first source covers topic A [1]. The second source covers topic B [2].',
  references: [
    {
      id: 'ref-1',
      title: 'First',
      url: 'https://example.com/1',
      context: 'first snippet',
    },
    {
      id: 'ref-2',
      title: 'Second',
      url: 'https://example.org/2',
      context: 'second snippet',
    },
  ],
};

describe('FR-007 / I-1 — empty summary rule', () => {
  it('FR-007: rejects an empty answer_summary as `empty-summary`', () => {
    const out: SynthesisOutput = { ...validOutput, answer_summary: '' };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'empty-summary')).toBe(true);
  });

  it('FR-007: rejects a whitespace-only answer_summary as `empty-summary`', () => {
    const out: SynthesisOutput = { ...validOutput, answer_summary: '   \n\t  ' };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'empty-summary')).toBe(true);
  });
});

describe('FR-009 / I-3 — reference-missing-field rule', () => {
  it('FR-009: rejects a reference whose `title` is empty', () => {
    const out: SynthesisOutput = {
      ...validOutput,
      references: [{ ...validOutput.references[0]!, title: '' }, validOutput.references[1]!],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some(
        (f) => f.kind === 'reference-missing-field' && f.field === 'title' && f.index === 0,
      ),
    ).toBe(true);
  });

  it('FR-009: rejects a reference whose `url` is empty', () => {
    const out: SynthesisOutput = {
      ...validOutput,
      references: [{ ...validOutput.references[0]!, url: '' }, validOutput.references[1]!],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some((f) => f.kind === 'reference-missing-field' && f.field === 'url'),
    ).toBe(true);
  });

  it('FR-009: rejects a reference whose `context` is empty', () => {
    const out: SynthesisOutput = {
      ...validOutput,
      references: [{ ...validOutput.references[0]!, context: '' }, validOutput.references[1]!],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some(
        (f) => f.kind === 'reference-missing-field' && f.field === 'context',
      ),
    ).toBe(true);
  });

  it('FR-009: rejects a reference whose `context` is whitespace-only', () => {
    const out: SynthesisOutput = {
      ...validOutput,
      references: [{ ...validOutput.references[0]!, context: '   ' }, validOutput.references[1]!],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some(
        (f) => f.kind === 'reference-missing-field' && f.field === 'context',
      ),
    ).toBe(true);
  });
});

describe('I-4 — duplicate-url rule', () => {
  it('I-4: rejects two references sharing the same URL', () => {
    const out: SynthesisOutput = {
      answer_summary: 'Both refs say the same thing [1] [2].',
      references: [
        {
          id: 'r-1',
          title: 'First',
          url: 'https://example.com/1',
          context: 'a',
        },
        {
          id: 'r-2',
          title: 'Also First',
          url: 'https://example.com/1',
          context: 'b',
        },
      ],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some(
        (f) => f.kind === 'duplicate-url' && f.url === 'https://example.com/1',
      ),
    ).toBe(true);
  });
});

describe('I-5 — fabricated-url rule', () => {
  it('I-5: rejects a reference URL that does not appear in input results', () => {
    const out: SynthesisOutput = {
      answer_summary: 'A claim from a fabricated source [1].',
      references: [
        {
          id: 'r-1',
          title: 'Fabricated',
          url: 'https://made-up.example/x',
          context: 'fake context',
        },
      ],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some(
        (f) => f.kind === 'fabricated-url' && f.url === 'https://made-up.example/x',
      ),
    ).toBe(true);
  });

  it('I-5: a URL that differs by trailing slash is treated as fabricated (no normalization)', () => {
    // The validator does NOT normalize URLs — that would mask real fabrications.
    const out: SynthesisOutput = {
      answer_summary: 'A near-miss URL [1].',
      references: [
        {
          id: 'r-1',
          title: 'Near miss',
          url: 'https://example.com/1/',
          context: 'context',
        },
      ],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'fabricated-url')).toBe(true);
  });
});

describe('FR-008 / I-2 — missing-citation rule (the "material claim" heuristic)', () => {
  it('FR-008: rejects a paragraph with no citation marker', () => {
    const out: SynthesisOutput = {
      answer_summary: 'This paragraph has no citation marker at all.',
      references: validOutput.references,
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'missing-citation')).toBe(true);
  });

  it('FR-008: rejects a multi-paragraph summary where one paragraph lacks a citation', () => {
    const out: SynthesisOutput = {
      answer_summary: 'First paragraph has a citation [1].\n\nSecond paragraph does not.',
      references: validOutput.references,
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'missing-citation')).toBe(true);
  });

  it('FR-008: rejects a bullet-list summary where one bullet lacks a citation', () => {
    const out: SynthesisOutput = {
      answer_summary: '- bullet one [1]\n- bullet two without citation\n- bullet three [2]',
      references: validOutput.references,
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'missing-citation')).toBe(true);
  });

  it('FR-008: accepts a summary where every paragraph has at least one [N] marker', () => {
    const result = validateSynthesis(validOutput, inputResults);
    expect(result.ok).toBe(true);
  });

  it('I-2: rejects a citation marker that points past the end of the references list', () => {
    const out: SynthesisOutput = {
      ...validOutput,
      answer_summary: 'A claim with an out-of-range marker [9].',
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(
      result.error.failures.some((f) => f.kind === 'citation-out-of-range' && f.marker === 9),
    ).toBe(true);
  });

  it('I-2: rejects a [0] marker (1-based indexing per the design)', () => {
    const out: SynthesisOutput = {
      ...validOutput,
      answer_summary: 'A claim with a zero marker [0].',
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.failures.some((f) => f.kind === 'citation-out-of-range')).toBe(true);
  });
});

describe('Validator success path', () => {
  it('accepts a single-paragraph summary with one citation and a matching reference', () => {
    const out: SynthesisOutput = {
      answer_summary: 'A single paragraph with one citation [1].',
      references: [validOutput.references[0]!],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success: ${JSON.stringify(result.error)}`);
    expect(result.value).toEqual(out);
  });

  it('accepts a paragraph with multiple citation markers', () => {
    const out: SynthesisOutput = {
      answer_summary: 'A claim drawn from both sources [1] [2] working together.',
      references: validOutput.references,
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(true);
  });

  it('skips structural-only lines (markdown headers / code fences) when applying the citation rule', () => {
    const out: SynthesisOutput = {
      answer_summary: '#\n\nA real claim with a citation [1].',
      references: [validOutput.references[0]!],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(true);
  });

  it('reports multiple distinct failures when several rules fire at once', () => {
    const out: SynthesisOutput = {
      answer_summary: '',
      references: [
        {
          id: 'r-1',
          title: '',
          url: 'https://made-up.example/x',
          context: '',
        },
      ],
    };
    const result = validateSynthesis(out, inputResults);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    const kinds = new Set(result.error.failures.map((f) => f.kind));
    expect(kinds.has('empty-summary')).toBe(true);
    expect(kinds.has('reference-missing-field')).toBe(true);
    expect(kinds.has('fabricated-url')).toBe(true);
  });
});

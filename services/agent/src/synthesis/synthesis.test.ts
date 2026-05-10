/**
 * Unit tests for `createSynthesizer` — STORY-012.
 *
 * These tests cover the eight acceptance criteria pinned in the story scope.
 * They use a fake `anthropic` client returning canned responses so the
 * validator's behavior is the SUT, not the LLM. The smoke E2E that exercises
 * the real model lives in STORY-019.
 *
 * Per `.design/technology/testing.md` "Forbidden test patterns":
 *   - "Tests MUST NOT hit the real Tavily API in the unit / integration tier."
 *     The same posture applies to the Anthropic API; only the smoke job
 *     (STORY-019, gated by ANTHROPIC_API_KEY) hits the live model.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ResultCardContract } from '@neo-search/contracts';
import {
  createSynthesizer,
  type AnthropicLike,
  type AnthropicMessageCreateParams,
  type AnthropicMessageResponse,
  type AnthropicRequestOptions,
} from './index.js';

const inputResults: ResultCardContract[] = [
  {
    title: 'First Source',
    snippet: 'first snippet',
    domain: 'example.com',
    url: 'https://example.com/1',
  },
  {
    title: 'Second Source',
    snippet: 'second snippet',
    domain: 'example.org',
    url: 'https://example.org/2',
  },
];

/**
 * Build a fake Anthropic client whose `messages.create` returns a canned
 * response. The handler MAY be a static response or a function that varies
 * per call — the latter is used for the retry-once tests.
 */
const buildFakeAnthropic = (
  handler:
    | AnthropicMessageResponse
    | string
    | ((
        params: AnthropicMessageCreateParams,
        options: AnthropicRequestOptions | undefined,
        callIndex: number,
      ) => Promise<AnthropicMessageResponse> | AnthropicMessageResponse),
): {
  readonly client: AnthropicLike;
  readonly calls: ReadonlyArray<{
    params: AnthropicMessageCreateParams;
    options: AnthropicRequestOptions | undefined;
  }>;
} => {
  const calls: {
    params: AnthropicMessageCreateParams;
    options: AnthropicRequestOptions | undefined;
  }[] = [];
  const client: AnthropicLike = {
    messages: {
      create: async (params, options) => {
        calls.push({ params, options });
        if (typeof handler === 'function') {
          return handler(params, options, calls.length - 1);
        }
        if (typeof handler === 'string') {
          return { content: [{ type: 'text', text: handler }] };
        }
        return handler;
      },
    },
  };
  return {
    client,
    get calls() {
      return calls;
    },
  };
};

const respondWithJson = (body: unknown): AnthropicMessageResponse => ({
  content: [{ type: 'text', text: JSON.stringify(body) }],
});

const validBody = {
  answer_summary: 'The first source covers topic A [1]. The second source covers topic B [2].',
  references: [
    {
      id: 'ref-1',
      title: 'First Source',
      url: 'https://example.com/1',
      context: 'first snippet',
    },
    {
      id: 'ref-2',
      title: 'Second Source',
      url: 'https://example.org/2',
      context: 'second snippet',
    },
  ],
};

const liveSignal = (): AbortSignal => new AbortController().signal;

// =============================================================================
// Acceptance criteria — see STORY-012 "Acceptance criteria"
// =============================================================================

describe('FR-007 / FR-008 — successful synthesis produces a non-empty summary with [N] markers per claim', () => {
  it('FR-007: a well-formed canned response yields a non-empty answer_summary', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('what is topic A?', inputResults, liveSignal());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success: ${JSON.stringify(result.error)}`);
    expect(result.value.answer_summary.length).toBeGreaterThan(0);
  });

  it('FR-008: every paragraph contains at least one [N] marker', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('what is topic A?', inputResults, liveSignal());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    for (const line of result.value.answer_summary.split(/\r?\n/).filter((l) => l.trim())) {
      expect(line).toMatch(/\[\d+\]/);
    }
  });
});

describe('FR-009 / I-3 — every reference has non-empty title, url, and context', () => {
  it('FR-009: success path produces references with all three fields populated', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    for (const ref of result.value.references) {
      expect(ref.title.length).toBeGreaterThan(0);
      expect(ref.url.length).toBeGreaterThan(0);
      expect(ref.context.length).toBeGreaterThan(0);
    }
  });
});

describe('I-4 — duplicate URL → validator rejects; retry; second failure surfaces terminal', () => {
  it('a canned response with two references sharing a URL is rejected; one retry; persistent duplicate → terminal', async () => {
    const duplicateBody = {
      answer_summary: 'Dual cite [1] [2].',
      references: [
        {
          id: 'r-1',
          title: 'A',
          url: 'https://example.com/1',
          context: 'a',
        },
        {
          id: 'r-2',
          title: 'A again',
          url: 'https://example.com/1', // duplicate URL → I-4 violation
          context: 'b',
        },
      ],
    };
    const fake = buildFakeAnthropic(respondWithJson(duplicateBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('synthesis-validation-failed');
    // Verify the retry actually happened (two calls, not one).
    expect(fake.calls).toHaveLength(2);
  });
});

describe('I-5 — fabricated URL → validator rejects; retry; second failure surfaces terminal', () => {
  it('a canned response containing a URL not in input results is rejected; persistent fabrication → terminal', async () => {
    const fabricatedBody = {
      answer_summary: 'Made-up cite [1].',
      references: [
        {
          id: 'r-1',
          title: 'Made up',
          url: 'https://made-up.example/x',
          context: 'fake',
        },
      ],
    };
    const fake = buildFakeAnthropic(respondWithJson(fabricatedBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('synthesis-validation-failed');
    expect(fake.calls).toHaveLength(2);
  });
});

describe('FR-008 / "material claim" heuristic — paragraph without citation → retry; persistent failure → terminal', () => {
  it('a canned response with an uncited paragraph is rejected; persistent failure → terminal', async () => {
    const uncitedBody = {
      answer_summary: 'This paragraph has no citation at all.',
      references: [
        {
          id: 'r-1',
          title: 'First Source',
          url: 'https://example.com/1',
          context: 'first snippet',
        },
      ],
    };
    const fake = buildFakeAnthropic(respondWithJson(uncitedBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('synthesis-validation-failed');
    expect(fake.calls).toHaveLength(2);
  });
});

describe('FR-007 — empty answer_summary → retry; persistent empty → terminal', () => {
  it('a canned response with empty answer_summary is rejected as terminal after retry', async () => {
    const emptyBody = {
      answer_summary: '',
      references: [
        {
          id: 'r-1',
          title: 'First',
          url: 'https://example.com/1',
          context: 'snippet',
        },
      ],
    };
    const fake = buildFakeAnthropic(respondWithJson(emptyBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('synthesis-validation-failed');
    expect(fake.calls).toHaveLength(2);
  });
});

describe('Retry-once recovery — first attempt fails validation, second attempt succeeds', () => {
  it('a transient validation failure that recovers on retry yields a successful result', async () => {
    const fake = buildFakeAnthropic((_params, _options, callIndex) => {
      if (callIndex === 0) {
        return respondWithJson({
          answer_summary: 'No citations here.',
          references: [
            {
              id: 'r-1',
              title: 'First Source',
              url: 'https://example.com/1',
              context: 'first snippet',
            },
          ],
        });
      }
      return respondWithJson(validBody);
    });
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success: ${JSON.stringify(result.error)}`);
    expect(result.value.answer_summary).toBe(validBody.answer_summary);
    // Both attempts ran.
    expect(fake.calls).toHaveLength(2);
    // The retry's system prompt MUST cite the first attempt's failures.
    expect(fake.calls[1]?.params.system).toMatch(/previous attempt failed/i);
  });

  it('the retry prompt names the missing-citation failure on the second attempt', async () => {
    const fake = buildFakeAnthropic((_params, _options, callIndex) => {
      if (callIndex === 0) {
        return respondWithJson({
          answer_summary: 'Uncited claim here.',
          references: [
            {
              id: 'r-1',
              title: 'First Source',
              url: 'https://example.com/1',
              context: 'snippet',
            },
          ],
        });
      }
      return respondWithJson(validBody);
    });
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(true);
    expect(fake.calls[1]?.params.system).toMatch(/citation marker|missing/i);
  });
});

describe('AbortSignal — aborted mid-call returns without throwing', () => {
  it('returns { ok: false, error: { kind: "cancelled" } } when the signal is already aborted on entry', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const controller = new AbortController();
    controller.abort(new Error('user-cancelled'));

    const result = await synth('q', inputResults, controller.signal);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('cancelled');
    // The model MUST NOT be called when the signal is already aborted.
    expect(fake.calls).toHaveLength(0);
  });

  it('returns cancelled when the SDK throws an AbortError mid-call (no throw across the boundary)', async () => {
    const fake = buildFakeAnthropic(() => {
      const err = new Error('Request was aborted by the user');
      err.name = 'APIUserAbortError';
      throw err;
    });
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const controller = new AbortController();
    // Don't pre-abort; the SDK throws on its own.
    const result = await synth('q', inputResults, controller.signal);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('cancelled');
  });

  it('forwards the AbortSignal to anthropic.messages.create on every call', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });
    const controller = new AbortController();
    await synth('q', inputResults, controller.signal);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.options?.signal).toBe(controller.signal);
  });
});

describe('FR-005 empty path — empty input results yield a non-empty summary plus empty references', () => {
  it('empty input results MUST NOT throw and MUST short-circuit without calling the model', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', [], liveSignal());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    // The summary is non-empty (the FR-005 empty-state messaging) and the
    // references array is empty (no candidate sources).
    expect(result.value.answer_summary.length).toBeGreaterThan(0);
    expect(result.value.references).toEqual([]);
    // The model MUST NOT have been invoked — empty path is deterministic.
    expect(fake.calls).toHaveLength(0);
  });
});

// =============================================================================
// Boundary discipline (per the story scope: "MUST NOT import @neo-search/tools
// or any data-layer module")
// =============================================================================

describe('Boundary discipline — synthesis module imports neither @neo-search/tools nor any data-layer package', () => {
  it('the synthesis directory contains no `@neo-search/tools` or `@neo-search/data-*` import', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    // Match real `import ... from '@neo-search/tools'` (or `data-*`) shapes.
    // Comments / docstrings that mention the package name in prose are NOT
    // imports and MUST NOT trip the scan.
    const offendingImport =
      /(?:^|[\n;])\s*import[^;]*from\s+['"]@neo-search\/(?:tools(?:-[a-z-]+)?|data-[a-z-]+)['"]/m;
    const offenders: string[] = [];
    const stack = [here];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory()) {
          stack.push(abs);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
        const src = readFileSync(abs, 'utf8');
        if (offendingImport.test(src)) {
          offenders.push(abs);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

// =============================================================================
// Resilience — non-JSON / malformed responses
// =============================================================================

describe('Robustness — malformed model output is treated as a validation failure', () => {
  it('a non-JSON text body fails validation; on persistent failure → terminal', async () => {
    const fake = buildFakeAnthropic({
      content: [{ type: 'text', text: 'this is not JSON, just prose' }],
    });
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });

    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(fake.calls).toHaveLength(2);
  });

  it('a JSON body wrapped in a markdown code fence parses successfully', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validBody)}\n\`\`\``;
    const fake = buildFakeAnthropic(fenced);
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });
    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(true);
  });

  it('an SDK transport error surfaces as terminal with the cause preserved', async () => {
    const fake = buildFakeAnthropic(() => {
      throw new Error('connection refused');
    });
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });
    const result = await synth('q', inputResults, liveSignal());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toMatch(/transport-error/);
  });
});

// =============================================================================
// Configuration — env-driven model + prompt override
// =============================================================================

describe('Configuration — model and prompt are env-driven', () => {
  it('uses the model name passed via options', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-3-5-sonnet-20241022',
    });
    await synth('q', inputResults, liveSignal());
    expect(fake.calls[0]?.params.model).toBe('claude-3-5-sonnet-20241022');
  });

  it('uses ANTHROPIC_MODEL from env when no `model` option is passed', async () => {
    const original = process.env['ANTHROPIC_MODEL'];
    process.env['ANTHROPIC_MODEL'] = 'claude-from-env';
    try {
      const fake = buildFakeAnthropic(respondWithJson(validBody));
      const synth = createSynthesizer({ anthropic: fake.client });
      await synth('q', inputResults, liveSignal());
      expect(fake.calls[0]?.params.model).toBe('claude-from-env');
    } finally {
      if (original === undefined) {
        delete process.env['ANTHROPIC_MODEL'];
      } else {
        process.env['ANTHROPIC_MODEL'] = original;
      }
    }
  });

  it('returns terminal when neither options.model nor ANTHROPIC_MODEL is set (and results are non-empty)', async () => {
    const original = process.env['ANTHROPIC_MODEL'];
    delete process.env['ANTHROPIC_MODEL'];
    try {
      const fake = buildFakeAnthropic(respondWithJson(validBody));
      const synth = createSynthesizer({ anthropic: fake.client });
      const result = await synth('q', inputResults, liveSignal());
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected failure');
      expect(result.error.kind).toBe('terminal');
      expect(result.error.message).toMatch(/ANTHROPIC_MODEL/);
      expect(fake.calls).toHaveLength(0);
    } finally {
      if (original !== undefined) process.env['ANTHROPIC_MODEL'] = original;
    }
  });

  it('uses the env-driven prompt override (the `prompt` option wins over the default)', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const customPrompt = 'CUSTOM SYNTHESIS PROMPT FROM ENV';
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
      prompt: customPrompt,
    });
    await synth('q', inputResults, liveSignal());
    expect(fake.calls[0]?.params.system).toBe(customPrompt);
  });
});

// =============================================================================
// FR-013 — synthesis returns the same output shape regardless of source
// =============================================================================

describe('FR-013 — synthesis is invoked uniformly for LIVE / HISTORY / BOOKMARK source filters', () => {
  // The agent loop (STORY-011) invokes synthesize() with the same signature
  // for every source filter. This test asserts the contract: same shape in,
  // same shape out, regardless of where `results` came from.
  it('FR-013: produces a valid SynthesisOutput when called with results that look LIVE-shaped', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({ anthropic: fake.client, model: 'claude-fake' });
    const result = await synth('live-query', inputResults, liveSignal());
    expect(result.ok).toBe(true);
  });

  it('FR-013: produces a valid SynthesisOutput when called with HISTORY-derived results', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({ anthropic: fake.client, model: 'claude-fake' });
    const historyResults: ResultCardContract[] = [
      ...inputResults, // history reads return cached LIVE rows; same shape
    ];
    const result = await synth('history-query', historyResults, liveSignal());
    expect(result.ok).toBe(true);
  });

  it('FR-013: produces a valid SynthesisOutput when called with BOOKMARK-derived results', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({ anthropic: fake.client, model: 'claude-fake' });
    const bookmarkResults: ResultCardContract[] = [
      ...inputResults, // bookmark.kind === 'result' payloads are ResultCard-shaped
    ];
    const result = await synth('bookmark-query', bookmarkResults, liveSignal());
    expect(result.ok).toBe(true);
  });
});

// =============================================================================
// Determinism — model and prompt seam allow swapping without code change
// =============================================================================

describe('Pinning — synthesis call passes the canonical fields to the SDK', () => {
  it('passes `system`, `messages` (one user message with JSON payload), and `max_tokens`', async () => {
    const fake = buildFakeAnthropic(respondWithJson(validBody));
    const synth = createSynthesizer({
      anthropic: fake.client,
      model: 'claude-fake',
    });
    await synth('what is topic A?', inputResults, liveSignal());
    const call = fake.calls[0]?.params;
    expect(call?.system).toMatch(/synthesize/i);
    expect(call?.messages).toHaveLength(1);
    expect(call?.messages[0]?.role).toBe('user');
    expect(typeof call?.messages[0]?.content).toBe('string');
    // The user content carries the query and the structured results JSON.
    expect(call?.messages[0]?.content).toMatch(/what is topic A\?/);
    expect(call?.messages[0]?.content).toMatch(/example\.com\/1/);
    expect(typeof call?.max_tokens).toBe('number');
  });

  it('does NOT call the SDK more than twice (one initial + at most one retry)', async () => {
    // A persistent validation failure must surface terminal AFTER exactly two
    // calls — never three. This guard prevents a regression that would loop
    // indefinitely on a misbehaving model.
    const fake = buildFakeAnthropic(
      respondWithJson({
        answer_summary: 'Uncited.',
        references: [
          {
            id: 'r',
            title: 'First Source',
            url: 'https://example.com/1',
            context: 'first snippet',
          },
        ],
      }),
    );
    const synth = createSynthesizer({ anthropic: fake.client, model: 'claude-fake' });
    await synth('q', inputResults, liveSignal());
    expect(fake.calls.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// Vi-spy on retry-prompt content (regression guard for the prompt-builder)
// =============================================================================

describe('Retry-prompt content — names the failed rules from the first attempt', () => {
  it('a fabricated-URL failure yields a retry prompt that explicitly mentions the offending URL', async () => {
    const fake = buildFakeAnthropic((_params, _options, callIndex) => {
      if (callIndex === 0) {
        return respondWithJson({
          answer_summary: 'A fabricated cite [1].',
          references: [
            {
              id: 'r-1',
              title: 'Made up',
              url: 'https://made-up.example/x',
              context: 'fake',
            },
          ],
        });
      }
      return respondWithJson(validBody);
    });
    const create = vi.fn(fake.client.messages.create);
    const wrapped: AnthropicLike = {
      messages: { create },
    };
    const synth = createSynthesizer({ anthropic: wrapped, model: 'claude-fake' });
    await synth('q', inputResults, liveSignal());

    expect(create).toHaveBeenCalledTimes(2);
    const retrySystem = create.mock.calls[1]?.[0].system;
    expect(retrySystem).toMatch(/https:\/\/made-up\.example\/x/);
  });
});

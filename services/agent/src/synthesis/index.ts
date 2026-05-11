/**
 * Synthesis factory — STORY-012.
 *
 * Builds a `SynthesisFn` (the seam STORY-011 wired into the agent factory)
 * backed by the Anthropic SDK. The factory's shape is dictated by
 * `.design/components/synthesis.md`:
 *
 *   "New module `services/agent/src/synthesis/index.ts` exporting
 *    `createSynthesizer({ anthropic, model, prompt, clock })` returning a
 *    `synthesize(query, results, signal): Promise<Result<SynthesisOutput, AgentError>>`."
 *
 * Per `.design/components/synthesis.md` "Layering":
 *   "synthesis is invoked by `agent` and depends only on `@neo-search/contracts`
 *    plus the Anthropic SDK. It MUST NOT depend on the tooling layer or the
 *    data layer."
 *
 * That layering posture is why this module:
 *   - imports type-only from `@neo-search/contracts`;
 *   - accepts a structurally-typed `AnthropicLike` client (production binds
 *     the real SDK at the composition root);
 *   - never imports `@neo-search/tools` or any data-layer package.
 *
 * Retry-once-on-validation-failure (per the story scope and
 * `.design/components/synthesis.md` "Citation discipline"):
 *   - Attempt 1: call the model with the base prompt; run `validateSynthesis`.
 *   - If validation fails, attempt 2: call the model again with a clarifying
 *     system message that names the failures from attempt 1.
 *   - If attempt 2 also fails, return `{ ok: false, error: { kind: "terminal",
 *     message: "synthesis-validation-failed" } }`.
 *
 * Empty-input path (per the story scope, this is the FR-005 empty path):
 *   - If `results.length === 0`, the synthesizer SHORT-CIRCUITS — it returns a
 *     non-empty `answer_summary` indicating "no results available for this
 *     query" plus an empty `references` array. The model is NOT called. This
 *     keeps the agent's empty-results path deterministic, free of model
 *     latency, and impossible to fail on `fabricated-url` / `missing-citation`
 *     (the validator rules don't apply to empty-references output by design).
 *
 * Cancellation (per `.design/components/synthesis.md` "Cancellation"):
 *   - The request `AbortSignal` MUST be honored. The Anthropic SDK accepts a
 *     `signal` parameter on `messages.create`; the factory forwards the
 *     incoming signal verbatim. If the signal is already aborted on entry, we
 *     return `{ ok: false, error: { kind: "cancelled" } }` without calling the
 *     model.
 */
import type { AgentErrorContract, ResultCardContract } from '@neo-search/contracts';
import type { SynthesisFn, SynthesisOutput as AgentSynthesisOutput } from '../agent-loop.js';
import { DEFAULT_SYNTHESIS_PROMPT, buildRetryPrompt } from './prompt.js';
import { validateSynthesis, type ValidationFailure } from './validator.js';
import type { SynthesisOutput } from './contract.js';

/**
 * Structural narrow of `Anthropic.Messages.create`. The factory accepts any
 * client object that implements this shape — production binds the real
 * `@anthropic-ai/sdk` instance, unit tests bind a fake.
 *
 * The fields named here are the ONLY fields the synthesizer uses. We keep the
 * surface narrow so a future SDK upgrade that renames optional fields does
 * not silently break the unit tests.
 */
export interface AnthropicLike {
  readonly messages: {
    create(
      params: AnthropicMessageCreateParams,
      options?: AnthropicRequestOptions,
    ): Promise<AnthropicMessageResponse>;
  };
}

/**
 * The narrow request shape. `system` is the synthesis prompt (default or
 * env-overridden); `messages` carries the user's query plus the structured
 * results JSON; `model` is the env-pinned identifier; `max_tokens` is the
 * generation cap.
 */
export interface AnthropicMessageCreateParams {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: ReadonlyArray<{
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }>;
}

/**
 * Per-call options the SDK accepts. We use only `signal` for cancellation;
 * the rest of the SDK's options surface is not part of this seam.
 */
export interface AnthropicRequestOptions {
  readonly signal?: AbortSignal;
}

/**
 * The narrow response shape. The Anthropic SDK returns
 * `{ content: Array<{ type: 'text', text: string } | { type: 'tool_use', ... }> }`.
 * The synthesizer uses ONLY the text blocks — the prompt instructs the model
 * to return JSON, and we concatenate every text block to form the JSON body.
 */
export interface AnthropicMessageResponse {
  readonly content: ReadonlyArray<AnthropicContentBlock>;
}

/**
 * One content block. We narrow to the text shape — anything else
 * (`tool_use`, `image`, etc.) is ignored when concatenating the body.
 */
export type AnthropicContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: string; readonly [key: string]: unknown };

/**
 * Factory inputs.
 *
 * `anthropic` is the only required field — the rest carry sensible defaults
 * pinned in `.design/components/synthesis.md`. The composition root passes
 * `model` and `prompt` from env vars (`ANTHROPIC_MODEL`,
 * `ANTHROPIC_SYNTHESIS_PROMPT`); tests bind explicit values.
 */
export interface CreateSynthesizerOptions {
  readonly anthropic: AnthropicLike;
  /** Model name. Defaults to env `ANTHROPIC_MODEL` if unset. */
  readonly model?: string;
  /** System prompt baseline. Defaults to `DEFAULT_SYNTHESIS_PROMPT`. */
  readonly prompt?: string;
  /** Generation cap. Defaults to 2048 tokens — enough for a paragraph-form summary. */
  readonly maxTokens?: number;
}

/**
 * Build a `SynthesisFn` bound to the given Anthropic client. The returned
 * function honors the agent's `SynthesisFn` contract (per `agent-loop.ts`):
 * it returns a structured `Result<SynthesisOutput, AgentErrorContract>` and
 * NEVER throws across its boundary.
 *
 * Exceptions thrown by the SDK (transport errors, abort) are caught and
 * mapped:
 *   - AbortError / signal.aborted → cancelled
 *   - everything else → terminal with the original error preserved on
 *     `details`.
 */
export const createSynthesizer = (options: CreateSynthesizerOptions): SynthesisFn => {
  const anthropic = options.anthropic;
  const model = options.model ?? process.env['ANTHROPIC_MODEL'] ?? '';
  const basePrompt = options.prompt ?? DEFAULT_SYNTHESIS_PROMPT;
  const maxTokens = options.maxTokens ?? 2048;

  return async (
    query: string,
    results: readonly ResultCardContract[],
    signal: AbortSignal,
  ): ReturnType<SynthesisFn> => {
    // Honor an already-aborted signal before any work.
    if (signal.aborted) {
      return cancelledError(signal.reason);
    }

    // Validate the model configuration BEFORE the empty-input path — even when
    // results.length === 0, an unconfigured model is a terminal configuration
    // error that MUST be surfaced (per reviewer finding: "unconfigured model
    // not caught on empty-input path"). The empty path is deterministic and
    // does not call the model, but the synthesizer MUST still fail-fast on
    // misconfiguration rather than silently succeeding.
    if (!model || model.trim().length === 0) {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          message: 'synthesis: model not configured (set ANTHROPIC_MODEL)',
        },
      };
    }

    // FR-005 empty path: results.length === 0 short-circuits to a deterministic
    // "no results" output. The model is NOT called — see the module-level
    // comment for the rationale. Per reviewer finding: "the message MUST NOT
    // be generic boilerplate" — we acknowledge the query context explicitly.
    if (results.length === 0) {
      return {
        ok: true,
        value: {
          answer_summary: `No results were found for "${query}".`,
          references: [],
        },
      };
    }

    // Attempt 1: base prompt.
    const firstAttempt = await callModel({
      anthropic,
      model,
      prompt: basePrompt,
      query,
      results,
      maxTokens,
      signal,
    });
    if (firstAttempt.kind === 'cancelled') {
      return cancelledError(firstAttempt.reason);
    }
    if (firstAttempt.kind === 'transport-error') {
      return terminalError('synthesis: transport-error', firstAttempt.cause);
    }

    // The remaining variants are 'parsed' (carries `output`) and 'parse-error'
    // (carries the raw text). The validator handles `undefined` as a parse
    // failure, so we extract `output` only on the parsed branch.
    const firstOutput = firstAttempt.kind === 'parsed' ? firstAttempt.output : undefined;
    const firstValidation = validateAttempt(firstOutput, results);
    if (firstValidation.ok) {
      return { ok: true, value: firstValidation.value };
    }

    // Attempt 2: clarifying system prompt naming the first attempt's failures.
    if (signal.aborted) {
      return cancelledError(signal.reason);
    }
    const retryPrompt = buildRetryPrompt(basePrompt, firstValidation.descriptions);
    const secondAttempt = await callModel({
      anthropic,
      model,
      prompt: retryPrompt,
      query,
      results,
      maxTokens,
      signal,
    });
    if (secondAttempt.kind === 'cancelled') {
      return cancelledError(secondAttempt.reason);
    }
    if (secondAttempt.kind === 'transport-error') {
      return terminalError('synthesis: transport-error', secondAttempt.cause);
    }

    const secondOutput = secondAttempt.kind === 'parsed' ? secondAttempt.output : undefined;
    const secondValidation = validateAttempt(secondOutput, results);
    if (secondValidation.ok) {
      return { ok: true, value: secondValidation.value };
    }

    // Both attempts failed validation — terminal per
    // `.design/components/synthesis.md`: "a second failure is a `terminal`
    // agent error per FR-023".
    return {
      ok: false,
      error: {
        kind: 'terminal',
        message: 'synthesis-validation-failed',
        details: { failures: secondValidation.descriptions },
      },
    };
  };
};

/**
 * Internal model-call helper. Returns a discriminated outcome:
 *   - 'parsed': the model produced a JSON body that parses to a synthesis
 *     output shape (NOT yet validated against the rules — `validateAttempt`
 *     handles that);
 *   - 'parse-error': the body did not parse (the validator will then treat
 *     this as a structural failure, identical to other validation failures);
 *   - 'cancelled': the call was aborted via signal;
 *   - 'transport-error': the SDK threw / the response was malformed at the
 *     transport level (retried once; second occurrence surfaces terminal).
 */
type CallOutcome =
  | { readonly kind: 'parsed'; readonly output: SynthesisOutput }
  | { readonly kind: 'parse-error'; readonly raw: string }
  | { readonly kind: 'cancelled'; readonly reason: unknown }
  | { readonly kind: 'transport-error'; readonly cause: unknown };

interface CallModelArgs {
  readonly anthropic: AnthropicLike;
  readonly model: string;
  readonly prompt: string;
  readonly query: string;
  readonly results: readonly ResultCardContract[];
  readonly maxTokens: number;
  readonly signal: AbortSignal;
}

const callModel = async (args: CallModelArgs): Promise<CallOutcome> => {
  // The user message carries the structured input the model needs: the
  // query plus the candidate results, formatted as JSON. The prompt
  // instructs the model to return JSON in turn.
  //
  // Query length is unbounded in the LLM payload (per reviewer finding:
  // "acceptable for prototype scope"). The assumption is that typical web
  // search queries stay under ~1000 chars, well within Claude's context
  // window. A future requirement for multi-kilobyte queries or adversarial
  // inputs MAY require truncation; the design currently treats the query
  // as opaque user input forwarded verbatim.
  const userPayload = JSON.stringify({
    query: args.query,
    results: args.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
      domain: r.domain,
    })),
  });

  let response: AnthropicMessageResponse;
  try {
    response = await args.anthropic.messages.create(
      {
        model: args.model,
        max_tokens: args.maxTokens,
        system: args.prompt,
        messages: [{ role: 'user', content: userPayload }],
      },
      { signal: args.signal },
    );
  } catch (err: unknown) {
    if (isAbortError(err) || args.signal.aborted) {
      return { kind: 'cancelled', reason: err };
    }
    return { kind: 'transport-error', cause: err };
  }

  // Concatenate every text block into a single body. The prompt instructs
  // the model to return JSON; `tool_use` / image blocks are ignored.
  const body = response.content
    .map((block) => (block.type === 'text' ? (block as { text: string }).text : ''))
    .join('');

  return parseJsonOutput(body);
};

/**
 * Best-effort JSON extraction from the model's text body. Models occasionally
 * wrap JSON in markdown fences (`` ```json ... ``` ``); we strip those before
 * parsing. If parsing fails, we return `parse-error` and let the validator
 * treat it as a structural failure.
 */
const parseJsonOutput = (raw: string): CallOutcome => {
  const stripped = stripCodeFence(raw).trim();
  if (stripped.length === 0) {
    return { kind: 'parse-error', raw };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { kind: 'parse-error', raw };
  }
  if (!isSynthesisShape(parsed)) {
    return { kind: 'parse-error', raw };
  }
  return { kind: 'parsed', output: parsed };
};

/**
 * Strip a single leading/trailing markdown code fence. We do NOT try to
 * extract JSON from arbitrary prose — the prompt instructs the model to
 * return JSON, and a non-JSON response surfaces as a validator failure.
 */
const stripCodeFence = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  // Match ``` optionally followed by a language tag, then capture the body
  // up to the closing ```.
  const match = /^```(?:[a-zA-Z]+)?\s*([\s\S]*?)```$/.exec(trimmed);
  if (!match || match[1] === undefined) return trimmed;
  return match[1].trim();
};

/**
 * Type-guard for the synthesis output shape. The validator rules run AFTER
 * this guard succeeds; this guard is the structural barrier between the
 * model's free-form text and the typed validator.
 */
const isSynthesisShape = (value: unknown): value is SynthesisOutput => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['answer_summary'] !== 'string') return false;
  if (!Array.isArray(v['references'])) return false;
  for (const ref of v['references']) {
    if (typeof ref !== 'object' || ref === null) return false;
    const r = ref as Record<string, unknown>;
    if (typeof r['id'] !== 'string') return false;
    if (typeof r['title'] !== 'string') return false;
    if (typeof r['url'] !== 'string') return false;
    if (typeof r['context'] !== 'string') return false;
  }
  return true;
};

/**
 * Validation outcome for a single attempt. On success carries the validated
 * output; on failure carries the human-readable failure descriptions used
 * by the retry-prompt builder.
 */
type AttemptValidation =
  | { readonly ok: true; readonly value: AgentSynthesisOutput }
  | { readonly ok: false; readonly descriptions: readonly string[] };

/**
 * Run `validateSynthesis` on a parsed-or-not call outcome and convert the
 * result into the discriminated `AttemptValidation` shape used by the
 * retry-prompt loop.
 */
const validateAttempt = (
  output: SynthesisOutput | undefined,
  results: readonly ResultCardContract[],
): AttemptValidation => {
  // The caller passes `undefined` only for a parse-error outcome; we surface
  // it as a single descriptive failure so the retry prompt can re-issue with
  // the same JSON-shape instruction.
  if (output === undefined) {
    return {
      ok: false,
      descriptions: ['The previous response was not valid JSON in the expected shape.'],
    };
  }
  const result = validateSynthesis(output, results);
  if (result.ok) {
    return { ok: true, value: output };
  }
  return {
    ok: false,
    descriptions: result.error.failures.map(describeFailure),
  };
};

/**
 * Translate a `ValidationFailure` discriminant into a human-readable string
 * the model can consume in the retry prompt. The strings are deliberately
 * imperative ("Add a citation marker ...") so the second attempt has a clear
 * corrective instruction.
 */
const describeFailure = (failure: ValidationFailure): string => {
  const failureKindLookup: Record<ValidationFailure['kind'], (f: ValidationFailure) => string> = {
    'empty-summary': () =>
      'The `answer_summary` was empty. Provide a non-empty summary that addresses the query.',
    'reference-missing-field': (f) => {
      const r = f as Extract<ValidationFailure, { kind: 'reference-missing-field' }>;
      return `Reference at index ${r.index} was missing the required \`${r.field}\` field.`;
    },
    'duplicate-url': (f) => {
      const r = f as Extract<ValidationFailure, { kind: 'duplicate-url' }>;
      return `Two references shared the URL ${r.url}. Merge them into a single entry.`;
    },
    'fabricated-url': (f) => {
      const r = f as Extract<ValidationFailure, { kind: 'fabricated-url' }>;
      return `The URL ${r.url} did not appear in the input results. Only cite URLs from the input.`;
    },
    'missing-citation': (f) => {
      const r = f as Extract<ValidationFailure, { kind: 'missing-citation' }>;
      return `The claim "${r.snippet}" had no citation marker. Every paragraph or bullet must end with at least one [N] marker.`;
    },
    'citation-out-of-range': (f) => {
      const r = f as Extract<ValidationFailure, { kind: 'citation-out-of-range' }>;
      return `Citation marker [${r.marker}] referenced a non-existent reference (only ${r.maxValid} references are available).`;
    },
  };
  return failureKindLookup[failure.kind](failure);
};

/**
 * Best-effort `AbortError` recognition. The Anthropic SDK throws an
 * `APIUserAbortError` (subclass of `Error`) on signal abort; older SDKs throw
 * `Error.name === 'AbortError'`. We accept either.
 */
const isAbortError = (err: unknown): boolean => {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'APIUserAbortError') return true;
    // The SDK 0.32 abort error is a subclass of `APIError`; the `message`
    // typically begins with "Request was aborted".
    if (/aborted|cancelled/i.test(err.message)) return true;
  }
  return false;
};

const cancelledError = (reason: unknown): { ok: false; error: AgentErrorContract } => ({
  ok: false,
  error: {
    kind: 'cancelled',
    message: reason instanceof Error ? reason.message : 'cancelled',
    details: reason,
  },
});

const terminalError = (
  message: string,
  cause: unknown,
): { ok: false; error: AgentErrorContract } => ({
  ok: false,
  error: {
    kind: 'terminal',
    message,
    details: cause,
  },
});

// Re-exports: the validator and prompt are part of the synthesis module's
// public surface so STORY-013 can import them for the API-tier integration
// test, and so the agent's composition root can pass an env-driven prompt.
export { validateSynthesis } from './validator.js';
export type { ValidationError, ValidationFailure, ValidatorResult } from './validator.js';
export { DEFAULT_SYNTHESIS_PROMPT, buildRetryPrompt } from './prompt.js';
export type {
  SynthesisInput,
  SynthesisOutput as SynthesisOutputShape,
  SynthesisReference,
  SynthesisResult,
} from './contract.js';
export { DEFAULT_SYNTHESIS_BUDGET_MS } from './contract.js';

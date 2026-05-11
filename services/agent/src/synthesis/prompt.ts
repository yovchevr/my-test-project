/**
 * Default synthesis prompt — STORY-012.
 *
 * Per `.design/components/synthesis.md` "Variation accommodated":
 *   "Model and prompt — the volatile periphery. Either MAY change without an
 *    ADR provided the contract still validates. The model name MUST be
 *    environment-driven, never hardcoded."
 *
 * The prompt below is the BASELINE shape: a single instruction paragraph that
 * tells the model the contract (numeric `[N]` markers; non-empty summary;
 * three required reference fields; no fabrications). The composition root MAY
 * override it via `ANTHROPIC_SYNTHESIS_PROMPT` env var — that override path is
 * tested in `synthesis.test.ts` ("uses the env-driven prompt").
 *
 * Per `.design/foundation/conventions.md` "Imports and dependencies": the
 * prompt is a constant module checked into the repo so prompt changes are
 * reviewable as code.
 */

/**
 * The system prompt used on the first synthesis attempt. The shape is locked
 * so the validator's expectations and the prompt's instructions stay in sync;
 * tuning paragraphs / tone is acceptable, but removing the citation
 * instruction would break I-2 / FR-008 enforcement.
 *
 * The array-then-join construction makes the prompt easy to edit in future
 * tuning rounds — each instruction is a separate line. Future tuning MAY add
 * bullet formatting or examples without requiring ADR approval provided the
 * structural rules (citation markers, no fabrication, no duplicates) remain.
 */
export const DEFAULT_SYNTHESIS_PROMPT = [
  'You synthesize web search results into a concise answer summary plus a structured references list.',
  'Output a JSON object with EXACTLY two top-level fields: "answer_summary" (string) and "references" (array).',
  'Every paragraph or bullet in `answer_summary` MUST end with at least one inline citation marker `[N]`, where N is a 1-based index into `references`.',
  'Every entry in `references` MUST have non-empty `title`, `url`, and `context` fields.',
  'You MUST only cite URLs that appear in the input results. Do not invent or paraphrase URLs.',
  'You MUST NOT include the same URL twice in `references`.',
  'Do not use footnotes, "Sources:" blocks, or any citation form other than `[N]`.',
].join(' ');

/**
 * Build a clarifying retry prompt. When the first attempt's output fails the
 * validator, we call the model again with a system message that explicitly
 * names what went wrong on the first attempt — per `.design/components/synthesis.md`:
 * "the synthesis run MUST be retried once". The clarifying prompt is the
 * mechanism by which the second attempt has a chance to succeed.
 *
 * The function takes a list of human-readable failure descriptions (built
 * from `ValidationFailure` discriminants in the synthesizer) and composes a
 * second-attempt system message that includes them.
 */
export const buildRetryPrompt = (
  basePrompt: string,
  failureDescriptions: readonly string[],
): string => {
  const header = 'Your previous attempt failed validation for the following reasons:';
  const list = failureDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const footer =
    'Produce a corrected response that satisfies every rule above. Do not repeat the same mistakes.';
  return `${basePrompt}\n\n${header}\n${list}\n\n${footer}`;
};

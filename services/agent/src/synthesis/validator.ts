/**
 * Synthesis output validator — STORY-012.
 *
 * Per `.design/components/synthesis.md` "Citation discipline":
 *   "The implementation MUST run a post-generation validator that asserts:
 *      - Every `[N]` marker in the summary resolves to a `references[N-1]` entry.
 *      - Every reference's `url` appears in the input `results`.
 *      - No two references share a URL.
 *      - Every paragraph or bullet in the summary contains at least one
 *        citation marker (the 'material claim' heuristic — a paragraph with no
 *        citation is treated as a fabricated claim and the synthesis run MUST
 *        be retried once; a second failure is a `terminal` agent error per
 *        FR-023)."
 *
 * The validator is what makes I-2, I-3, I-4, I-5 enforceable per
 * `.design/domain/invariants.md`:
 *   - I-2: every material claim cites a reference.
 *   - I-3: every reference has non-empty `title`, `url`, `context`.
 *   - I-4: no duplicate URLs.
 *   - I-5: every reference URL resolves back to an input result (no fabrication).
 *
 * The validator returns a `Result<SynthesisOutput, ValidationError>` rather
 * than throwing — per `.design/foundation/conventions.md` "Functions that can
 * fail at a layer boundary MUST return a structured result type ... rather
 * than throwing".
 */
import type { ResultCardContract } from '@neo-search/contracts';
import type { SynthesisOutput } from './contract.js';

/**
 * The discriminant of a validator failure. Each value names the rule that was
 * violated so the synthesizer's retry path can compose a clarifying system
 * message keyed on the failure mode (the second-attempt prompt should remind
 * the model exactly what went wrong on the first attempt).
 *
 * Values are stable strings — the synthesizer's retry-prompt logic and the
 * validator unit tests both pattern-match on them.
 */
export type ValidationFailure =
  /** I-1 / FR-007: `answer_summary` was empty. */
  | { readonly kind: 'empty-summary' }
  /** I-3 / FR-009: a reference entry was missing `title`, `url`, or `context`. */
  | { readonly kind: 'reference-missing-field'; readonly index: number; readonly field: string }
  /** I-4: two references share the same URL. */
  | { readonly kind: 'duplicate-url'; readonly url: string }
  /** I-5: a reference URL did not appear in the input results (fabrication). */
  | { readonly kind: 'fabricated-url'; readonly url: string }
  /** I-2 / FR-008: a paragraph or bullet in the summary lacks a citation marker. */
  | { readonly kind: 'missing-citation'; readonly snippet: string }
  /** I-2 / FR-008: a `[N]` marker references a non-existent reference index. */
  | { readonly kind: 'citation-out-of-range'; readonly marker: number; readonly maxValid: number };

/**
 * The validator's failure shape. `failures` is non-empty on failure and lists
 * every rule violated so the retry prompt can address all problems at once
 * rather than triggering a second retry on the next surfaced violation.
 */
export interface ValidationError {
  readonly failures: readonly ValidationFailure[];
}

/**
 * The discriminated `Result` shape used by the agent module. Defined locally
 * (no `Contract` suffix per `.design/foundation/naming-conventions.md`) so
 * this module does not import the contracts package's `Result` runtime — the
 * type alias is sufficient and keeps the dependency surface narrow.
 */
export type ValidatorResult =
  | { readonly ok: true; readonly value: SynthesisOutput }
  | { readonly ok: false; readonly error: ValidationError };

/**
 * Pattern matching `[N]` for any positive integer N. Used to extract every
 * citation marker from the answer summary. We intentionally do NOT match
 * other forms (footnotes, "Sources:" blocks) per `.design/domain/glossary.md`
 * "Citation marker": "the design fixes this as inline numeric markers — `[1]`,
 * `[2]` — pointing into the references list. Other forms ... MUST NOT be
 * substituted, so reviewers always know what to look for."
 */
const CITATION_MARKER = /\[(\d+)\]/g;

/**
 * Split the answer summary into the units the "material claim" heuristic
 * applies to. Per `.design/components/synthesis.md`: "Every paragraph or
 * bullet in the summary contains at least one citation marker". Paragraphs
 * are blank-line-separated; bullets are leading-`-`/`*` lines. We treat each
 * non-empty trimmed line as a candidate claim — both paragraphs (one line per
 * paragraph for the simple shape) and bulleted items satisfy this.
 *
 * Lines containing ONLY whitespace, ONLY a header marker (`#`), or ONLY a
 * code-fence (`` ``` ``) are skipped — those are not material claims, they are
 * structural elements.
 */
const splitIntoClaims = (summary: string): readonly string[] => {
  const claims: string[] = [];
  for (const rawLine of summary.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    // Skip pure structural lines: markdown headers and code fences. A line
    // that is JUST `#` or `##` etc. is structural; a line that starts with
    // `#` followed by content IS a claim and MUST cite.
    if (/^#+$/.test(line)) continue;
    if (/^```/.test(line)) continue;
    claims.push(line);
  }
  return claims;
};

/**
 * Run the four structural validation rules. Returns
 *   { ok: true, value: output } on success
 *   { ok: false, error: { failures: [...] } } on failure.
 *
 * Failures are collected eagerly — every detected violation appears in
 * `failures` so the retry prompt can address all of them at once.
 */
export const validateSynthesis = (
  output: SynthesisOutput,
  inputResults: readonly ResultCardContract[],
): ValidatorResult => {
  const failures: ValidationFailure[] = [];

  // Rule 0 (FR-007 / I-1): the answer_summary MUST be non-empty.
  if (output.answer_summary.trim().length === 0) {
    failures.push({ kind: 'empty-summary' });
  }

  // Rule 1 (FR-009 / I-3): every reference entry has all three fields.
  // We check this eagerly so a malformed reference list does not poison the
  // downstream URL-membership / duplicate-URL rules.
  output.references.forEach((ref, i) => {
    if (!ref.title || ref.title.trim().length === 0) {
      failures.push({ kind: 'reference-missing-field', index: i, field: 'title' });
    }
    if (!ref.url || ref.url.trim().length === 0) {
      failures.push({ kind: 'reference-missing-field', index: i, field: 'url' });
    }
    if (!ref.context || ref.context.trim().length === 0) {
      failures.push({ kind: 'reference-missing-field', index: i, field: 'context' });
    }
  });

  // Rule 2 (I-4): no duplicate URLs.
  const seenUrls = new Set<string>();
  for (const ref of output.references) {
    if (seenUrls.has(ref.url)) {
      failures.push({ kind: 'duplicate-url', url: ref.url });
    }
    seenUrls.add(ref.url);
  }

  // Rule 3 (I-5): every reference URL appears in the input results — no
  // fabrication. The check is exact-string (the design pins URLs as opaque
  // identifiers; the validator does NOT normalize trailing slashes / casing
  // because that would mask real fabrications by the model).
  const allowedUrls = new Set(inputResults.map((r) => r.url));
  for (const ref of output.references) {
    if (!allowedUrls.has(ref.url)) {
      failures.push({ kind: 'fabricated-url', url: ref.url });
    }
  }

  // Rule 4 (FR-008 / I-2): every claim cites at least one marker; every
  // marker resolves to an existing reference index.
  // The "material claim" heuristic: every non-empty, non-structural line
  // MUST contain at least one `[N]` marker.
  const claims = splitIntoClaims(output.answer_summary);
  for (const claim of claims) {
    CITATION_MARKER.lastIndex = 0;
    if (!CITATION_MARKER.test(claim)) {
      failures.push({
        kind: 'missing-citation',
        // Cap the snippet so the failure surface stays loggable.
        snippet: claim.length > 120 ? `${claim.slice(0, 117)}...` : claim,
      });
    }
  }

  // Range-check every marker. A `[7]` in the summary with only 5 references
  // is malformed even if every paragraph has SOME citation.
  CITATION_MARKER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CITATION_MARKER.exec(output.answer_summary)) !== null) {
    const markerStr = m[1];
    if (markerStr === undefined) continue;
    const markerNum = Number.parseInt(markerStr, 10);
    if (!Number.isFinite(markerNum) || markerNum < 1 || markerNum > output.references.length) {
      failures.push({
        kind: 'citation-out-of-range',
        marker: markerNum,
        maxValid: output.references.length,
      });
    }
  }

  if (failures.length > 0) {
    return { ok: false, error: { failures } };
  }
  return { ok: true, value: output };
};

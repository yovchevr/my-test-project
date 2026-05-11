/**
 * Synthesis input/output contract — STORY-012.
 *
 * Per `.design/components/synthesis.md`:
 *   "The contract MUST live in `@neo-search/contracts` (or in a sub-module
 *    exported through it) so the input/output types are reusable across the
 *    agent and the test surface (I-21, I-34)."
 *
 * STORY-002 already pinned the constituent record types — `ResultCardContract`
 * and `ReferenceEntryContract` — and STORY-011 pinned the agent's
 * `SearchResponseValueContract`, whose `answer_summary` + `references` shape IS
 * the synthesis output shape. Defining a separate `SynthesisOutputContract`
 * here would duplicate those fields and trip the FR-021 / I-34 single-source
 * scan; instead we re-export the agent's existing contract names under
 * synthesis-flavored aliases so call sites read naturally without violating
 * "single definition" (`.design/foundation/conventions.md` "Imports").
 *
 * The synthesis input shape (query + results) is local to the synthesizer's
 * call site — it is NOT a layer-boundary contract (the agent ↔ synthesis seam
 * is in-process within `services/agent`). Per
 * `.design/foundation/naming-conventions.md` "Contract types MUST end in
 * Contract; internal types MUST NOT", the input shape lives in this module as
 * a plain `interface` rather than a `Contract`-suffixed schema.
 *
 * The runtime LLM call's per-call budget defaults to 8s
 * (`.design/components/synthesis.md`: "SynthesisInputContract.budgetMs.default
 * = 8_000"); the constant `DEFAULT_SYNTHESIS_BUDGET_MS` is exported so the
 * factory and its tests reference the same value.
 */
import type {
  ReferenceEntryContract,
  ResultCardContract,
  SearchResponseValueContract,
} from '@neo-search/contracts';

/**
 * Per-call synthesis budget default (`.design/components/synthesis.md`:
 * "SynthesisInputContract.budgetMs.default = 8_000"). Exposed as a constant so
 * the factory, its tests, and any composition-root override agree on the
 * canonical value rather than re-encoding the literal.
 */
export const DEFAULT_SYNTHESIS_BUDGET_MS = 8_000;

/**
 * What the synthesizer takes in. Plain interface — the agent ↔ synthesis seam
 * is in-process, not a layer boundary, so per `.design/foundation/naming-conventions.md`
 * the type does NOT end in `Contract`.
 *
 * `signal` is the request `AbortSignal` propagated from the agent loop.
 * `.design/components/synthesis.md`: "The synthesis call MUST accept the
 * AbortSignal from the agent and abort when the request budget elapses."
 */
export interface SynthesisInput {
  readonly query: string;
  readonly results: readonly ResultCardContract[];
  readonly signal: AbortSignal;
}

/**
 * What the synthesizer produces. Mirrors `SearchResponseValueContract`'s
 * `answer_summary` + `references` exactly; the agent fills `results` and
 * `pagination` from the tool layer's output. By re-exporting the canonical
 * `Static` type rather than defining a new one we keep the FR-021 / I-34
 * single-source guarantee (the contract types stay in @neo-search/contracts).
 */
export type SynthesisOutput = Pick<SearchResponseValueContract, 'answer_summary' | 'references'>;

// Re-export the constituent record contracts under names that read naturally
// at synthesis call sites. These are pure type aliases; no new runtime values
// are declared here, so the FR-021 single-source scan stays satisfied.
export type SynthesisResult = ResultCardContract;
export type SynthesisReference = ReferenceEntryContract;

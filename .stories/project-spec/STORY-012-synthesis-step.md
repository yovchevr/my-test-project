---
id: STORY-012
title: Implement the synthesis step with citation validator
initiative: .initiatives/project_spec.md
requirements: [FR-007, FR-008, FR-009, FR-013]
design_refs:
  - .design/components/synthesis.md
  - .design/components/agent.md
  - .design/domain/glossary.md
  - .design/domain/invariants.md
  - .design/foundation/conventions.md
status: ready
points: 5
depends_on: [STORY-002, STORY-011]
external_depends_on: ["ANTHROPIC_API_KEY env var must be available in dev and CI smoke"]
wave: 7
---

## Goal / user value
Convert raw `ResultCard[]` into a non-empty `answer_summary` plus a `references[]` list with inline numeric citation markers (`[1]`, `[2]`, …), and refuse to ship output that fails the structural validators. This is the answer-quality contract — FR-007 (summary not link dump), FR-008 (every claim cited), FR-009 (references structured) — made enforceable. Without this, the system is a search engine; with it, it's the agent-driven answer product the initiative names.

## Context
Per `synthesis.md` the synthesis step is a pure transform `(query, results) → { answer_summary, references }`, lives at `services/agent/src/synthesis/`, uses Anthropic SDK 0.32.1 with model + prompt env-driven (no hardcoded model name per `tech-stack.md`). The post-generation validator asserts: every `[N]` resolves to `references[N-1]`; every reference URL appears in input results (no fabrication, I-5); no duplicate URLs (I-4); every paragraph/bullet contains at least one citation marker (the "material claim" heuristic — paragraph without citation = malformed; one in-process retry, then `terminal` per `synthesis.md`). The design fixes inline numeric markers (`[1]`, `[2]`) — other forms (footnotes, "Sources" block) MUST NOT be substituted (`domain/glossary.md` "Citation marker"). STORY-011 already injects a `synthesize` function into the agent factory; this story replaces the test fake with the real implementation.

## Scope
- New module `services/agent/src/synthesis/index.ts` exporting `createSynthesizer({ anthropic, model, prompt, clock })` returning a `synthesize(query, results, signal): Promise<Result<SynthesisOutput, AgentError>>`.
- Anthropic SDK call with the request `AbortSignal` forwarded; per-call budget defaults to 8s (`SynthesisInputContract.budgetMs.default = 8_000` per `synthesis.md`).
- `services/agent/src/synthesis/contract.ts` re-exporting the `SynthesisInputContract` / `SynthesisOutputContract` from `@neo-search/contracts` (or defining them in `@neo-search/contracts` if STORY-002 deferred them — confirm during the developer pass).
- `services/agent/src/synthesis/validator.ts` exporting `validateSynthesis(output, inputResults): Result<SynthesisOutput, ValidationError>` enforcing the four structural rules listed in Context.
- Retry-once-on-validation-failure logic inside `createSynthesizer`: if `validateSynthesis` returns failure, re-issue the model call ONCE more with a clarifying system message; if the second call also fails, return `{ ok: false, error: { kind: "terminal", message: "synthesis-validation-failed" } }`.
- Empty input results path: if `results.length === 0`, return a non-empty `answer_summary` indicating "no results available for this query" plus an empty `references` array — this is the FR-005 empty path (the synthesis output is structurally valid; the UI renders the empty state from the empty `results`/`references`).
- Determinism caveat: LLM output is non-deterministic; tests use a fake `anthropic` client returning canned responses to assert the validator's behavior. (Per `synthesis.md`: idempotency lives at the API level via `clientRequestId`.)
- The synthesis module MUST NOT import `@neo-search/tools` or any data-layer module (boundary discipline; lint-enforced in STORY-018).

## Out of scope / non-goals
- No streaming output (deferred per `synthesis.md`).
- No re-ranking step before synthesis (deferred per `synthesis.md`).
- No prompt-engineering tuning beyond a working baseline; the prompt MUST be env-driven so it can be improved without code changes.
- No model selection logic — the model name comes from `ANTHROPIC_MODEL` env var.

## Acceptance criteria
- A successful synthesis (fake `anthropic` returns a well-formed canned response) MUST produce a `SynthesisOutput` whose `answer_summary` is non-empty and contains at least one `[N]` marker per paragraph/bullet (FR-007 + FR-008).
- Every reference entry MUST have non-empty `title`, non-empty `url`, non-empty `context` (FR-009 + I-3).
- A canned response containing two references with the same URL MUST be rejected by the validator (I-4); after one retry, if the duplicate persists, MUST return `terminal`.
- A canned response containing a `references` entry whose `url` does not appear in the input results MUST be rejected by the validator (I-5); after one retry, MUST return `terminal`.
- A canned response containing a paragraph with no citation marker MUST be rejected (the "material claim" heuristic per `synthesis.md`); after one retry, MUST return `terminal`.
- A canned response with `answer_summary` of `""` MUST be rejected as terminal.
- An `AbortSignal` aborted mid-call MUST cause the synthesizer to return without throwing.
- An empty `results` input MUST produce a non-empty `answer_summary` plus an empty `references` array — synthesis MUST NOT throw on empty input.
- The synthesis module MUST NOT call `registry.invoke`, MUST NOT import any tool, MUST NOT import any data-layer module (lint-enforced).
- `tsc --noEmit`, `eslint`, `vitest` MUST pass.

## Definition of done
- All acceptance criteria covered by automated tests in the project's runner; full suite green.
- Every quality gate the project defines passes (lint, type-check, format, etc.).
- Code reviewed and merged via PR opened by the `developer` agent.
- `.design/` boundaries respected; no drive-by refactors outside scope.
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` documented in repo `README.md` env-var section.
- The agent factory wiring in STORY-011 swaps the test fake for the real `createSynthesizer({ anthropic })` at the composition root.

## Test plan
- Unit (`services/agent/src/synthesis/synthesis.test.ts`): the eight acceptance criteria above with a fake `anthropic` client returning canned responses; assert the validator's `terminal` path fires after the second consecutive failure.
- Unit (`services/agent/src/synthesis/validator.test.ts`): the four validator rules in isolation — duplicate URL, fabricated URL, missing citation, empty summary.
- Unit (`services/agent/src/references.test.ts`): per `technology/testing.md` FR-009 row — every reference has the three required fields, no duplicate URLs.
- Integration: not applicable here (the synthesis function is invoked by the agent; STORY-011's integration test now uses this synthesis instead of the fake).
- E2E: deferred to STORY-019 (smoke run with live Anthropic).
- Adversarial / NFR coverage:
  - **FR-008 / I-2 / I-5**: the validator tests above ARE the adversarial coverage — fault-injecting fabricated references, missing citations, and duplicate URLs is the only way to prove the validator works.
  - **FR-013**: synthesis is invoked uniformly for LIVE/HISTORY/BOOKMARK by STORY-011's loop; this story's contract guarantees the same output shape regardless of source — covered by STORY-011's per-source-filter integration test now exercising real synthesis.

## Affected design surface
- `.design/components/synthesis.md` — implements the public contract, validator rules, and citation discipline verbatim.
- `.design/components/agent.md` — synthesis is the injected dependency wired into the agent factory.
- `.design/domain/glossary.md` — citation marker form (`[N]`) is fixed by this implementation.
- `.design/domain/invariants.md` — I-1, I-2, I-3, I-4, I-5 become enforceable by the validator.

## Dependencies
- **Depends on**: STORY-002 (`SynthesisInputContract`, `SynthesisOutputContract`, `ReferenceEntryContract`), STORY-011 (the agent factory exposes the `synthesize` injection point and the test fake gets swapped here).
- **Enables**: STORY-013 (API consumes the agent's now-real synthesis output), STORY-019 (smoke test exercises live synthesis).

## Risks & assumptions
- Risk: a real Anthropic call may sometimes produce output that fails the validator — the retry-once policy may not always recover. Mitigation: this is by design (better to surface a `terminal` error than ship a fabrication); STORY-019's smoke test catches systemic prompt issues.
- Risk: model/prompt drift over time. Mitigation: model is env-driven; prompt is a constant module checked into the repo; both are versioned with the package.
- Assumption: the fake-`anthropic` test approach is sufficient — real model behavior is exercised in STORY-019's smoke; this story locks the structural contract.

## Source excerpts
> A synthesis step MUST exist as a discrete unit of work invoked by the agent for every search. Its output MUST conform to the contract from FR-010. It MUST NOT bypass the citation requirement: every material claim in its summary MUST be backed by an entry in the references list.

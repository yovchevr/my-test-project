---
title: Synthesis step
read_when: implementing or modifying the answer-summary / citations generation
boundary: periphery
requirements: [FR-007, FR-008, FR-009, FR-013]
---

# Synthesis step

A discrete unit of work invoked by the agent on every search to convert raw structured results into the final `answer_summary` plus `references` payload. Lives in `services/agent/src/synthesis/` (Anthropic SDK per `technology/tech-stack.md`).

## Responsibilities

- Accept a list of structured results (parsed by the `web-search` tool or read from the cache by the `data-store` tool) plus the user's query.
- Produce a non-empty `answer_summary` in paragraph or bullet form that addresses the query (FR-007). A generic boilerplate string MUST NOT be returned.
- Produce a `references` list in which every entry has non-empty `title`, `url`, `context` (FR-009), and no two entries share a URL (I-4).
- Place inline citation markers (`[1]`, `[2]`, …) in the summary so every material claim is tied to one or more reference entries (FR-008, I-2).
- Use only URLs that appear in the input results — fabricated references MUST NOT be emitted (I-5).
- Be invoked uniformly for LIVE, HISTORY, and BOOKMARK searches so the answer-quality contract stays uniform across source types (FR-013, I-24).

## What this component MUST NOT do

- It MUST NOT call tools or talk to the data layer. It is a pure transform: `(query, results) → { answer_summary, references }`.
- It MUST NOT branch on specific query strings or known result shapes (NFR-006, I-22).
- It MUST NOT bypass the citation requirement — every material claim MUST cite a reference (FR-008, I-2).
- It MUST NOT include URLs not present in the input results (I-5).
- It MUST NOT emit duplicate URLs in the references list (I-4).

## Public contract

```ts
// services/agent/src/synthesis/contract.ts
export const SynthesisInputContract = Type.Object({
  query: Type.String({ minLength: 1 }),
  results: Type.Array(ResultCardContract),
  budgetMs: Type.Integer({ minimum: 1, default: 8_000 }),
});

export const SynthesisOutputContract = Type.Object({
  answer_summary: Type.String({ minLength: 1 }),
  references: Type.Array(ReferenceEntryContract),
});
```

The contract MUST live in `@neo-search/contracts` (or in a sub-module exported through it) so the input/output types are reusable across the agent and the test surface (I-21, I-34).

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | `SynthesisInputContract`. The `results` array MUST carry the structured `Result` records produced by the `web-search` tool — never raw HTML or unparsed strings. |
| Outputs | `SynthesisOutputContract`. Validated by the agent before forwarding to the API. A validation failure here MUST be treated as a `terminal` agent error (FR-023) — the synthesis step has misbehaved. |
| Idempotency | Synthesis is non-deterministic by nature (LLM call). Idempotency lives at the API level via `clientRequestId`. Two synthesis runs over the same input MAY produce different summaries; both MUST satisfy the invariants. |
| Versioning | The model name and prompt are environment-pinned. Changing the prompt or the model MUST NOT require touching the agent loop or the contract — it is a periphery change. |
| Cancellation | The synthesis call MUST accept the `AbortSignal` from the agent and abort when the request budget elapses. |

## Citation discipline

Per `domain/glossary.md`, the design fixes the citation marker as **inline numeric markers** (`[1]`, `[2]`, …) pointing into the references list. Any other form (footnotes, "Sources" block) MUST NOT be substituted — the form is fixed so reviewers always know what to look for.

The implementation MUST run a post-generation validator that asserts:

- Every `[N]` marker in the summary resolves to a `references[N-1]` entry.
- Every reference's `url` appears in the input `results`.
- No two references share a URL.
- Every paragraph or bullet in the summary contains at least one citation marker (the "material claim" heuristic — a paragraph with no citation is treated as a fabricated claim and the synthesis run MUST be retried once; a second failure is a `terminal` agent error per FR-023).

The validator is what makes I-2, I-3, I-4, I-5 enforceable — synthesis output that fails validation MUST NOT reach the user.

## Variation accommodated

- **Model and prompt** — the volatile periphery. Either MAY change without an ADR provided the contract still validates. The model name MUST be environment-driven, never hardcoded (`technology/tech-stack.md`).

## Variation NOT accommodated

- **Multiple synthesis steps in series / parallel** — the design fixes a single synthesis call per search. If a future requirement asks for re-ranking + synthesis as two steps, that is a superseding-ADR moment.
- **Streaming output** — the prototype returns the summary in one shot. Streaming would require a UI ↔ API contract change (FR-010) and is deferred.

## Layering

`synthesis` is invoked by `agent` and depends only on `@neo-search/contracts` plus the Anthropic SDK. It MUST NOT depend on the tooling layer or the data layer.

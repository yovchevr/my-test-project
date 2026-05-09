---
title: TypeScript end-to-end with TypeBox as the single contract source
read_when: proposing a polyglot stack, a different validator, or a different schema source
status: Accepted
date: 2026-05-09
---

# ADR 0002 — TypeScript end-to-end with TypeBox as the single contract source

## Status

Accepted (2026-05-09).

## Context

FR-021 requires four explicit, structured, **reusable** contracts. The "reusable" word is load-bearing: a single definition MUST be referenced by both sides of each boundary, not duplicated.

Three plausible postures:

- **A. Polyglot stack** (e.g. UI in TypeScript, agent in Python, data layer in either). Contracts would be authored in a neutral schema (JSON Schema, OpenAPI, Protobuf) and code-generated into each language.
- **B. Single-language (TypeScript) stack with a runtime-validated schema** (Zod, TypeBox, Valibot). Types and validators come from one source.
- **C. Single-language (TypeScript) stack with hand-written interface types and ad-hoc validation.**

Option A is the most general but pays a heavy fixed cost for the prototype: code generation pipelines, drift between checked-in TS types and the source schema, two test stacks, two CI pipelines. The initiative is local-prototype scope (OQ-002), so the optionality of polyglot is not exercised by any current FR — applying principle 8 (minimum viable abstraction), the cost is unjustified.

Option C is the easiest to start but breaks FR-021's "reusable / single definition" clause as soon as the first contract drifts. The agent and the API would gradually grow type definitions that look the same but are actually slightly different — the failure mode that FR-021 exists to prevent.

Option B (TypeBox specifically) gives us:

- One source of truth per boundary (`Type.Object({...})`).
- Static TS types via `Static<typeof Schema>`.
- Runtime JSON Schema for free, which Fastify consumes natively for request/response validation at the wire boundary.
- A familiar, explicit syntax that survives `tsc --noEmit` checks.

Zod is the obvious alternative; it is picked over by TypeBox specifically because TypeBox emits JSON Schema directly, which the API framework (Fastify) can consume without an adapter. Zod requires `zod-to-json-schema` as a translation step — one more place for drift to hide.

## Decision

The system is implemented in TypeScript end-to-end. All four FR-021 contracts are authored once in TypeBox (`@sinclair/typebox`) and exported from `@neo-search/contracts`. Both sides of every boundary import the same module — there is no copy of any contract type anywhere else in the codebase.

This decision pins:

- Language: TypeScript 5.6.3 (per `technology/tech-stack.md`).
- Schema author tool: TypeBox 0.33.17 (per `technology/tech-stack.md`).
- Contract package: `@neo-search/contracts`. Every contract type and every record type used at a boundary lives here.
- Lint rule: a `no-restricted-imports` ESLint rule MUST forbid any package other than `@neo-search/contracts` from defining types that end in `Contract` (per `foundation/naming-conventions.md`).

## Consequences

**Positive**

- FR-021's "reusable / single definition" clause becomes a structural property: there is exactly one definition per contract, imported by both sides.
- Wire validation (Fastify) and in-process validation (agent ↔ tools) use the same schema source — drift between them is impossible.
- The contracts are the spine of the test surface: contract tests in `packages/contracts/src/__tests__/` exercise every boundary against example payloads (`technology/testing.md`).
- Onboarding a new package is fast: import `@neo-search/contracts`, you have all the shapes.

**Negative**

- A future requirement that needs Python (e.g. a Python-only ML library for synthesis) would force a polyglot escape hatch. That would be an ADR moment, not a quiet retrofit.
- TypeBox's syntax is more verbose than Zod's. Reviewers MUST be comfortable with `Type.Object({ ... })` style.
- The `@neo-search/contracts` package becomes a frequently-edited shared dependency. The team MUST keep its public surface small and the build cheap.

**Risks accepted**

- Tying every layer to one language means a regression in the TypeScript ecosystem (e.g. a `typescript@5.6.x` bug) blocks every layer simultaneously. Mitigation: dependency upgrades go via single-purpose `chore(deps):` commits per `foundation/naming-conventions.md`, with the test suite as the gate.

## References

- FR-021, FR-024.
- `technology/tech-stack.md` (pinned versions).
- `foundation/conventions.md`, `foundation/naming-conventions.md`.
- ADR 0001 (the four-layer boundary that this ADR's contracts pin).

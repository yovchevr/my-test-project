/**
 * Agent ↔ Tools boundary contract (FR-021, FR-022, FR-023).
 *
 * The single shape every tool invocation goes through. Both the registry and
 * the agent import from this module — there is no copy of these types
 * anywhere else (per `.design/foundation/naming-conventions.md`, only
 * `@neo-search/contracts` may declare a `Contract`-suffixed type).
 *
 * The discriminated `Result<T,E>` union is the cross-boundary result wrapper
 * pinned by `.design/foundation/conventions.md`: every cross-boundary call
 * MUST return one of these instead of throwing.
 */
import { Type, type Static, type TSchema } from '@sinclair/typebox';

/**
 * Descriptor every registered tool exposes. The `inputSchema` and
 * `outputSchema` fields hold JSON Schema documents; the registry uses them
 * to validate the input before the handler runs and the output before the
 * result is returned to the agent (see `.design/components/tools-layer.md`).
 *
 * `name` is restricted to lowercase kebab-case so registry lookups stay
 * case-stable across processes (per
 * `.design/foundation/naming-conventions.md`).
 */
export const ToolDescriptorContract = Type.Object(
  {
    name: Type.String({ pattern: '^[a-z][a-z0-9-]*$', minLength: 1 }),
    description: Type.String({ minLength: 1 }),
    inputSchema: Type.Unknown(),
    outputSchema: Type.Unknown(),
  },
  { $id: 'ToolDescriptorContract' },
);
export type ToolDescriptorContract = Static<typeof ToolDescriptorContract>;

/**
 * Structured tool error. `kind` is the discriminant the agent's
 * `runWithBudget` helper uses to decide whether to retry (`transient`) or
 * surface immediately (`terminal`, `validation`). See FR-023 and
 * `.design/components/agent.md` for the retry policy.
 */
export const ToolErrorContract = Type.Object(
  {
    kind: Type.Union([
      Type.Literal('transient'),
      Type.Literal('terminal'),
      Type.Literal('validation'),
    ]),
    message: Type.String({ minLength: 1 }),
    cause: Type.Optional(Type.Unknown()),
  },
  { $id: 'ToolErrorContract' },
);
export type ToolErrorContract = Static<typeof ToolErrorContract>;

/**
 * Discriminated `Result<T, E>` wrapper used at every layer boundary.
 *
 * Per `.design/foundation/conventions.md`, functions that can fail at a
 * boundary MUST return this shape rather than throwing. The discriminant is
 * `ok: boolean`; `value` carries the success payload and `error` the
 * structured failure.
 *
 * This is exposed as both a type alias (for convenient Static use) and a
 * factory `ResultContract<T, E>` that produces a TypeBox schema for the
 * pair. Callers that want a runtime validator instantiate the factory; the
 * type alias is enough for static type-checking on either side of a
 * boundary.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * TypeBox schema factory for a `Result<T, E>` union with concrete `value`
 * and `error` schemas. Used wherever a contract module needs the runtime
 * validator (e.g. `AgentSearchResponseContract`).
 */
export const ResultContract = <T extends TSchema, E extends TSchema>(value: T, error: E) =>
  Type.Union([
    Type.Object({ ok: Type.Literal(true), value }),
    Type.Object({ ok: Type.Literal(false), error }),
  ]);

/**
 * The handler signature every tool implementation MUST satisfy. Tools accept
 * an input matching their declared `inputSchema` plus an `AbortSignal`
 * (forwarded from the agent's request budget per NFR-005), and return a
 * `Result<O, ToolErrorContract>` — never a thrown exception (I-26).
 */
export type ToolHandler<I, O> = (
  input: I,
  signal: AbortSignal,
) => Promise<Result<O, ToolErrorContract>>;

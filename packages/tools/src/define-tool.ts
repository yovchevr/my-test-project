/**
 * `defineTool` — the typed seam every tool author goes through.
 *
 * Per STORY-003: tools register themselves with a descriptor (name,
 * description, input/output JSON Schemas) and a handler returning
 * `Result<O, ToolError>`. `defineTool` produces a `RegisteredTool<I, O>`
 * whose input and output types are derived from the TypeBox schemas via
 * `Static<>`. The registry stores the descriptor as plain JSON Schema (per
 * `ToolDescriptorContract` from `@neo-search/contracts`, where `inputSchema`
 * and `outputSchema` are `Type.Unknown()`), but `defineTool` keeps the
 * compile-time types intact for the handler.
 *
 * ### Why this wraps the MCP SDK rather than re-exporting it
 *
 * STORY-003's risk note explicitly accepts that "the MCP SDK's in-process
 * registration ergonomics may not match `defineTool` 1:1 — `defineTool`
 * wraps the SDK; the public surface stays as documented even if the
 * internal call shape differs." The MCP SDK's primary entry point is a
 * server with stdio/sse/http transports; in-process invocation per OQ-002
 * does not need the transport layer. The descriptor shape exposed here is
 * structurally identical to MCP's `Tool` type (name + description +
 * inputSchema + outputSchema), so swapping in an MCP server later (a
 * future ADR per `.design/components/tools-layer.md`'s "Variation NOT
 * accommodated" section) is a non-breaking change for tool authors.
 */
import type { Static, TSchema } from '@sinclair/typebox';
import type { Result, ToolErrorContract } from '@neo-search/contracts';

/**
 * Strongly-typed descriptor shape that `defineTool` accepts. The
 * `inputSchema` and `outputSchema` MUST be TypeBox schemas — they carry the
 * `Static<>` type tags the handler signature depends on. The wider
 * `ToolDescriptorContract` from `@neo-search/contracts` keeps the schemas
 * as opaque JSON Schema objects, which is what gets stored on the registry
 * and exposed via `list()`.
 */
export interface ToolDescriptor<TInput extends TSchema, TOutput extends TSchema> {
  /** Unique kebab-case tool identifier (FR-022, naming-conventions). */
  readonly name: string;
  /** Human-readable purpose. Logged on every invocation for traceability. */
  readonly description: string;
  /** TypeBox schema validated against `input` BEFORE the handler runs. */
  readonly inputSchema: TInput;
  /** TypeBox schema validated against `value` AFTER a successful handler run. */
  readonly outputSchema: TOutput;
}

/**
 * Handler signature for a tool authored via `defineTool`. Mirrors
 * `ToolHandler<I, O>` from `@neo-search/contracts` but with the input and
 * output types pinned to the descriptor's TypeBox schemas via `Static<>`.
 *
 * Per I-26, the handler MUST NOT throw across the tool boundary. The
 * registry catches throws defensively and converts them into a `terminal`
 * error, but tools SHOULD return structured `Result<O, ToolErrorContract>`
 * values directly.
 */
export type RegisteredToolHandler<TInput extends TSchema, TOutput extends TSchema> = (
  input: Static<TInput>,
  signal: AbortSignal,
) => Promise<Result<Static<TOutput>, ToolErrorContract>>;

/**
 * The opaque, typed registration record produced by `defineTool` and
 * consumed by `ToolRegistry.register`.
 *
 * Tool packages MUST construct this only via `defineTool` so the descriptor
 * and handler stay type-aligned.
 */
export interface RegisteredTool<TInput extends TSchema, TOutput extends TSchema> {
  readonly descriptor: ToolDescriptor<TInput, TOutput>;
  readonly handler: RegisteredToolHandler<TInput, TOutput>;
}

/**
 * Build a `RegisteredTool<I, O>` from a typed descriptor and handler.
 *
 * The function is essentially an identity that pins the generic parameters
 * for downstream consumers — this is what gives tool authors a single
 * call-site where the input/output types of the handler are checked
 * against the schema's `Static<>` projection.
 *
 * ### Failure modes
 * - None at this call-site. `defineTool` does not validate `name` against
 *   the kebab-case rule — that lives on the registry's `register` because
 *   the wider `ToolDescriptorContract` schema check runs there. Splitting
 *   the check would duplicate enforcement.
 *
 * @example
 *   const echoTool = defineTool({
 *     descriptor: {
 *       name: 'echo',
 *       description: 'Echoes its input verbatim',
 *       inputSchema: Type.Object({ text: Type.String() }),
 *       outputSchema: Type.Object({ text: Type.String() }),
 *     },
 *     handler: async (input) => ({ ok: true, value: input }),
 *   });
 */
export function defineTool<TInput extends TSchema, TOutput extends TSchema>(args: {
  descriptor: ToolDescriptor<TInput, TOutput>;
  handler: RegisteredToolHandler<TInput, TOutput>;
}): RegisteredTool<TInput, TOutput> {
  return { descriptor: args.descriptor, handler: args.handler };
}

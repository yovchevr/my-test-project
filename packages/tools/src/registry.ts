/**
 * `ToolRegistry` — the single seam between the agent and the rest of the
 * world per ADR 0001 (`.design/decisions/0001-layer-boundaries.md`).
 *
 * The registry is stateless beyond the registration map, contains no
 * business logic, and MUST NOT throw across the `invoke` boundary (I-26 in
 * `.design/domain/invariants.md`). Retries live in
 * `services/agent/src/run-with-budget.ts` (STORY-011); this registry MUST
 * NOT loop, retry, or schedule timers.
 *
 * STORY-003 acceptance criteria pinned here:
 * - Input validation runs BEFORE the handler. Mismatch → `validation`
 *   error and the handler is NOT called.
 * - Output validation runs AFTER the handler returns success. Mismatch →
 *   `terminal` (the tool returned malformed data; that is the tool's bug,
 *   not transient — per `.design/components/tools-layer.md`).
 * - Handler throws are caught and converted to `terminal`; the request
 *   never crashes.
 * - `AbortSignal` is forwarded unchanged to the handler.
 * - Unknown tool name → `validation` with `unknown-tool: <name>`.
 * - Duplicate `register` → throws (startup misconfiguration; legal here
 *   because per-invocation throws are the banned ones).
 * - Every `invoke` emits a structured `tools.invoked` log line.
 */
import type { Static, TSchema } from '@sinclair/typebox';
import { TypeCompiler, type TypeCheck } from '@sinclair/typebox/compiler';
import type { Result, ToolDescriptorContract, ToolErrorContract } from '@neo-search/contracts';
import type { RegisteredTool } from './define-tool.js';
import { DuplicateToolError } from './errors.js';
import { defaultLogger, type Logger } from './logger.js';

/**
 * Public registry contract the agent depends on. The agent obtains an
 * instance from `createRegistry()` at startup; tool selection is by `name`
 * lookup (FR-022, NFR-006) — never by direct module import.
 *
 * `invoke` is generic over `<I, O>` to keep call-sites typed; runtime
 * safety comes from the registered descriptor's TypeBox `inputSchema` and
 * `outputSchema`, which the registry validates regardless of the caller's
 * generics.
 */
export interface ToolRegistry {
  /**
   * Add a tool to the registry. MUST be called before the first `invoke`
   * (typically at the composition root). Throws `DuplicateToolError` if
   * `tool.descriptor.name` is already registered — startup misconfiguration
   * is the only legal throw site (I-26 bans per-invocation throws).
   */
  register<TInput extends TSchema, TOutput extends TSchema>(
    tool: RegisteredTool<TInput, TOutput>,
  ): void;

  /**
   * Snapshot of every registered tool's descriptor, frozen so callers
   * cannot mutate the registry's state. Order is registration order.
   */
  list(): readonly ToolDescriptorContract[];

  /**
   * Invoke a registered tool by `name`. Validates the input against the
   * tool's `inputSchema`, runs the handler with the supplied `signal`,
   * validates the success value against the `outputSchema`, and returns
   * the `Result`. NEVER throws — every failure mode (unknown tool,
   * validation mismatch, handler throw, schema-violating output, mid-
   * validation cancellation) is converted into a structured
   * `ToolErrorContract`.
   *
   * The generics `<I, O>` are caller-side type assertions; the registry
   * validates the actual values against the registered schemas regardless.
   */
  invoke<I, O>(name: string, input: I, signal: AbortSignal): Promise<Result<O, ToolErrorContract>>;
}

/**
 * Internal map entry. We compile the input/output validators once at
 * registration time so per-invocation overhead is a single function call.
 */
interface RegistryEntry<TInput extends TSchema, TOutput extends TSchema> {
  readonly descriptor: ToolDescriptorContract;
  readonly inputCheck: TypeCheck<TInput>;
  readonly outputCheck: TypeCheck<TOutput>;
  readonly handler: RegisteredTool<TInput, TOutput>['handler'];
}

/**
 * Build the JSON Schema view of a TypeBox schema for the
 * `ToolDescriptorContract` shape. TypeBox schemas ARE JSON Schema objects
 * at runtime, so this is structurally a passthrough — the cast is here so
 * `list()` returns the contract type without leaking the TypeBox-specific
 * `TSchema` brand.
 */
const toContractDescriptor = <TInput extends TSchema, TOutput extends TSchema>(d: {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
}): ToolDescriptorContract => ({
  name: d.name,
  description: d.description,
  inputSchema: d.inputSchema,
  outputSchema: d.outputSchema,
});

const validationError = (message: string): ToolErrorContract => ({
  kind: 'validation',
  message,
});

const terminalError = (message: string, cause?: unknown): ToolErrorContract =>
  cause === undefined ? { kind: 'terminal', message } : { kind: 'terminal', message, cause };

/**
 * Stringify a TypeBox validation error list into a single human-readable
 * message. We lift the path + message of every error so a tool author can
 * see exactly which field failed.
 */
const describeErrors = (
  errors: Iterable<{ path: string; message: string }>,
  prefix: string,
): string => {
  const parts: string[] = [];
  for (const e of errors) {
    parts.push(`${e.path || '/'} ${e.message}`);
  }
  return `${prefix}: ${parts.join('; ')}`;
};

/**
 * Construct a fresh, empty `ToolRegistry`.
 *
 * The registry holds tools keyed by `descriptor.name`. Registration is
 * one-shot per name — re-registering throws `DuplicateToolError` (legal
 * startup throw per `.design/components/tools-layer.md`'s "Unique names"
 * clause). The `logger` parameter is optional; a default sink that writes
 * one JSON line per invocation to stdout is used when omitted.
 */
export function createRegistry(options: { logger?: Logger } = {}): ToolRegistry {
  const logger = options.logger ?? defaultLogger;
  // Untyped at the storage layer; TypeBox checks erase the generics anyway.
  // The cast is contained — every call into an entry re-applies its known I/O.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = new Map<string, RegistryEntry<any, any>>();

  const register: ToolRegistry['register'] = (tool) => {
    const name = tool.descriptor.name;
    if (entries.has(name)) {
      // Per STORY-003: duplicate registration MUST throw at registration
      // time. This is the ONLY throw the registry performs — `invoke`
      // never throws.
      throw new DuplicateToolError(name);
    }
    entries.set(name, {
      descriptor: toContractDescriptor(tool.descriptor),
      inputCheck: TypeCompiler.Compile(tool.descriptor.inputSchema),
      outputCheck: TypeCompiler.Compile(tool.descriptor.outputSchema),
      handler: tool.handler,
    });
  };

  const list: ToolRegistry['list'] = () => {
    const out: ToolDescriptorContract[] = [];
    for (const entry of entries.values()) {
      out.push(entry.descriptor);
    }
    return Object.freeze(out);
  };

  const invoke: ToolRegistry['invoke'] = async <I, O>(
    name: string,
    input: I,
    signal: AbortSignal,
  ): Promise<Result<O, ToolErrorContract>> => {
    const entry = entries.get(name);
    if (entry === undefined) {
      const message = `unknown-tool: ${name}`;
      logger.log('warn', { name, outcome: 'validation', reason: 'unknown-tool' });
      return { ok: false, error: validationError(message) };
    }

    // Cancellation can fire at any point; if the agent's runWithBudget has
    // already aborted before we even validate, surface it as terminal per
    // STORY-003. The registry MUST NOT loop / wait — we just check once.
    if (signal.aborted) {
      logger.log('warn', {
        name,
        outcome: 'terminal',
        reason: 'cancelled-during-validation',
      });
      return {
        ok: false,
        error: terminalError('cancelled-during-validation', signal.reason),
      };
    }

    // Input validation BEFORE the handler. AC: handler MUST NOT be called
    // when input validation fails (asserted by a spy in registry.test.ts).
    if (!entry.inputCheck.Check(input)) {
      const message = describeErrors(entry.inputCheck.Errors(input), 'input');
      logger.log('warn', {
        name,
        outcome: 'validation',
        validationFailedOn: 'input',
      });
      return { ok: false, error: validationError(message) };
    }

    let result: Result<unknown, ToolErrorContract>;
    try {
      // Forward the AbortSignal unchanged. Per
      // .design/components/tools-layer.md, the handler MUST honor the
      // signal — but this registry is signal-agnostic and just forwards.
      result = await entry.handler(input, signal);
    } catch (cause) {
      // I-26: a thrown handler MUST be converted to terminal, never
      // re-thrown out of `invoke`. The original error is preserved on
      // `cause` so callers (and logs) can recover the stack.
      const message = cause instanceof Error ? `handler-threw: ${cause.message}` : 'handler-threw';
      logger.log('error', {
        name,
        outcome: 'terminal',
        reason: 'handler-threw',
      });
      return { ok: false, error: terminalError(message, cause) };
    }

    if (!result.ok) {
      // The handler reported a structured failure — forward unchanged.
      logger.log('warn', { name, outcome: result.error.kind });
      return { ok: false, error: result.error };
    }

    // Output validation AFTER the handler returns success. A schema
    // mismatch is the tool's bug, hence terminal (not transient) per
    // .design/components/tools-layer.md.
    if (!entry.outputCheck.Check(result.value)) {
      const message = describeErrors(entry.outputCheck.Errors(result.value), 'output');
      logger.log('error', {
        name,
        outcome: 'terminal',
        validationFailedOn: 'output',
      });
      return { ok: false, error: terminalError(message) };
    }

    if (signal.aborted) {
      // Defensive: the handler returned but cancellation fired during the
      // brief window before the output validator finished. Treat as
      // terminal per the same rationale as the pre-handler abort case.
      logger.log('warn', {
        name,
        outcome: 'terminal',
        reason: 'cancelled-during-validation',
      });
      return {
        ok: false,
        error: terminalError('cancelled-during-validation', signal.reason),
      };
    }

    logger.log('info', { name, outcome: 'ok' });
    // The compile-time generic O is the caller's assertion; the validator
    // above is the runtime guarantee that `result.value` matches the
    // registered output schema. Cast through the schema's Static type.
    return { ok: true, value: result.value as Static<TSchema> as O };
  };

  return { register, list, invoke };
}

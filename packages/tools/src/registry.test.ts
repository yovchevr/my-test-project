/**
 * Unit tests for the MCP-style tool registry (STORY-003).
 *
 * Each `describe` block maps to one of the eight acceptance criteria from
 * `.stories/project-spec/STORY-003-tool-registry.md`. The block titles cite
 * the AC verbatim so a reviewer can grep by criterion.
 *
 * Plus two adversarial bodies:
 *   - FR-023 round-trip: each of the four error variants (`validation`,
 *     `terminal`, `transient`, plus the registry-synthesised cancellation)
 *     survives the registry without lossy conversion.
 *   - Static `setTimeout` scan: the registry source MUST NOT reference
 *     `setTimeout` (retries belong to STORY-011 per `tools-layer.md`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@sinclair/typebox';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Result, ToolErrorContract } from '@neo-search/contracts';
import { createRegistry, defineTool, DuplicateToolError } from './index.js';
import type { Logger, ToolsInvokedLogFields } from './logger.js';

// Captured-line logger so tests can assert on `tools.invoked` emissions
// without writing to stdout. Per .design/foundation/conventions.md, a
// structured logger is required; the registry forwards every line through
// the injected `Logger`, so a captured spy is all we need here.
const captureLogger = (): {
  logger: Logger;
  lines: { level: string; fields: ToolsInvokedLogFields }[];
} => {
  const lines: { level: string; fields: ToolsInvokedLogFields }[] = [];
  return {
    logger: { log: (level, fields) => lines.push({ level, fields }) },
    lines,
  };
};

// A small, well-formed echo tool reused across cases. The descriptor matches
// the kebab-case rule pinned by ToolDescriptorContract.
const echoInput = Type.Object({ text: Type.String({ minLength: 1 }) });
const echoOutput = Type.Object({ text: Type.String() });

const buildEchoTool = (
  handler: (input: { text: string }) => Promise<Result<{ text: string }, ToolErrorContract>>,
) =>
  defineTool({
    descriptor: {
      name: 'echo',
      description: 'Echoes its input verbatim',
      inputSchema: echoInput,
      outputSchema: echoOutput,
    },
    handler: async (input, _signal) => handler(input),
  });

describe('AC: register + invoke happy path returns the handler Result unchanged', () => {
  it('forwards `{ ok: true, value }` from the handler when value matches outputSchema', async () => {
    const cap = captureLogger();
    const registry = createRegistry({ logger: cap.logger });
    registry.register(buildEchoTool(async (input) => ({ ok: true, value: input })));

    const result = await registry.invoke<{ text: string }, { text: string }>(
      'echo',
      { text: 'hello' },
      new AbortController().signal,
    );

    expect(result).toEqual({ ok: true, value: { text: 'hello' } });
    expect(cap.lines).toHaveLength(1);
    expect(cap.lines[0]?.fields).toMatchObject({ name: 'echo', outcome: 'ok' });
  });

  it('forwards `{ ok: false, error }` from the handler unchanged', async () => {
    const transientError: ToolErrorContract = {
      kind: 'transient',
      message: 'upstream timeout',
    };
    const cap = captureLogger();
    const registry = createRegistry({ logger: cap.logger });
    registry.register(buildEchoTool(async () => ({ ok: false, error: transientError })));

    const result = await registry.invoke('echo', { text: 'x' }, new AbortController().signal);

    expect(result).toEqual({ ok: false, error: transientError });
    expect(cap.lines[0]?.fields.outcome).toBe('transient');
  });
});

describe('AC: input that fails inputSchema → validation error AND handler not called', () => {
  it('returns `{ ok: false, error: { kind: "validation", message } }` and does not invoke the spy', async () => {
    const handlerSpy = vi.fn().mockResolvedValue({ ok: true, value: { text: 'never' } });
    const tool = defineTool({
      descriptor: {
        name: 'echo',
        description: 'Echoes its input verbatim',
        inputSchema: echoInput,
        outputSchema: echoOutput,
      },
      handler: handlerSpy,
    });
    const cap = captureLogger();
    const registry = createRegistry({ logger: cap.logger });
    registry.register(tool);

    // `text: 42` is the wrong type and `text: ""` violates minLength.
    const result = await registry.invoke('echo', { text: 42 }, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('validation');
    expect(result.error.message).toMatch(/text|input/i);
    expect(handlerSpy).not.toHaveBeenCalled();
    expect(cap.lines[0]?.fields).toMatchObject({
      name: 'echo',
      outcome: 'validation',
      validationFailedOn: 'input',
    });
  });
});

describe('AC: handler returns a value that fails outputSchema → terminal error', () => {
  it('returns `{ ok: false, error: { kind: "terminal", message } }`', async () => {
    const tool = defineTool({
      descriptor: {
        name: 'echo',
        description: 'Echoes its input verbatim',
        inputSchema: echoInput,
        // Strict output: requires a `text` property of type string.
        outputSchema: echoOutput,
      },
      // Handler returns a value missing the required `text` field — bug per tools-layer.md.
      handler: async () =>
        ({ ok: true, value: { wrong: 'shape' } }) as unknown as Result<
          { text: string },
          ToolErrorContract
        >,
    });
    const cap = captureLogger();
    const registry = createRegistry({ logger: cap.logger });
    registry.register(tool);

    const result = await registry.invoke('echo', { text: 'ok' }, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toMatch(/output/i);
    expect(cap.lines[0]?.fields).toMatchObject({
      name: 'echo',
      outcome: 'terminal',
      validationFailedOn: 'output',
    });
  });
});

describe('AC: handler throws → terminal error AND request does not crash', () => {
  it('catches the throw and returns terminal with the cause attached', async () => {
    const tool = defineTool({
      descriptor: {
        name: 'echo',
        description: 'Echoes its input verbatim',
        inputSchema: echoInput,
        outputSchema: echoOutput,
      },
      handler: async () => {
        throw new Error('boom');
      },
    });
    const cap = captureLogger();
    const registry = createRegistry({ logger: cap.logger });
    registry.register(tool);

    // Wrap in expect().resolves to assert the promise does NOT reject —
    // proving the registry never re-throws across its boundary (I-26).
    const promise = registry.invoke('echo', { text: 'x' }, new AbortController().signal);
    await expect(promise).resolves.toBeDefined();

    const result = await promise;
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toMatch(/handler-threw.*boom/);
    // Cause is preserved so callers can recover the stack.
    expect(result.error.cause).toBeInstanceOf(Error);
    expect((result.error.cause as Error).message).toBe('boom');
    expect(cap.lines[0]?.fields).toMatchObject({
      name: 'echo',
      outcome: 'terminal',
      reason: 'handler-threw',
    });
  });
});

describe('AC: invoke for an unknown tool name → validation with `unknown-tool: <name>`', () => {
  it('returns the documented validation error and emits a structured log line', async () => {
    const cap = captureLogger();
    const registry = createRegistry({ logger: cap.logger });

    const result = await registry.invoke('does-not-exist', {}, new AbortController().signal);

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', message: 'unknown-tool: does-not-exist' },
    });
    expect(cap.lines[0]?.fields).toMatchObject({
      name: 'does-not-exist',
      outcome: 'validation',
      reason: 'unknown-tool',
    });
  });
});

describe('AC: register throws on duplicate name; invoke never throws', () => {
  it('throws DuplicateToolError when the same name is registered twice', () => {
    const registry = createRegistry({ logger: captureLogger().logger });
    const tool = buildEchoTool(async (input) => ({ ok: true, value: input }));
    registry.register(tool);

    expect(() => registry.register(tool)).toThrow(DuplicateToolError);
    expect(() => registry.register(tool)).toThrow(/duplicate-tool: echo/);
  });

  it('never throws from invoke even when the handler throws', async () => {
    const tool = defineTool({
      descriptor: {
        name: 'thrower',
        description: 'Always throws',
        inputSchema: Type.Object({}),
        outputSchema: Type.Object({}),
      },
      handler: async () => {
        // Two consecutive throws of different shapes — neither MUST escape.
        throw 'a string is not an Error';
      },
    });
    const registry = createRegistry({ logger: captureLogger().logger });
    registry.register(tool);

    await expect(
      registry.invoke('thrower', {}, new AbortController().signal),
    ).resolves.toMatchObject({
      ok: false,
      error: { kind: 'terminal' },
    });
  });
});

describe('AC: AbortSignal is forwarded unchanged to the handler', () => {
  it('passes the same signal instance to the handler', async () => {
    const seen: AbortSignal[] = [];
    const tool = defineTool({
      descriptor: {
        name: 'echo',
        description: 'Echoes its input verbatim',
        inputSchema: echoInput,
        outputSchema: echoOutput,
      },
      handler: async (input, signal) => {
        seen.push(signal);
        return { ok: true, value: input };
      },
    });
    const registry = createRegistry({ logger: captureLogger().logger });
    registry.register(tool);

    const ac = new AbortController();
    await registry.invoke('echo', { text: 'x' }, ac.signal);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(ac.signal);
  });

  it('returns terminal `cancelled-during-validation` if the signal is already aborted', async () => {
    const handlerSpy = vi.fn().mockResolvedValue({ ok: true, value: { text: 'never' } });
    const tool = defineTool({
      descriptor: {
        name: 'echo',
        description: 'Echoes its input verbatim',
        inputSchema: echoInput,
        outputSchema: echoOutput,
      },
      handler: handlerSpy,
    });
    const registry = createRegistry({ logger: captureLogger().logger });
    registry.register(tool);

    const ac = new AbortController();
    ac.abort(new Error('budget-exceeded'));

    const result = await registry.invoke('echo', { text: 'x' }, ac.signal);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'terminal', message: 'cancelled-during-validation' },
    });
    expect(handlerSpy).not.toHaveBeenCalled();
  });
});

describe('AC: list() returns the registered descriptors', () => {
  it('returns a frozen, registration-ordered snapshot', () => {
    const registry = createRegistry({ logger: captureLogger().logger });
    registry.register(
      defineTool({
        descriptor: {
          name: 'one',
          description: 'first',
          inputSchema: Type.Object({}),
          outputSchema: Type.Object({}),
        },
        handler: async () => ({ ok: true, value: {} }),
      }),
    );
    registry.register(
      defineTool({
        descriptor: {
          name: 'two',
          description: 'second',
          inputSchema: Type.Object({}),
          outputSchema: Type.Object({}),
        },
        handler: async () => ({ ok: true, value: {} }),
      }),
    );

    const listed = registry.list();
    expect(listed.map((d) => d.name)).toEqual(['one', 'two']);
    expect(Object.isFrozen(listed)).toBe(true);
  });
});

describe('AC: registry MUST NOT contain a retry loop, backoff timer, or setTimeout reference', () => {
  // This is a static guard: a reviewer or a regression could re-introduce
  // retry logic into the registry, but per `.design/components/tools-layer.md`
  // retries live in services/agent's `runWithBudget`. The story spells this
  // out as an explicit AC. We scan the source files at test time, stripping
  // comments first so a doc-comment that names what is forbidden does not
  // itself trip the check.
  const here = dirname(fileURLToPath(import.meta.url));

  // Strip /* ... */ block comments and // line comments. Crude but
  // sufficient for the registry's own source — we do not have JSX or
  // strings that look like comments.
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(['registry.ts', 'define-tool.ts', 'errors.ts', 'logger.ts', 'index.ts'])(
    'src/%s contains no setTimeout / setInterval / retry-loop references in code',
    (file) => {
      const code = stripComments(readFileSync(join(here, file), 'utf8'));
      expect(code).not.toMatch(/\bsetTimeout\s*\(/);
      expect(code).not.toMatch(/\bsetInterval\s*\(/);
      // Also forbid obvious retry vocabulary in the registry's surface —
      // these identifiers belong to runWithBudget (STORY-011).
      if (file === 'registry.ts') {
        expect(code).not.toMatch(/\bretry\b/i);
        expect(code).not.toMatch(/\bbackoff\b/i);
      }
    },
  );
});

describe('FR-023 round-trip: each error variant survives invoke without lossy conversion', () => {
  // The registry's job is to NOT mangle a structured handler error. Here
  // we feed each `kind` through a handler that returns it verbatim and
  // assert byte-for-byte forwarding (modulo the cancellation case, which
  // the registry synthesises locally).
  const variants = [
    { kind: 'transient', message: 'connection-reset' },
    { kind: 'terminal', message: 'auth-failed' },
    { kind: 'validation', message: 'bad-cursor' },
  ] as const;

  it.each(variants)('forwards $kind unchanged', async (error) => {
    const tool = defineTool({
      descriptor: {
        name: 'pass-through',
        description: 'Returns the supplied error verbatim',
        inputSchema: Type.Object({}),
        outputSchema: Type.Object({}),
      },
      handler: async () => ({ ok: false, error }),
    });
    const registry = createRegistry({ logger: captureLogger().logger });
    registry.register(tool);

    const result = await registry.invoke('pass-through', {}, new AbortController().signal);

    expect(result).toEqual({ ok: false, error });
  });

  it('synthesises `terminal` cancellation when signal aborts before validation', async () => {
    // Already covered in the AbortSignal block; this duplicates the
    // assertion under the FR-023 banner so a reviewer searching for the
    // error-taxonomy round-trip finds all four variants together.
    const tool = buildEchoTool(async (input) => ({ ok: true, value: input }));
    const registry = createRegistry({ logger: captureLogger().logger });
    registry.register(tool);
    const ac = new AbortController();
    ac.abort();

    const result = await registry.invoke('echo', { text: 'x' }, ac.signal);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'terminal', message: 'cancelled-during-validation' },
    });
  });
});

describe('Logging: every invoke emits a tools.invoked structured log line', () => {
  // A direct restate of the structured-log requirement from the story scope
  // ("MUST emit a structured `tools.invoked` log with `name`, `outcome`,
  // `validationFailedOn` if applicable").
  let cap: ReturnType<typeof captureLogger>;
  beforeEach(() => {
    cap = captureLogger();
  });
  afterEach(() => {
    cap.lines.length = 0;
  });

  it('emits exactly one line per invoke (success path)', async () => {
    const registry = createRegistry({ logger: cap.logger });
    registry.register(buildEchoTool(async (i) => ({ ok: true, value: i })));
    await registry.invoke('echo', { text: 'a' }, new AbortController().signal);
    expect(cap.lines).toHaveLength(1);
    expect(cap.lines[0]).toMatchObject({
      level: 'info',
      fields: { name: 'echo', outcome: 'ok' },
    });
  });

  it('records `validationFailedOn: "input"` when the input fails the schema', async () => {
    const registry = createRegistry({ logger: cap.logger });
    registry.register(buildEchoTool(async (i) => ({ ok: true, value: i })));
    await registry.invoke('echo', { text: 42 }, new AbortController().signal);
    expect(cap.lines[0]?.fields).toMatchObject({
      validationFailedOn: 'input',
      outcome: 'validation',
    });
  });

  it('records `validationFailedOn: "output"` when the handler returns a malformed value', async () => {
    const tool = defineTool({
      descriptor: {
        name: 'broken',
        description: 'Always returns an output that fails its schema',
        inputSchema: Type.Object({}),
        outputSchema: Type.Object({ text: Type.String() }),
      },
      handler: async () =>
        ({ ok: true, value: { wrong: 'shape' } }) as unknown as Result<
          { text: string },
          ToolErrorContract
        >,
    });
    const registry = createRegistry({ logger: cap.logger });
    registry.register(tool);
    await registry.invoke('broken', {}, new AbortController().signal);
    expect(cap.lines[0]?.fields).toMatchObject({
      validationFailedOn: 'output',
      outcome: 'terminal',
    });
  });
});

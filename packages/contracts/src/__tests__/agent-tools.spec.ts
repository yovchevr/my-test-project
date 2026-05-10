/**
 * Contract test for the Agent ↔ Tools boundary (FR-021, FR-022, FR-023).
 *
 * Covers:
 *  - `ToolDescriptorContract` `name` pattern (lowercase kebab-case per
 *    naming-conventions.md and `components/tools-layer.md`).
 *  - `ToolErrorContract` `kind` discriminant ("transient" | "terminal" |
 *    "validation") per FR-023.
 *  - `Result<T,E>` discriminant on `ok: boolean` per
 *    `.design/foundation/conventions.md`.
 */
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import { ResultContract, ToolDescriptorContract, ToolErrorContract } from '../index.js';

describe('ToolDescriptorContract', () => {
  it('accepts a well-formed descriptor with a kebab-case name', () => {
    const descriptor = {
      name: 'web-search',
      description: 'Live web search via Tavily',
      inputSchema: {},
      outputSchema: {},
    };
    expect(Value.Check(ToolDescriptorContract, descriptor)).toBe(true);
  });

  it('rejects an upper-case tool name (kebab-case rule)', () => {
    const descriptor = {
      name: 'WebSearch',
      description: 'desc',
      inputSchema: {},
      outputSchema: {},
    };
    expect(Value.Check(ToolDescriptorContract, descriptor)).toBe(false);
  });

  it('rejects a name with an underscore', () => {
    const descriptor = {
      name: 'web_search',
      description: 'desc',
      inputSchema: {},
      outputSchema: {},
    };
    expect(Value.Check(ToolDescriptorContract, descriptor)).toBe(false);
  });

  it('rejects an empty description', () => {
    const descriptor = {
      name: 'web-search',
      description: '',
      inputSchema: {},
      outputSchema: {},
    };
    expect(Value.Check(ToolDescriptorContract, descriptor)).toBe(false);
  });
});

describe('ToolErrorContract — FR-023 kind discriminant', () => {
  it.each(['transient', 'terminal', 'validation'])('accepts kind=%s', (kind) => {
    expect(Value.Check(ToolErrorContract, { kind, message: 'oops' })).toBe(true);
  });

  it('rejects an unknown kind (e.g. "fatal")', () => {
    expect(Value.Check(ToolErrorContract, { kind: 'fatal', message: 'oops' })).toBe(false);
  });

  it('rejects an empty message', () => {
    expect(Value.Check(ToolErrorContract, { kind: 'terminal', message: '' })).toBe(false);
  });

  it('accepts an error with an optional cause', () => {
    expect(
      Value.Check(ToolErrorContract, {
        kind: 'transient',
        message: 'connect ECONNRESET',
        cause: { errno: 'ECONNRESET' },
      }),
    ).toBe(true);
  });
});

describe('Result<T,E> — discriminant on ok:boolean (conventions.md)', () => {
  const schema = ResultContract(Type.Number(), Type.String());

  it('accepts the success variant', () => {
    expect(Value.Check(schema, { ok: true, value: 42 })).toBe(true);
  });

  it('accepts the failure variant', () => {
    expect(Value.Check(schema, { ok: false, error: 'nope' })).toBe(true);
  });

  it('rejects a payload missing the ok discriminant', () => {
    expect(Value.Check(schema, { value: 42 })).toBe(false);
  });

  it('rejects a success variant whose value type does not match', () => {
    expect(Value.Check(schema, { ok: true, value: 'not a number' })).toBe(false);
  });

  it('rejects a failure variant whose error type does not match', () => {
    expect(Value.Check(schema, { ok: false, error: 42 })).toBe(false);
  });

  it('rejects a payload that mixes the two variants', () => {
    expect(Value.Check(schema, { ok: true, error: 'nope' })).toBe(false);
  });
});

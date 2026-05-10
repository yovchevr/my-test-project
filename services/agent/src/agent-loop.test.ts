/**
 * Unit tests for the agent loop (STORY-011).
 *
 * Each `describe` block targets one acceptance criterion verbatim; spies on
 * a fake registry assert the per-source-filter call sequences pinned in
 * the story scope.
 *
 * The tests use a passthrough fake `synthesize` (per the story scope:
 * "this story uses a passthrough fake in tests") so the loop body can be
 * verified without an LLM call. STORY-012 ships the real synthesis.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentSearchResponseContract,
  DataStoreInputContract,
  DataStoreOutputContract,
  ResultCardContract,
  Result,
  ToolErrorContract,
  WebSearchInputContract,
  WebSearchOutputContract,
} from '@neo-search/contracts';
import type { ToolRegistry } from '@neo-search/tools';
import { createAgent, type SynthesisFn } from './index.js';
import type { AgentLogger, AgentToolInvokedFields } from './index.js';
import type { Clock } from './run-with-budget.js';

// -----------------------------------------------------------------------------
// Test infrastructure: a fake registry, a deterministic clock, and a fake
// synthesizer. We do NOT touch the real registry or the real tool packages
// here — those are exercised in `agent-loop.spec.ts` (integration).
// -----------------------------------------------------------------------------

interface RegistryCall {
  readonly tool: string;
  readonly input: unknown;
}

interface FakeRegistry extends ToolRegistry {
  readonly calls: readonly RegistryCall[];
}

const createFakeRegistry = (
  responses: Record<
    string,
    | Result<unknown, ToolErrorContract>
    | ((input: unknown, signal: AbortSignal) => Promise<Result<unknown, ToolErrorContract>>)
  >,
): FakeRegistry => {
  const calls: RegistryCall[] = [];
  return {
    register: () => {
      throw new Error('not used in tests');
    },
    list: () => [],
    invoke: async <I, O>(
      name: string,
      input: I,
      signal: AbortSignal,
    ): Promise<Result<O, ToolErrorContract>> => {
      calls.push({ tool: name, input });
      const handler = responses[name];
      if (handler === undefined) {
        return {
          ok: false,
          error: { kind: 'validation', message: `unknown-tool: ${name}` },
        };
      }
      const r = typeof handler === 'function' ? await handler(input, signal) : handler;
      return r as Result<O, ToolErrorContract>;
    },
    get calls() {
      return calls;
    },
  };
};

// A passive clock for the unit tests here — waits resolve only when their
// signal aborts. The unit tests never want the budget to elapse (that
// scenario is owned by the dedicated "hangs past 10s budget" case below
// and by `run-with-budget.test.ts`); they want each retry's backoff to
// resolve quickly enough that the test does not block on real time.
//
// We resolve the backoff on a microtask tick rather than immediately so the
// helper's promise chain has time to attach its `signal.aborted` check to
// the next iteration of the loop. The budget wait (10_000ms) never resolves
// here because no signal aborts it — that mirrors the "no budget elapse"
// posture of every test that does not opt in to the cancelled path.
const passiveClock: Clock = {
  wait: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      // Backoff between attempts is small (500ms by default); we resolve
      // on a microtask so the agent's loop progresses without blocking on
      // wall-clock time. Larger waits (the 10_000ms budget timer) never
      // resolve here — they only fire when the upstream signal aborts.
      if (ms <= 1_000) {
        Promise.resolve().then(resolve);
        return;
      }
      const onAbort = (): void => resolve();
      signal.addEventListener('abort', onAbort, { once: true });
    }),
};

const synthFake: SynthesisFn = async (query, results, _signal) => ({
  ok: true,
  value: {
    answer_summary: `synthesis: ${query} (${results.length} results)`,
    references: results.map((r, i) => ({
      id: `ref-${i + 1}`,
      title: r.title,
      url: r.url,
      context: r.snippet,
    })),
  },
});

const sampleCard = (i: number): ResultCardContract => ({
  title: `Result ${i}`,
  snippet: `Snippet ${i}`,
  domain: 'example.com',
  url: `https://example.com/r/${i}`,
});

const okResult = <T>(value: T): Result<T, ToolErrorContract> => ({ ok: true, value });
const errResult = (error: ToolErrorContract): Result<never, ToolErrorContract> => ({
  ok: false,
  error,
});

const stableId = (() => {
  let n = 0;
  return (): string => `id-${++n}`;
})();

const stableNow = (() => {
  let ms = Date.parse('2026-05-10T12:00:00.000Z');
  return (): Date => new Date(ms++);
})();

const buildAgent = (
  registry: ToolRegistry,
  overrides?: {
    synthesize?: SynthesisFn;
    clock?: Clock;
    idGenerator?: () => string;
    now?: () => Date;
  },
) =>
  createAgent({
    registry,
    synthesize: overrides?.synthesize ?? synthFake,
    clock: overrides?.clock ?? passiveClock,
    idGenerator: overrides?.idGenerator ?? stableId,
    now: overrides?.now ?? stableNow,
  });

const liveSignal = (): AbortSignal => new AbortController().signal;

// =============================================================================
// Acceptance criteria
// =============================================================================

describe('AC: agent rejects a request that fails AgentSearchRequestContract → validation, no tool invoked', () => {
  it('returns { ok: false, error: { kind: "validation" } } for a missing query field', async () => {
    const registry = createFakeRegistry({});
    const agent = buildAgent(registry);

    const response = await agent({ sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 }, liveSignal());

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('validation');
    expect(registry.calls).toHaveLength(0);
  });

  it('returns validation for an unknown sourceFilter and does not invoke any tool', async () => {
    const registry = createFakeRegistry({});
    const agent = buildAgent(registry);

    const response = await agent(
      { query: 'q', sourceFilter: 'BOGUS', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('validation');
    expect(registry.calls).toHaveLength(0);
  });

  it('returns validation for a non-positive page', async () => {
    const registry = createFakeRegistry({});
    const agent = buildAgent(registry);

    const response = await agent(
      { query: 'q', sourceFilter: 'LIVE', page: 0, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('validation');
    expect(registry.calls).toHaveLength(0);
  });
});

describe('AC: LIVE happy path → web-search ×1 → cache.write ×1 → history.append ×1 → synthesize', () => {
  it('invokes tools in the documented order with documented inputs', async () => {
    const liveResults = [sampleCard(1), sampleCard(2)];
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: liveResults,
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') {
          return okResult<DataStoreOutputContract>({ op: 'cache.write', chunkIds: ['c-1'] });
        }
        if (i.op === 'history.append') {
          return okResult<DataStoreOutputContract>({ op: 'history.append', id: 'h-1' });
        }
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const synth = vi.fn(synthFake);
    const agent = buildAgent(registry, { synthesize: synth });
    const response = await agent(
      { query: 'integration', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('expected success');
    expect(response.value.answer_summary).toMatch(/integration.*2 results/);

    // Exactly the documented sequence.
    const sequence = registry.calls.map((c) => {
      if (c.tool === 'data-store') {
        return `data-store:${(c.input as DataStoreInputContract).op}`;
      }
      return c.tool;
    });
    expect(sequence).toEqual(['web-search', 'data-store:cache.write', 'data-store:history.append']);

    // Web-search input matches the request query (NFR-006 — the agent does
    // NOT branch on query content; it forwards verbatim).
    const webCall = registry.calls[0]?.input as WebSearchInputContract;
    expect(webCall.query).toBe('integration');
    expect(typeof webCall.maxResults).toBe('number');

    // Synthesize was called exactly once with the LIVE results.
    expect(synth).toHaveBeenCalledTimes(1);
    const synthArgs = synth.mock.calls[0];
    expect(synthArgs?.[0]).toBe('integration');
    expect(synthArgs?.[1]).toEqual(liveResults);
  });
});

describe('AC: LIVE returning zero results → still produces cache.write (empty) and history.append (I-8)', () => {
  it('preserves the I-8 invariant on empty results', async () => {
    const dataStoreSpy = vi.fn(
      async (input: unknown): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') {
          // Capture the empty-results write.
          expect(i.results).toEqual([]);
          return okResult<DataStoreOutputContract>({ op: 'cache.write', chunkIds: [] });
        }
        if (i.op === 'history.append') {
          // Capture the empty-chunk-list append.
          expect(i.entry.resultChunkIds).toEqual([]);
          return okResult<DataStoreOutputContract>({ op: 'history.append', id: 'h-empty' });
        }
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    );
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': dataStoreSpy,
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'no-results', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);

    const ops = registry.calls
      .filter((c) => c.tool === 'data-store')
      .map((c) => (c.input as DataStoreInputContract).op);
    expect(ops).toEqual(['cache.write', 'history.append']);
  });
});

describe('AC: HISTORY → no web-search; data-store history.list then cache.read; then synthesize', () => {
  it('does NOT invoke web-search, invokes the documented data-store ops, and synthesizes', async () => {
    const cachedResults = [sampleCard(10), sampleCard(11)];
    const registry = createFakeRegistry({
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'history.list') {
          return okResult<DataStoreOutputContract>({
            op: 'history.list',
            entries: [
              {
                id: 'h-1',
                query: 'cached-query',
                sourceFilter: 'LIVE',
                ts: '2026-05-10T12:00:00.000Z',
                resultChunkIds: ['c-1'],
              },
            ],
            pagination: { page: 1, totalChunks: 1, hasMore: false },
          });
        }
        if (i.op === 'cache.read') {
          // The agent reads the cached query — confirms the wiring.
          expect(i.query).toBe('cached-query');
          return okResult<DataStoreOutputContract>({
            op: 'cache.read',
            results: cachedResults,
            chunksRead: 1,
            pagination: { page: 1, totalChunks: 1, hasMore: false },
          });
        }
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const synth = vi.fn(synthFake);
    const agent = buildAgent(registry, { synthesize: synth });
    const response = await agent(
      { query: 'history-q', sourceFilter: 'HISTORY', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    expect(registry.calls.some((c) => c.tool === 'web-search')).toBe(false);

    const ops = registry.calls
      .filter((c) => c.tool === 'data-store')
      .map((c) => (c.input as DataStoreInputContract).op);
    expect(ops).toEqual(['history.list', 'cache.read']);

    // Synthesis runs uniformly for HISTORY (per agent.md "Invoke the
    // synthesis step on every search").
    expect(synth).toHaveBeenCalledTimes(1);
    expect(synth.mock.calls[0]?.[1]).toEqual(cachedResults);
  });

  it('handles an empty history page without invoking cache.read', async () => {
    const registry = createFakeRegistry({
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'history.list') {
          return okResult<DataStoreOutputContract>({
            op: 'history.list',
            entries: [],
            pagination: { page: 1, totalChunks: 0, hasMore: false },
          });
        }
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'history-q', sourceFilter: 'HISTORY', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    const ops = registry.calls
      .filter((c) => c.tool === 'data-store')
      .map((c) => (c.input as DataStoreInputContract).op);
    expect(ops).toEqual(['history.list']);
  });
});

describe('AC: BOOKMARK → no web-search; data-store bookmark.list; then synthesize', () => {
  it('does NOT invoke web-search, invokes bookmark.list, and synthesizes', async () => {
    const registry = createFakeRegistry({
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'bookmark.list') {
          return okResult<DataStoreOutputContract>({
            op: 'bookmark.list',
            entries: [
              {
                id: 'bm-1',
                kind: 'result',
                payload: sampleCard(99),
                ts: '2026-05-10T12:00:00.000Z',
              },
            ],
            pagination: { page: 1, totalChunks: 1, hasMore: false },
          });
        }
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const synth = vi.fn(synthFake);
    const agent = buildAgent(registry, { synthesize: synth });
    const response = await agent(
      { query: 'bookmark-q', sourceFilter: 'BOOKMARK', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    expect(registry.calls.some((c) => c.tool === 'web-search')).toBe(false);
    const ops = registry.calls
      .filter((c) => c.tool === 'data-store')
      .map((c) => (c.input as DataStoreInputContract).op);
    expect(ops).toEqual(['bookmark.list']);
    expect(synth).toHaveBeenCalledTimes(1);
    // Mapped result payload is forwarded.
    expect(synth.mock.calls[0]?.[1]).toEqual([sampleCard(99)]);
  });
});

describe('AC: one transient web-search failure followed by success → success after one retry', () => {
  it('returns ok with results after exactly one retry of web-search', async () => {
    let webAttempts = 0;
    const registry = createFakeRegistry({
      'web-search': async (): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
        webAttempts++;
        if (webAttempts === 1) {
          return errResult({ kind: 'transient', message: '503-from-tavily' });
        }
        return okResult<WebSearchOutputContract>({
          results: [sampleCard(1)],
          fetchedAt: '2026-05-10T12:00:00.000Z',
          provider: 'tavily',
        });
      },
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'transient-once', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    expect(webAttempts).toBe(2);
  });
});

describe('AC: two transient web-search failures followed by success → success after two retries', () => {
  it('returns ok with results after two retries (consumes both retries)', async () => {
    let webAttempts = 0;
    const registry = createFakeRegistry({
      'web-search': async (): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
        webAttempts++;
        if (webAttempts < 3) {
          return errResult({ kind: 'transient', message: `503-${webAttempts}` });
        }
        return okResult<WebSearchOutputContract>({
          results: [sampleCard(2)],
          fetchedAt: '2026-05-10T12:00:00.000Z',
          provider: 'tavily',
        });
      },
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'transient-twice', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    expect(webAttempts).toBe(3);
  });
});

describe('AC: three transient web-search failures → { ok: false, error: { kind: "transient" } }', () => {
  it('exhausts retries and surfaces transient', async () => {
    let webAttempts = 0;
    const registry = createFakeRegistry({
      'web-search': async (): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
        webAttempts++;
        return errResult({ kind: 'transient', message: `attempt-${webAttempts}-503` });
      },
      'data-store': async () => errResult({ kind: 'terminal', message: 'should not be called' }),
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'always-down', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('transient');
    expect(webAttempts).toBe(3);
    // data-store MUST NOT have been called — web-search failed terminally.
    expect(registry.calls.some((c) => c.tool === 'data-store')).toBe(false);
  });
});

describe('AC: web-search hangs past 10s budget → { ok: false, error: { kind: "cancelled" } }', () => {
  it('surfaces cancelled when the tool never resolves before the budget elapses', async () => {
    // Use the same controllable clock the run-with-budget tests use.
    interface PendingWait {
      readonly id: number;
      readonly resolve: () => void;
      remaining: number;
    }
    let now = 0;
    let nextId = 0;
    const waits: PendingWait[] = [];
    const clock: Clock = {
      wait: (ms, signal) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          const entry: PendingWait = { id: nextId++, resolve, remaining: ms };
          const onAbort = (): void => {
            const idx = waits.findIndex((w) => w.id === entry.id);
            if (idx >= 0) waits.splice(idx, 1);
            resolve();
          };
          signal.addEventListener('abort', onAbort, { once: true });
          waits.push(entry);
        }),
    };
    const advance = async (ms: number): Promise<void> => {
      now += ms;
      const ready = waits.filter((w) => {
        w.remaining -= ms;
        return w.remaining <= 0;
      });
      for (const w of ready) {
        const idx = waits.findIndex((entry) => entry.id === w.id);
        if (idx >= 0) waits.splice(idx, 1);
        w.resolve();
      }
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };

    const registry = createFakeRegistry({
      'web-search': async (
        _input,
        signal,
      ): Promise<Result<WebSearchOutputContract, ToolErrorContract>> =>
        new Promise<Result<WebSearchOutputContract, ToolErrorContract>>((resolve) => {
          const onAbort = (): void =>
            resolve(errResult({ kind: 'terminal', message: 'cancelled' }));
          if (signal.aborted) {
            resolve(errResult({ kind: 'terminal', message: 'cancelled' }));
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        }),
    });

    const agent = buildAgent(registry, { clock });
    const promise = agent(
      { query: 'hang', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    // Drain initial microtasks, then elapse the budget.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await advance(10_000);

    const response = await promise;
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('cancelled');
    expect(now).toBe(10_000);
  });
});

describe('AC: a throw from a tool handler → terminal at the agent (registry-level catch); never crashes', () => {
  it('treats a thrown handler as terminal — but tests run against the registry, not the helper', async () => {
    // The fake registry here mimics the real registry's behavior: the
    // handler's throw is caught and converted to a terminal Result.
    // In production the real registry does this — see
    // `packages/tools/src/registry.test.ts` "AC: handler throws → terminal
    // error AND request does not crash".
    const registry = createFakeRegistry({
      'web-search': async () => {
        // Convert in this fake to the same shape the real registry would
        // emit. The agent integration test (`agent-loop.spec.ts`) runs
        // against the real registry to verify this end-to-end.
        return errResult({
          kind: 'terminal',
          message: 'handler-threw: simulated throw',
        });
      },
      'data-store': async () => errResult({ kind: 'terminal', message: 'should not be called' }),
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'thrower', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('terminal');
    expect(response.error.message).toMatch(/handler-threw/);
  });
});

describe('AC: agent NEVER contains a switch (sourceFilter) — routing is a lookup table (NFR-006 / I-22 / I-24)', () => {
  // Static AST-ish scan: read agent-loop.ts and assert no `switch` block
  // dispatches on `sourceFilter`. STORY-018 ships the canonical AST scan;
  // this is the local guard so a regression here trips at the closest
  // boundary.
  const here = dirname(fileURLToPath(import.meta.url));
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('agent-loop.ts source contains no `switch (sourceFilter)` block', () => {
    const source = stripComments(readFileSync(join(here, 'agent-loop.ts'), 'utf8'));
    // The pattern matches `switch (req.sourceFilter)`, `switch(sourceFilter)`,
    // and any whitespace variation. A `Record<SourceFilter, Handler>` lookup
    // does not trip this scan.
    expect(source).not.toMatch(/switch\s*\(\s*[^)]*sourceFilter[^)]*\)/);
  });

  it('agent-loop.ts has zero `switch` statements at all (lookup-table-only routing)', () => {
    // The canonical NFR-006 stance per .design/components/agent.md is "no
    // switch on routing". The whole file uses lookup tables and discriminant
    // checks — there is no need for any `switch` body. STORY-018's repo-wide
    // AST scan tightens this further.
    const source = stripComments(readFileSync(join(here, 'agent-loop.ts'), 'utf8'));
    expect(source).not.toMatch(/\bswitch\s*\(/);
  });
});

describe('NFR-006: adding a synthetic third tool → agent-loop file MUST NOT change', () => {
  // The story scope's adversarial NFR-006 guard: register a synthetic
  // tool through the registry; the agent's source-filter routing MUST NOT
  // need a single edit. Adding a new tool is a registration, not an agent
  // code change.
  it('registers a third "synthetic" tool via the registry without changing the agent source', async () => {
    const synthetic = vi.fn(async () => okResult({ tag: 'synthetic' }));
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
      // The synthetic tool — the agent does NOT call it on a LIVE search,
      // confirming that adding a new tool is invisible to the loop body.
      'synthetic-noop': synthetic,
    });

    const agent = buildAgent(registry);
    const response = await agent(
      { query: 'q', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(response.ok).toBe(true);
    expect(synthetic).not.toHaveBeenCalled();
  });
});

describe('Synthesis is invoked uniformly across source filters (FR-013)', () => {
  it('LIVE, HISTORY, and BOOKMARK each call the injected synthesize once', async () => {
    const synth = vi.fn(synthFake);
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        if (i.op === 'history.list') {
          return okResult({
            op: 'history.list',
            entries: [
              {
                id: 'h-1',
                query: 'h-q',
                sourceFilter: 'LIVE',
                ts: '2026-05-10T12:00:00.000Z',
                resultChunkIds: ['c-1'],
              },
            ],
            pagination: { page: 1, totalChunks: 1, hasMore: false },
          });
        }
        if (i.op === 'cache.read') {
          return okResult({
            op: 'cache.read',
            results: [sampleCard(2)],
            chunksRead: 1,
            pagination: { page: 1, totalChunks: 1, hasMore: false },
          });
        }
        if (i.op === 'bookmark.list') {
          return okResult({
            op: 'bookmark.list',
            entries: [],
            pagination: { page: 1, totalChunks: 0, hasMore: false },
          });
        }
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });

    const agent = buildAgent(registry, { synthesize: synth });

    await agent({ query: 'live', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 }, liveSignal());
    await agent(
      { query: 'history', sourceFilter: 'HISTORY', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );
    await agent(
      { query: 'bookmark', sourceFilter: 'BOOKMARK', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );

    expect(synth).toHaveBeenCalledTimes(3);
  });
});

describe('Cancellation contract: budget-derived signal is propagated to every tool invocation', () => {
  it('every registry.invoke receives an AbortSignal (the agent never calls invoke without one)', async () => {
    const seen: AbortSignal[] = [];
    const registry: ToolRegistry = {
      register: () => {
        throw new Error('not used');
      },
      list: () => [],
      invoke: async <I, O>(
        name: string,
        _input: I,
        signal: AbortSignal,
      ): Promise<Result<O, ToolErrorContract>> => {
        seen.push(signal);
        if (name === 'web-search') {
          return okResult({
            results: [],
            fetchedAt: '2026-05-10T12:00:00.000Z',
            provider: 'tavily',
          }) as Result<O, ToolErrorContract>;
        }
        if (name === 'data-store') {
          // Forward whatever shape the agent asked for; we just need a
          // non-error to keep the flow moving.
          return okResult({ op: 'cache.write', chunkIds: [] }) as Result<O, ToolErrorContract>;
        }
        return errResult({ kind: 'terminal', message: 'unknown' });
      },
    };
    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });
    await agent({ query: 'q', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 }, liveSignal());
    // Each invocation got SOME signal — the agent never calls invoke
    // without one.
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s).toBeInstanceOf(AbortSignal);
    }
  });
});

describe('Response shape conforms to AgentSearchResponseContract', () => {
  it('a successful response carries answer_summary, references, results, and pagination', async () => {
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });
    const agent = buildAgent(registry);
    const response: AgentSearchResponseContract = await agent(
      { query: 'shape', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('expected success');
    expect(typeof response.value.answer_summary).toBe('string');
    expect(Array.isArray(response.value.references)).toBe(true);
    expect(Array.isArray(response.value.results)).toBe(true);
    expect(typeof response.value.pagination.page).toBe('number');
  });
});

// =============================================================================
// Review iteration 1 follow-ups (PR #14)
// =============================================================================

/**
 * Capturing logger for log-shape assertions. Records every line emitted by
 * the agent so we can assert the convention's `event` field is populated.
 */
const createCapturingLogger = (): {
  readonly logger: AgentLogger;
  readonly lines: ReadonlyArray<{
    level: 'info' | 'warn' | 'error';
    fields: AgentToolInvokedFields;
  }>;
} => {
  const lines: { level: 'info' | 'warn' | 'error'; fields: AgentToolInvokedFields }[] = [];
  return {
    logger: {
      log(level, fields) {
        lines.push({ level, fields });
      },
    },
    get lines() {
      return lines;
    },
  };
};

describe('foundation/conventions.md "Logging": every agent log line carries event="agent.tool-invoked"', () => {
  it('LIVE happy path → every emitted line has event === "agent.tool-invoked"', async () => {
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });
    const cap = createCapturingLogger();
    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
      idGenerator: stableId,
      now: stableNow,
      logger: cap.logger,
    });
    await agent({ query: 'logged', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 }, liveSignal());
    // The LIVE happy path emits at least one line per tool call (web-search,
    // cache.write, history.append). Every one MUST carry event token.
    expect(cap.lines.length).toBeGreaterThan(0);
    for (const line of cap.lines) {
      expect(line.fields.event).toBe('agent.tool-invoked');
      expect(typeof line.fields.tool).toBe('string');
      expect(typeof line.fields.outcome).toBe('string');
      expect(typeof line.fields.attempt).toBe('number');
      expect(typeof line.fields.elapsedMs).toBe('number');
    }
  });

  it('a transient → final-failure log line also carries event="agent.tool-invoked"', async () => {
    let calls = 0;
    const registry = createFakeRegistry({
      'web-search': async () => {
        calls++;
        return errResult({ kind: 'transient', message: `flake-${calls}` });
      },
      'data-store': async () => errResult({ kind: 'terminal', message: 'should not be called' }),
    });
    const cap = createCapturingLogger();
    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
      idGenerator: stableId,
      now: stableNow,
      logger: cap.logger,
    });
    await agent({ query: 'flaky', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 }, liveSignal());
    // Three transient attempts + one final-failure summary line.
    expect(cap.lines.length).toBeGreaterThan(0);
    for (const line of cap.lines) {
      expect(line.fields.event).toBe('agent.tool-invoked');
    }
    // The "final" summary line MUST be present and tagged.
    const finalLines = cap.lines.filter((l) => l.fields.note === 'final');
    expect(finalLines.length).toBeGreaterThanOrEqual(1);
    for (const f of finalLines) {
      expect(f.fields.event).toBe('agent.tool-invoked');
    }
  });
});

describe('FR-023 / I-26: a thrown SynthesisFn surfaces as terminal across the API↔Agent seam (no rejected Promise)', () => {
  // The reviewer (PR #14) flagged that synthesize(...) was called directly,
  // not through the registry — so a thrown `SynthesisFn` would propagate as
  // a rejected Promise, violating FR-023 / I-26. The agent function now wraps
  // the closure body in a try/catch; this test locks that behavior.
  it('a SynthesisFn that throws surfaces as { ok: false, error: { kind: "terminal" } }', async () => {
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });
    const throwingSynth: SynthesisFn = async () => {
      throw new Error('synthesis exploded: model-unreachable');
    };
    const agent = buildAgent(registry, { synthesize: throwingSynth });
    const response = await agent(
      { query: 'kaboom', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('terminal');
    expect(response.error.message).toMatch(/synthesis exploded/);
    // The thrown Error MUST be preserved on `details` for forensics.
    expect(response.error.details).toBeInstanceOf(Error);
  });

  it('a SynthesisFn that throws a non-Error value still surfaces as terminal (defensive)', async () => {
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });
    const throwingSynth: SynthesisFn = async () => {
      throw 'string-thrown';
    };
    const agent = buildAgent(registry, { synthesize: throwingSynth });
    const response = await agent(
      { query: 'string-throw', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      liveSignal(),
    );
    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('terminal');
    // We do NOT crash; the thrown string is preserved as `details`.
    expect(response.error.details).toBe('string-thrown');
  });

  it('the agent function never returns a rejected Promise, even on synthesis throw', async () => {
    const registry = createFakeRegistry({
      'web-search': okResult<WebSearchOutputContract>({
        results: [sampleCard(1)],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily',
      }),
      'data-store': async (input): Promise<Result<DataStoreOutputContract, ToolErrorContract>> => {
        const i = input as DataStoreInputContract;
        if (i.op === 'cache.write') return okResult({ op: 'cache.write', chunkIds: ['c-1'] });
        if (i.op === 'history.append') return okResult({ op: 'history.append', id: 'h-1' });
        return errResult({ kind: 'terminal', message: `unexpected op: ${i.op}` });
      },
    });
    const throwingSynth: SynthesisFn = async () => {
      throw new Error('boom');
    };
    const agent = buildAgent(registry, { synthesize: throwingSynth });
    // .resolves not .rejects — this is the API ↔ Agent seam guarantee.
    await expect(
      agent({ query: 'x', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 }, liveSignal()),
    ).resolves.toMatchObject({ ok: false, error: { kind: 'terminal' } });
  });
});

describe('package.json: @langchain/langgraph is NOT a runtime dependency (deviation locked)', () => {
  // Locks the iteration-1 fix: the runtime dependency was removed because
  // the agent is hand-rolled. The intentional deviation is documented at
  // the top of `agent-loop.ts` citing FR-011 / NFR-006. If a future change
  // wants to (re-)introduce LangGraph it MUST also update the deviation
  // comment and reinstate the dep — this guard catches the silent variant.
  const here = dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it('package.json has no @langchain/langgraph dependency', () => {
    expect(pkg.dependencies?.['@langchain/langgraph']).toBeUndefined();
    expect(pkg.devDependencies?.['@langchain/langgraph']).toBeUndefined();
  });

  it('agent-loop.ts does not import @langchain/langgraph', () => {
    const source = readFileSync(join(here, 'agent-loop.ts'), 'utf8');
    expect(source).not.toMatch(/from\s+['"]@langchain\/langgraph['"]/);
    expect(source).not.toMatch(/require\(['"]@langchain\/langgraph['"]\)/);
  });

  it('agent-loop.ts top-of-file comment cites FR-011 and NFR-006 for the deviation', () => {
    const source = readFileSync(join(here, 'agent-loop.ts'), 'utf8');
    const headerEnd = source.indexOf('*/');
    const header = source.slice(0, headerEnd > 0 ? headerEnd : 4096);
    // The deviation block MUST be in the file's leading TSDoc, not buried
    // somewhere downstream.
    expect(header).toMatch(/INTENTIONAL DEVIATION/);
    expect(header).toMatch(/FR-011/);
    expect(header).toMatch(/NFR-006/);
  });
});

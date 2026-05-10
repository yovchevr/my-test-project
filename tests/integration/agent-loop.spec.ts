/**
 * Integration test for the agent loop (STORY-011).
 *
 * Lives under `tests/integration/` rather than `services/agent/src/` because
 * the boundary lint (`@nx/enforce-module-boundaries`) forbids `layer:agent`
 * source files from importing `layer:data` packages, and this test
 * deliberately constructs real `historyStore` / `bookmarkStore` /
 * `searchCache` instances to wire behind the `data-store` tool. The
 * production agent NEVER imports the data-layer packages — that posture is
 * exercised by the unit-tier tests in `services/agent/src/agent-loop.test.ts`
 * and lint-enforced by STORY-018. This file is the cross-package wire-up
 * proof: it composes the SAME tools the agent's composition root would use
 * in production.
 *
 * Per `.design/technology/testing.md`: integration tests live in `.spec.ts`
 * files and tear down their temp dirs in `afterEach`. No fixture is shared
 * mutably between tests.
 *
 * AC coverage (FR-011, FR-022, FR-023, NFR-005, NFR-006):
 *  - LIVE happy path: web-search → cache.write → history.append → synthesize
 *    sequence is observable end-to-end.
 *  - I-8: an empty-results LIVE search still produces history + cache writes.
 *  - FR-023: a 401 from the fake fetch surfaces as terminal.
 *  - NFR-005: a 5xx from the fake fetch retries up to three times then
 *    surfaces transient.
 *  - NFR-006: registering a synthetic third tool does not change the agent
 *    loop's behaviour (the tool is registered but never invoked).
 *  - The success response satisfies `AgentSearchResponseContract`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormatRegistry } from '@sinclair/typebox';
import { Value as SchemaValue } from '@sinclair/typebox/value';
// Mixed runtime imports are separated from `import type` so the FR-021
// single-source-of-truth scan (which greps for inline declarations of
// Contract-suffixed names) does not false-positive on the inline `type`
// markers a combined import block would produce.
import {
  AgentSearchResponseContract,
  WebSearchInputContract,
  WebSearchOutputContract,
} from '@neo-search/contracts';
import type { DataStoreOutputContract, Result, ResultCardContract } from '@neo-search/contracts';
import { createRegistry, defineTool, silentLogger } from '@neo-search/tools';
import {
  createWebSearchHandler,
  registerWebSearchFormats,
  webSearchTool,
} from '@neo-search/tools-web-search';
import type { FetchLike } from '@neo-search/tools-web-search';
import { createDataStoreHandler, dataStoreTool } from '@neo-search/tools-data-store';
import { createBookmarkStore } from '@neo-search/data-bookmarks';
import type { BookmarkStore } from '@neo-search/data-bookmarks';
import { createSearchCache } from '@neo-search/data-cache';
import type { SearchCache } from '@neo-search/data-cache';
import { createHistoryStore } from '@neo-search/data-history';
import type { HistoryStore } from '@neo-search/data-history';
import { createAgent } from '@neo-search/agent';
import type { SynthesisFn, Clock } from '@neo-search/agent';

// Register the format validators TypeBox needs for `uri` / `date-time` —
// the `WebSearchOutputContract` and `DataStoreOutputContract` validators
// use both formats, and TypeBox 0.33 treats unknown formats as failures.
const URI_PATTERN = /^[a-z][a-z0-9+\-.]*:\/\/[^\s/$.?#].[^\s]*$/i;
beforeAll(() => {
  if (!FormatRegistry.Has('uri')) {
    FormatRegistry.Set('uri', (value) => URI_PATTERN.test(value));
  }
  if (!FormatRegistry.Has('date-time')) {
    FormatRegistry.Set('date-time', (value) => !Number.isNaN(Date.parse(value)));
  }
  registerWebSearchFormats();
});

/**
 * A passive `Clock` for the integration spec — backoffs (≤ 1s) resolve on a
 * microtask, the per-request budget timer (10_000ms) only resolves when the
 * upstream signal aborts. This keeps the integration suite from blocking on
 * real wall time while still exercising every retry branch deterministically.
 */
const passiveClock: Clock = {
  wait: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      if (ms <= 1_000) {
        Promise.resolve().then(resolve);
        return;
      }
      const onAbort = (): void => resolve();
      signal.addEventListener('abort', onAbort, { once: true });
    }),
};

const synthFake: SynthesisFn = async (query, results) => ({
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

const buildFakeFetch = (rows: ResultCardContract[]): FetchLike => {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      results: rows.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.snippet,
      })),
    }),
  });
};

let dataDir: string;
let historyStore: HistoryStore;
let bookmarkStore: BookmarkStore;
let searchCache: SearchCache;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'agent-loop-spec-'));
  historyStore = createHistoryStore({
    dataDir: join(dataDir, 'history'),
    idGenerator: ((): (() => string) => {
      let counter = 0;
      return (): string => `h-${++counter}`;
    })(),
    clock: ((): (() => Date) => {
      let nowMs = Date.parse('2026-05-10T12:00:00.000Z');
      return (): Date => new Date(nowMs++);
    })(),
  });
  bookmarkStore = createBookmarkStore({ dataDir: join(dataDir, 'bookmarks') });
  searchCache = createSearchCache({ dataDir: join(dataDir, 'cache') });
});

afterEach(() => {
  try {
    historyStore.close();
  } catch {
    // ignore
  }
  try {
    bookmarkStore.close();
  } catch {
    // ignore
  }
  try {
    searchCache.close();
  } catch {
    // ignore
  }
  rmSync(dataDir, { recursive: true, force: true });
});

const registerWebSearch = (registry: ReturnType<typeof createRegistry>, fetch: FetchLike): void => {
  registry.register(
    defineTool({
      descriptor: webSearchTool.descriptor,
      handler: createWebSearchHandler({
        fetch,
        env: { TAVILY_API_KEY: 'test-key' },
        clock: () => new Date('2026-05-10T12:00:00.000Z'),
      }),
    }),
  );
};

const registerDataStore = (
  registry: ReturnType<typeof createRegistry>,
  stores: { historyStore: HistoryStore; bookmarkStore: BookmarkStore; searchCache: SearchCache },
): void => {
  registry.register(
    defineTool({
      descriptor: dataStoreTool.descriptor,
      handler: createDataStoreHandler(stores),
    }),
  );
};

describe('FR-011 — agent + real registry + real tools (LIVE happy path)', () => {
  it('drives a LIVE search end-to-end: web-search → cache.write → history.append → synthesize', async () => {
    const liveRows: ResultCardContract[] = [
      {
        title: 'Hello World',
        snippet: 'A first row',
        domain: 'example.com',
        url: 'https://example.com/1',
      },
      {
        title: 'Greetings',
        snippet: 'A second row',
        domain: 'example.org',
        url: 'https://example.org/2',
      },
    ];

    const registry = createRegistry({ logger: silentLogger });
    registerWebSearch(registry, buildFakeFetch(liveRows));
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    const synth = vi.fn(synthFake);
    const agent = createAgent({
      registry,
      synthesize: synth,
      clock: passiveClock,
      now: ((): (() => Date) => {
        let nowMs = Date.parse('2026-05-10T12:00:00.000Z');
        return (): Date => new Date(nowMs++);
      })(),
    });

    const response = await agent(
      { query: 'integration-q', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(`expected success, got ${JSON.stringify(response.error)}`);
    expect(response.value.answer_summary).toMatch(/integration-q/);
    expect(response.value.results).toEqual(liveRows);

    // Synthesize was invoked exactly once, with the LIVE results forwarded.
    expect(synth).toHaveBeenCalledTimes(1);
    expect(synth.mock.calls[0]?.[1]).toEqual(liveRows);

    // Verify the side-effects landed in real stores: history.list page 1
    // contains the new entry, and cache.read returns the live rows.
    const historyOut: Result<unknown, unknown> = await registry.invoke(
      'data-store',
      { op: 'history.list', page: 1 },
      new AbortController().signal,
    );
    expect(historyOut.ok).toBe(true);
    if (!historyOut.ok) throw new Error('history.list failed');
    const historyOutput = historyOut.value as DataStoreOutputContract;
    if (historyOutput.op !== 'history.list') throw new Error('expected history.list');
    expect(historyOutput.entries).toHaveLength(1);
    expect(historyOutput.entries[0]?.query).toBe('integration-q');

    const cacheOut: Result<unknown, unknown> = await registry.invoke(
      'data-store',
      { op: 'cache.read', query: 'integration-q', page: 1 },
      new AbortController().signal,
    );
    expect(cacheOut.ok).toBe(true);
    if (!cacheOut.ok) throw new Error('cache.read failed');
    const cacheOutput = cacheOut.value as DataStoreOutputContract;
    if (cacheOutput.op !== 'cache.read') throw new Error('expected cache.read');
    expect(cacheOutput.results).toEqual(liveRows);
  });

  it('LIVE with zero results still writes cache + history (I-8)', async () => {
    const registry = createRegistry({ logger: silentLogger });
    registerWebSearch(registry, buildFakeFetch([]));
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });

    const response = await agent(
      { query: 'no-results', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(true);

    // History recorded the empty-results LIVE search per I-8.
    const historyOut: Result<unknown, unknown> = await registry.invoke(
      'data-store',
      { op: 'history.list', page: 1 },
      new AbortController().signal,
    );
    if (!historyOut.ok) throw new Error('history.list failed');
    const historyOutput = historyOut.value as DataStoreOutputContract;
    if (historyOutput.op !== 'history.list') throw new Error('expected history.list');
    expect(historyOutput.entries).toHaveLength(1);
    expect(historyOutput.entries[0]?.query).toBe('no-results');
  });
});

describe('FR-022 / FR-023 — agent surfaces tool failures as the right agent error kind', () => {
  it('a `terminal` web-search error (e.g. http-401) surfaces as a terminal agent error', async () => {
    // Build a fake fetch that returns 401 → web-search emits terminal.
    const fail401: FetchLike = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    const registry = createRegistry({ logger: silentLogger });
    registerWebSearch(registry, fail401);
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });
    const response = await agent(
      { query: 'auth-fail', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('terminal');
    expect(response.error.message).toMatch(/http-401/);
  });

  it('a transient web-search failure (5xx) retries — three failures in a row exhaust retries', async () => {
    let calls = 0;
    const fail503: FetchLike = async () => {
      calls++;
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
      };
    };
    const registry = createRegistry({ logger: silentLogger });
    registerWebSearch(registry, fail503);
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });

    const response = await agent(
      { query: 'flaky', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('transient');
    expect(calls).toBe(3);
  });

  it('a thrown handler is caught by the registry and surfaces as terminal — agent does not crash', async () => {
    // Register a web-search whose handler throws. The registry catches the
    // throw (per STORY-003) and converts it to a terminal Result; the
    // agent forwards it as a terminal agent error.
    const registry = createRegistry({ logger: silentLogger });
    registry.register(
      defineTool({
        descriptor: webSearchTool.descriptor,
        handler: async () => {
          throw new Error('synthetic throw from handler');
        },
      }),
    );
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });
    const response = await agent(
      { query: 'thrower', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('terminal');
    expect(response.error.message).toMatch(/handler-threw.*synthetic throw/);
  });
});

describe('NFR-006 — adding a synthetic third tool does NOT change the agent loop file', () => {
  it('registers a synthetic third tool and runs a normal LIVE search', async () => {
    const registry = createRegistry({ logger: silentLogger });
    registerWebSearch(
      registry,
      buildFakeFetch([
        {
          title: 'X',
          snippet: 'Y',
          domain: 'example.com',
          url: 'https://example.com/x',
        },
      ]),
    );
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    // The synthetic tool — never called by the LIVE path. The handler
    // shape doesn't matter; we just need it registered to prove the
    // agent's loop body is unchanged.
    const synthetic = vi.fn(async () => ({
      ok: true as const,
      value: {
        results: [],
        fetchedAt: '2026-05-10T12:00:00.000Z',
        provider: 'tavily' as const,
      },
    }));
    registry.register(
      defineTool({
        descriptor: {
          name: 'synthetic-noop',
          description: 'A no-op tool registered to prove NFR-006',
          inputSchema: WebSearchInputContract,
          outputSchema: WebSearchOutputContract,
        },
        handler: synthetic,
      }),
    );

    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });
    const response = await agent(
      { query: 'q', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(true);
    expect(synthetic).not.toHaveBeenCalled();
  });
});

describe('Response shape conforms to AgentSearchResponseContract', () => {
  it("the contract validator accepts the agent's success response", async () => {
    const liveRows: ResultCardContract[] = [
      {
        title: 'Hello',
        snippet: 'world',
        domain: 'example.com',
        url: 'https://example.com/1',
      },
    ];
    const registry = createRegistry({ logger: silentLogger });
    registerWebSearch(registry, buildFakeFetch(liveRows));
    registerDataStore(registry, { historyStore, bookmarkStore, searchCache });

    const agent = createAgent({
      registry,
      synthesize: synthFake,
      clock: passiveClock,
    });
    const response = await agent(
      { query: 'shape-q', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(SchemaValue.Check(AgentSearchResponseContract, response)).toBe(true);
  });
});

/**
 * Integration tests for `createApi` with a real agent (STORY-013).
 *
 * Exercises the full POST /api/search flow end-to-end: Fastify receives the
 * request, validates the schema, forwards to the agent, the agent invokes
 * tools through the registry, synthesis runs, and the API maps the result
 * back to the UI ↔ API contract.
 *
 * Uses:
 *  - Real `createAgent` factory from `@neo-search/agent`;
 *  - Fake `web-search` tool that returns canned results (no live API call);
 *  - Real data-layer stores against a temp directory (each test gets a fresh
 *    isolated `dataDir`);
 *  - Fake synthesizer that returns a deterministic answer without calling an
 *    LLM.
 *
 * Per `.design/technology/testing.md`, integration tests sit as `*.spec.ts`
 * adjacent to the module under test. E2E tests (Playwright against a running
 * server) are deferred to STORY-019.
 */
import { describe, expect, it, beforeEach, afterEach, beforeAll } from 'vitest';
import { createApi, type ApiClock } from './index.js';
import { createAgent, wallClock, type SynthesisFn } from '@neo-search/agent';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Integration tests require registry and tool construction; composition root pattern per ADR 0001
import { createRegistry, defineTool } from '@neo-search/tools';
import {
  WebSearchInputContract,
  WebSearchOutputContract,
  DataStoreInputContract,
  DataStoreOutputContract,
} from '@neo-search/contracts';
import type { Result, ToolErrorContract, ResultCardContract } from '@neo-search/contracts';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Integration tests wire real data-store handler per composition root pattern
import { createDataStoreHandler } from '@neo-search/tools-data-store';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Integration tests require real data-layer stores for end-to-end validation
import { createHistoryStore } from '@neo-search/data-history';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Integration tests require real data-layer stores for end-to-end validation
import { createBookmarkStore } from '@neo-search/data-bookmarks';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Integration tests require real data-layer stores for end-to-end validation
import { createSearchCache } from '@neo-search/data-cache';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Integration tests require web-search tool format registration
import { registerWebSearchFormats } from '@neo-search/tools-web-search';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Fake `web-search` tool that returns a canned result set. Tests inject this
 * to avoid hitting the live Tavily API (per `.design/technology/testing.md`:
 * "Tests MUST NOT hit the real Tavily API in the unit / integration tier").
 */
const createFakeWebSearchTool = (results: ResultCardContract[]) => {
  return defineTool({
    descriptor: {
      name: 'web-search',
      description: 'Fake web search for integration tests',
      inputSchema: WebSearchInputContract,
      outputSchema: WebSearchOutputContract,
    },
    handler: async (
      _input: WebSearchInputContract,
      _signal: AbortSignal,
    ): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
      return {
        ok: true,
        value: {
          results,
          fetchedAt: new Date().toISOString(),
          provider: 'tavily',
        },
      };
    },
  });
};

/**
 * Fake synthesizer that returns a deterministic answer without calling an
 * LLM. The output satisfies FR-007 / FR-008 / FR-009 (non-empty summary,
 * citations, non-empty references).
 */
const fakeSynthesize: SynthesisFn = async (
  query: string,
  results: readonly ResultCardContract[],
  _signal: AbortSignal,
) => {
  return {
    ok: true,
    value: {
      answer_summary: `Synthesized answer for query: "${query}". [1]`,
      references: results.slice(0, 3).map((result, i) => ({
        id: `ref-${i + 1}`,
        title: result.title,
        url: result.url,
        context: result.snippet,
      })),
    },
  };
};

describe('createApi integration', () => {
  let tempDir: string;

  beforeAll(() => {
    // Register TypeBox format validators once for all integration tests
    registerWebSearchFormats();
  });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'api-integration-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('POST /api/search LIVE happy path with real agent and fake tools', async () => {
    const fakeResults: ResultCardContract[] = [
      {
        title: 'Example Result 1',
        url: 'https://example.com/1',
        snippet: 'This is a test snippet one.',
        domain: 'example.com',
      },
      {
        title: 'Example Result 2',
        url: 'https://example.com/2',
        snippet: 'This is a test snippet two.',
        domain: 'example.com',
      },
    ];

    const registry = createRegistry();
    registry.register(createFakeWebSearchTool(fakeResults));

    const historyStore = createHistoryStore({ dataDir: tempDir });
    const bookmarkStore = createBookmarkStore({ dataDir: tempDir });
    const searchCache = createSearchCache({ dataDir: tempDir });

    const dataStoreHandler = createDataStoreHandler({
      historyStore,
      bookmarkStore,
      searchCache,
    });

    registry.register(
      defineTool({
        descriptor: {
          name: 'data-store',
          description: 'Fake data-store for integration tests',
          inputSchema: DataStoreInputContract,
          outputSchema: DataStoreOutputContract,
        },
        handler: dataStoreHandler,
      }),
    );

    const agent = createAgent({
      registry,
      synthesize: fakeSynthesize,
      clock: wallClock,
    });

    const apiClock: ApiClock = {
      now: () => Date.now(),
      wait: (ms) => wallClock.wait(ms, new AbortController().signal),
    };

    const api = createApi({
      agent,
      registry,
      clock: apiClock,
    });

    const response = await api.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        query: 'integration test query',
        sourceFilter: 'LIVE',
        page: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.answer_summary).toContain('integration test query');
    expect(body.references).toBeDefined();
    expect(body.references.length).toBeGreaterThan(0);
    expect(body.results).toHaveLength(2);
    expect(body.results[0].title).toBe('Example Result 1');
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
  });

  it('POST /api/search with transient tool failure surfaces as 503', async () => {
    const registry = createRegistry();

    const failingWebSearchTool = defineTool({
      descriptor: {
        name: 'web-search',
        description: 'Failing web search',
        inputSchema: WebSearchInputContract,
        outputSchema: WebSearchOutputContract,
      },
      handler: async (
        _input: WebSearchInputContract,
        _signal: AbortSignal,
      ): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
        return {
          ok: false,
          error: {
            kind: 'transient',
            message: 'provider-5xx',
          },
        };
      },
    });

    registry.register(failingWebSearchTool);

    const historyStore = createHistoryStore({ dataDir: tempDir });
    const bookmarkStore = createBookmarkStore({ dataDir: tempDir });
    const searchCache = createSearchCache({ dataDir: tempDir });

    const dataStoreHandler = createDataStoreHandler({
      historyStore,
      bookmarkStore,
      searchCache,
    });

    registry.register(
      defineTool({
        descriptor: {
          name: 'data-store',
          description: 'Fake data-store for integration tests',
          inputSchema: DataStoreInputContract,
          outputSchema: DataStoreOutputContract,
        },
        handler: dataStoreHandler,
      }),
    );

    const agent = createAgent({
      registry,
      synthesize: fakeSynthesize,
      clock: wallClock,
    });

    const apiClock: ApiClock = {
      now: () => Date.now(),
      wait: (ms) => wallClock.wait(ms, new AbortController().signal),
    };

    const api = createApi({
      agent,
      registry,
      clock: apiClock,
    });

    const response = await api.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        query: 'test query',
        sourceFilter: 'LIVE',
        page: 1,
      },
    });

    expect(response.statusCode).toBe(503);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.kind).toBe('transient_exhausted');
  });

  it('POST /api/search with terminal tool failure surfaces as 502', async () => {
    const registry = createRegistry();

    const failingWebSearchTool = defineTool({
      descriptor: {
        name: 'web-search',
        description: 'Failing web search',
        inputSchema: WebSearchInputContract,
        outputSchema: WebSearchOutputContract,
      },
      handler: async (
        _input: WebSearchInputContract,
        _signal: AbortSignal,
      ): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
        return {
          ok: false,
          error: {
            kind: 'terminal',
            message: 'missing-api-key',
          },
        };
      },
    });

    registry.register(failingWebSearchTool);

    const historyStore = createHistoryStore({ dataDir: tempDir });
    const bookmarkStore = createBookmarkStore({ dataDir: tempDir });
    const searchCache = createSearchCache({ dataDir: tempDir });

    const dataStoreHandler = createDataStoreHandler({
      historyStore,
      bookmarkStore,
      searchCache,
    });

    registry.register(
      defineTool({
        descriptor: {
          name: 'data-store',
          description: 'Fake data-store for integration tests',
          inputSchema: DataStoreInputContract,
          outputSchema: DataStoreOutputContract,
        },
        handler: dataStoreHandler,
      }),
    );

    const agent = createAgent({
      registry,
      synthesize: fakeSynthesize,
      clock: wallClock,
    });

    const apiClock: ApiClock = {
      now: () => Date.now(),
      wait: (ms) => wallClock.wait(ms, new AbortController().signal),
    };

    const api = createApi({
      agent,
      registry,
      clock: apiClock,
    });

    const response = await api.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        query: 'test query',
        sourceFilter: 'LIVE',
        page: 1,
      },
    });

    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body.ok).toBe(false);
    expect(body.error.kind).toBe('terminal');
    expect(body.error.message).toBe('missing-api-key');
  });
});

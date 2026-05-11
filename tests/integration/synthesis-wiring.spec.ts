/**
 * Integration spec for the synthesis-step wiring — STORY-012.
 *
 * Per the story scope's Definition of Done:
 *   "The agent factory wiring in STORY-011 swaps the test fake for the real
 *    `createSynthesizer({ anthropic })` at the composition root."
 *
 * STORY-013 owns the actual API composition root; this spec demonstrates the
 * wire-up shape so STORY-013's integration test only has to import the same
 * pieces. The fake `anthropic` client is the same shape STORY-013 will use
 * in its API-tier integration test.
 *
 * Per `.design/technology/testing.md` integration tests live in `.spec.ts`
 * files. This file does NOT hit a real LLM — STORY-019's smoke job owns
 * live-API exercise.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FormatRegistry } from '@sinclair/typebox';
import type { ResultCardContract } from '@neo-search/contracts';
import { createRegistry, defineTool, silentLogger } from '@neo-search/tools';
import {
  createWebSearchHandler,
  registerWebSearchFormats,
  webSearchTool,
} from '@neo-search/tools-web-search';
import type { FetchLike } from '@neo-search/tools-web-search';
import { createDataStoreHandler, dataStoreTool } from '@neo-search/tools-data-store';
import { createBookmarkStore } from '@neo-search/data-bookmarks';
import { createSearchCache } from '@neo-search/data-cache';
import { createHistoryStore } from '@neo-search/data-history';
import type { BookmarkStore } from '@neo-search/data-bookmarks';
import type { SearchCache } from '@neo-search/data-cache';
import type { HistoryStore } from '@neo-search/data-history';
import { createAgent, createSynthesizer, type AnthropicLike, type Clock } from '@neo-search/agent';

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

const buildFakeFetch =
  (rows: ResultCardContract[]): FetchLike =>
  async () => ({
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

let dataDir: string;
let historyStore: HistoryStore;
let bookmarkStore: BookmarkStore;
let searchCache: SearchCache;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'synthesis-wiring-spec-'));
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
    /* ignore */
  }
  try {
    bookmarkStore.close();
  } catch {
    /* ignore */
  }
  try {
    searchCache.close();
  } catch {
    /* ignore */
  }
  rmSync(dataDir, { recursive: true, force: true });
});

describe('STORY-012 — createSynthesizer wires into the agent loop without env-var dependencies', () => {
  it('a LIVE search drives web-search → cache.write → history.append → synthesize end-to-end', async () => {
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

    // Fake Anthropic client. Returns a canned valid synthesis output. The
    // shape is identical to what the real SDK returns; STORY-013 swaps this
    // for `new Anthropic({ apiKey })` at the API composition root.
    const fakeAnthropic: AnthropicLike = {
      messages: {
        create: async () => ({
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                answer_summary: 'The first source covers A [1]. The second covers B [2].',
                references: [
                  {
                    id: 'ref-1',
                    title: 'Hello World',
                    url: 'https://example.com/1',
                    context: 'A first row',
                  },
                  {
                    id: 'ref-2',
                    title: 'Greetings',
                    url: 'https://example.org/2',
                    context: 'A second row',
                  },
                ],
              }),
            },
          ],
        }),
      },
    };

    const registry = createRegistry({ logger: silentLogger });
    registry.register(
      defineTool({
        descriptor: webSearchTool.descriptor,
        handler: createWebSearchHandler({
          fetch: buildFakeFetch(liveRows),
          env: { TAVILY_API_KEY: 'test-key' },
          clock: () => new Date('2026-05-10T12:00:00.000Z'),
        }),
      }),
    );
    registry.register(
      defineTool({
        descriptor: dataStoreTool.descriptor,
        handler: createDataStoreHandler({ historyStore, bookmarkStore, searchCache }),
      }),
    );

    // The composition root: real synthesizer, fake Anthropic.
    const synthesize = createSynthesizer({
      anthropic: fakeAnthropic,
      model: 'claude-fake',
    });

    const agent = createAgent({
      registry,
      synthesize,
      clock: passiveClock,
    });

    const response = await agent(
      { query: 'integration', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(`expected success, got ${JSON.stringify(response.error)}`);
    expect(response.value.answer_summary).toMatch(/\[1\]/);
    expect(response.value.answer_summary).toMatch(/\[2\]/);
    expect(response.value.references).toHaveLength(2);
    for (const ref of response.value.references) {
      expect(ref.title.length).toBeGreaterThan(0);
      expect(ref.url.length).toBeGreaterThan(0);
      expect(ref.context.length).toBeGreaterThan(0);
    }
  });

  it('FR-013: an empty LIVE result set yields the synthesizer empty-state path (non-empty summary, empty refs)', async () => {
    const fakeAnthropic: AnthropicLike = {
      // The model MUST NOT be called for empty input — this fake throws to
      // catch any regression that would invoke it.
      messages: {
        create: async () => {
          throw new Error('synthesizer should not call the model for empty input');
        },
      },
    };

    const registry = createRegistry({ logger: silentLogger });
    registry.register(
      defineTool({
        descriptor: webSearchTool.descriptor,
        handler: createWebSearchHandler({
          fetch: buildFakeFetch([]),
          env: { TAVILY_API_KEY: 'test-key' },
          clock: () => new Date('2026-05-10T12:00:00.000Z'),
        }),
      }),
    );
    registry.register(
      defineTool({
        descriptor: dataStoreTool.descriptor,
        handler: createDataStoreHandler({ historyStore, bookmarkStore, searchCache }),
      }),
    );

    const synthesize = createSynthesizer({
      anthropic: fakeAnthropic,
      model: 'claude-fake',
    });

    const agent = createAgent({
      registry,
      synthesize,
      clock: passiveClock,
    });

    const response = await agent(
      { query: 'no-results', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error('expected success');
    expect(response.value.answer_summary.length).toBeGreaterThan(0);
    expect(response.value.references).toEqual([]);
  });

  it('FR-013 / I-2: synthesizer rejection (validation-failed) surfaces as a terminal agent error', async () => {
    const liveRows: ResultCardContract[] = [
      {
        title: 'Real',
        snippet: 'real snippet',
        domain: 'example.com',
        url: 'https://example.com/1',
      },
    ];
    // Always returns an output that fails validation (fabricated URL).
    const fakeAnthropic: AnthropicLike = {
      messages: {
        create: async () => ({
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                answer_summary: 'A fabricated cite [1].',
                references: [
                  {
                    id: 'r-1',
                    title: 'Made up',
                    url: 'https://made-up.example/x',
                    context: 'fake',
                  },
                ],
              }),
            },
          ],
        }),
      },
    };

    const registry = createRegistry({ logger: silentLogger });
    registry.register(
      defineTool({
        descriptor: webSearchTool.descriptor,
        handler: createWebSearchHandler({
          fetch: buildFakeFetch(liveRows),
          env: { TAVILY_API_KEY: 'test-key' },
          clock: () => new Date('2026-05-10T12:00:00.000Z'),
        }),
      }),
    );
    registry.register(
      defineTool({
        descriptor: dataStoreTool.descriptor,
        handler: createDataStoreHandler({ historyStore, bookmarkStore, searchCache }),
      }),
    );

    const synthesize = createSynthesizer({
      anthropic: fakeAnthropic,
      model: 'claude-fake',
    });

    const agent = createAgent({
      registry,
      synthesize,
      clock: passiveClock,
    });

    const response = await agent(
      { query: 'fabricated', sourceFilter: 'LIVE', page: 1, budgetMs: 10_000 },
      new AbortController().signal,
    );

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error('expected failure');
    expect(response.error.kind).toBe('terminal');
    expect(response.error.message).toBe('synthesis-validation-failed');
  });
});

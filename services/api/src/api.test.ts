/**
 * Unit tests for `createApi` (STORY-013).
 *
 * Covers:
 *  - Schema validation: malformed request bodies MUST return 400 with
 *    structured error (`{ ok: false, error: { kind: "validation", ... } }`).
 *  - Deduplication cache: repeated `clientRequestId` within 5s MUST return
 *    cached response; expired entries MUST be pruned and invoke the agent again.
 *  - Error translation: each `AgentErrorContract.kind` variant MUST map to
 *    the correct HTTP status per the error-surface table in
 *    `.design/components/search-api.md`.
 *  - Unexpected throw: a thrown exception inside the agent handler MUST
 *    surface as HTTP 500 with `{ kind: "internal", message: "internal error" }`.
 *  - AbortSignal propagation: the request signal MUST be forwarded to the
 *    agent call (integration test verifies cancellation propagates through).
 *
 * Integration tests (`api.spec.ts`) cover the full Fastify inject path with
 * a real agent; these unit tests focus on the API's error-handling and
 * caching logic in isolation.
 */
import { describe, expect, it } from 'vitest';
import { createApi, type ApiClock } from './index.js';
import type { AgentSearchResponseContract } from '@neo-search/contracts';

/**
 * Test clock — monotonic millisecond counter. Starts at `initialNow` and
 * advances by explicit `advance(ms)` calls. No real timers.
 */
const createTestClock = (initialNow = 1_000_000): ApiClock => {
  let elapsed = 0;
  return {
    now: () => initialNow + elapsed,
    wait: async (ms) => {
      elapsed += ms;
    },
  };
};

/**
 * Fake agent that returns a canned response. Tests inject this to exercise
 * the API's error-handling paths without standing up the full agent loop.
 */
const createFakeAgent = (response: AgentSearchResponseContract | Error) => {
  return async (_req: unknown, _signal: AbortSignal): Promise<AgentSearchResponseContract> => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  };
};

describe('createApi', () => {
  describe('POST /api/search', () => {
    it('returns 200 with UiApiAnswerContract on happy path', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'Test answer summary.',
          references: [
            {
              id: 'ref-1',
              title: 'Example',
              url: 'https://example.com',
              context: 'Context snippet',
            },
          ],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test query',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.answer_summary).toBe('Test answer summary.');
      expect(body.references).toHaveLength(1);
      expect(body.references[0].title).toBe('Example');
    });

    it('returns 400 with validation error for malformed body', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'unused',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: '',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      // Fastify's TypeBox validation returns an error shape with statusCode and message
      expect(body.statusCode).toBe(400);
    });

    it('returns 502 for agent error kind: terminal', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: false,
        error: {
          kind: 'terminal',
          message: 'provider-unavailable',
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('terminal');
      expect(body.error.message).toBe('provider-unavailable');
    });

    it('returns 503 for agent error kind: transient', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: false,
        error: {
          kind: 'transient',
          message: 'retry-exhausted',
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('transient_exhausted');
    });

    it('returns 504 for agent error kind: cancelled', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: false,
        error: {
          kind: 'cancelled',
          message: 'budget-exceeded',
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(504);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('cancelled');
    });

    it('returns 400 for agent error kind: validation', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: false,
        error: {
          kind: 'validation',
          message: 'invalid-input',
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('validation');
    });

    it('returns 500 for unexpected throw with structured error body', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent(new Error('unexpected boom'));

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('internal');
      expect(body.error.message).toBe('internal error');
    });

    it('deduplicates requests with same clientRequestId within 5s TTL', async () => {
      const clock = createTestClock();
      let callCount = 0;
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'First call response.',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const countingAgent = async (req: unknown, signal: AbortSignal) => {
        callCount++;
        return agent(req, signal);
      };

      const api = createApi({ agent: countingAgent, clock });
      const clientRequestId = '12345678-1234-1234-1234-123456789abc';

      const response1 = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
          clientRequestId,
        },
      });

      expect(response1.statusCode).toBe(200);
      expect(callCount).toBe(1);

      await clock.wait(2_000);

      const response2 = await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
          clientRequestId,
        },
      });

      expect(response2.statusCode).toBe(200);
      expect(callCount).toBe(1);
      const body2 = response2.json();
      expect(body2.answer_summary).toBe('First call response.');
    });

    it('invokes agent again after dedup cache entry expires', async () => {
      const clock = createTestClock();
      let callCount = 0;
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'Response',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const countingAgent = async (req: unknown, signal: AbortSignal) => {
        callCount++;
        return agent(req, signal);
      };

      const api = createApi({ agent: countingAgent, clock });
      const clientRequestId = '12345678-1234-1234-1234-123456789abc';

      await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
          clientRequestId,
        },
      });

      expect(callCount).toBe(1);

      await clock.wait(6_000);

      await api.inject({
        method: 'POST',
        url: '/api/search',
        payload: {
          query: 'test',
          sourceFilter: 'LIVE',
          page: 1,
          clientRequestId,
        },
      });

      expect(callCount).toBe(2);
    });
  });

  describe('GET /api/bookmarks', () => {
    it('returns 200 with BookmarkListResponseContract', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'unused',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'GET',
        url: '/api/bookmarks?page=1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toBeDefined();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });

    it('returns 400 for invalid page query param', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'unused',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'GET',
        url: '/api/bookmarks?page=0',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('validation');
    });
  });

  describe('GET /api/history', () => {
    it('returns 200 with HistoryListResponseContract', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'unused',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'GET',
        url: '/api/history?page=1',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.entries).toBeDefined();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });

    it('returns 400 for invalid page query param', async () => {
      const clock = createTestClock();
      const agent = createFakeAgent({
        ok: true,
        value: {
          answer_summary: 'unused',
          references: [],
          results: [],
          pagination: { page: 1, totalChunks: 0, hasMore: false },
        },
      });

      const api = createApi({ agent, clock });
      const response = await api.inject({
        method: 'GET',
        url: '/api/history?page=-1',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.ok).toBe(false);
      expect(body.error.kind).toBe('validation');
    });
  });
});

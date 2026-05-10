/**
 * STORY-009 integration tests — recorded-fixture round-trip for the
 * `web-search` tool (FR-012).
 *
 * Per `.design/technology/testing.md`'s "Forbidden test patterns" the
 * integration tier MUST NOT hit the live Tavily API. The recorded fixture
 * at `__fixtures__/tavily-response.json` is the canary: when Tavily's
 * response shape drifts, the smoke E2E (STORY-019) detects the live drift
 * and the team re-records this fixture.
 *
 * The live integration test at the bottom of this file is `it.skipIf` on
 * `TAVILY_API_KEY` absence — when the env var is missing the test is
 * SKIPPED, not failed (see external-prerequisite note in STORY-009 and
 * `.design/technology/testing.md`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';
import { ResultCardContract, WebSearchOutputContract } from '@neo-search/contracts';
import { createWebSearchHandler, type FetchLike } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));

const fixturePath = join(here, '__fixtures__', 'tavily-response.json');
const fixtureBody: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));

const fakeFetchReturning = (body: unknown, status = 200): FetchLike =>
  (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as FetchLike;

describe('FR-012 integration — recorded fixture round-trips into WebSearchOutputContract', () => {
  it('parses the recorded Tavily response into a value that validates against WebSearchOutputContract', async () => {
    const handler = createWebSearchHandler({
      fetch: fakeFetchReturning(fixtureBody),
      env: { TAVILY_API_KEY: 'test-key' },
    });

    const result = await handler(
      { query: 'what is the capital of france', maxResults: 10 },
      new AbortController().signal,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got: ${JSON.stringify(result.error)}`);
    expect(Value.Check(WebSearchOutputContract, result.value)).toBe(true);
  });

  it('parses every fixture row into a ResultCardContract with non-empty title/url and derived domain', async () => {
    const handler = createWebSearchHandler({
      fetch: fakeFetchReturning(fixtureBody),
      env: { TAVILY_API_KEY: 'test-key' },
    });

    const result = await handler(
      { query: 'what is the capital of france', maxResults: 10 },
      new AbortController().signal,
    );

    if (!result.ok) throw new Error('expected success');
    // The fixture has 4 rows; all four MUST parse into ResultCardContract.
    expect(result.value.results).toHaveLength(4);
    const cardArray = Type.Array(ResultCardContract);
    expect(Value.Check(cardArray, result.value.results)).toBe(true);
    // The `domain` field MUST be derived from the URL.
    for (const card of result.value.results) {
      expect(card.domain).toBe(new URL(card.url).hostname);
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.url.length).toBeGreaterThan(0);
    }
  });

  it('pins the provider literal to "tavily" and stamps an ISO-8601 fetchedAt', async () => {
    const handler = createWebSearchHandler({
      fetch: fakeFetchReturning(fixtureBody),
      env: { TAVILY_API_KEY: 'test-key' },
    });

    const result = await handler(
      { query: 'what is the capital of france', maxResults: 10 },
      new AbortController().signal,
    );

    if (!result.ok) throw new Error('expected success');
    expect(result.value.provider).toBe('tavily');
    // Loose ISO-8601 date-time check; the contract validates this with
    // `format: "date-time"` so we just sanity-check parseability here.
    expect(Number.isNaN(Date.parse(result.value.fetchedAt))).toBe(false);
  });
});

describe('FR-023 integration — every error variant survives without lossy conversion', () => {
  // Companion to the registry-level FR-023 round-trip in
  // packages/tools/src/registry.test.ts. This pass asserts the tool side
  // of the contract: the four error variants the handler can produce
  // each carry the documented `kind` and stable `message`.
  it('transient HTTP 500 carries the exact `http-500` message', async () => {
    const handler = createWebSearchHandler({
      fetch: fakeFetchReturning({}, 500),
      env: { TAVILY_API_KEY: 'k' },
    });
    const result = await handler({ query: 'q', maxResults: 1 }, new AbortController().signal);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'transient', message: 'http-500' },
    });
  });

  it('terminal HTTP 401 carries the exact `http-401` message', async () => {
    const handler = createWebSearchHandler({
      fetch: fakeFetchReturning({}, 401),
      env: { TAVILY_API_KEY: 'k' },
    });
    const result = await handler({ query: 'q', maxResults: 1 }, new AbortController().signal);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'terminal', message: 'http-401' },
    });
  });

  it('terminal `missing-api-key` is the canonical message when the env var is absent', async () => {
    const handler = createWebSearchHandler({
      fetch: fakeFetchReturning(fixtureBody),
      env: {},
    });
    const result = await handler({ query: 'q', maxResults: 1 }, new AbortController().signal);
    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'terminal', message: 'missing-api-key' },
    });
  });
});

describe('FR-012 live integration (STORY-019 territory) — gated by TAVILY_API_KEY', () => {
  // Per the story's external-prerequisite note: this single live test is
  // SKIPPED (not failed) when the env var is missing. The recorded
  // fixture is what gates CI; this test only runs when a developer
  // explicitly opts in by exporting `TAVILY_API_KEY`.
  //
  // The body exists here only as a redundant safety net for STORY-019;
  // STORY-019 owns the canonical smoke E2E at `tests/e2e/live-search.e2e.ts`.
  const liveKey = process.env.TAVILY_API_KEY;

  it.skipIf(!liveKey || liveKey.length === 0)(
    'returns a parsed WebSearchOutputContract from the live Tavily API',
    async () => {
      const { fetch: undiciFetch } = await import('undici');
      const handler = createWebSearchHandler({
        fetch: undiciFetch as unknown as FetchLike,
        env: { TAVILY_API_KEY: liveKey },
      });

      const ac = new AbortController();
      // Bound the live call to 10s per NFR-005.
      const cancelTimer = setTimeout(() => ac.abort(new Error('live-test-timeout')), 10_000);

      const result = await handler({ query: 'tavily ai', maxResults: 3 }, ac.signal);
      clearTimeout(cancelTimer);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      expect(Value.Check(WebSearchOutputContract, result.value)).toBe(true);
    },
    15_000,
  );
});

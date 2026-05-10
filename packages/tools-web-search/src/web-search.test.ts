/**
 * STORY-009 unit tests — every failure mode of the `web-search` tool.
 *
 * The handler is built via `createWebSearchHandler({ fetch, env })`; each
 * test injects a fake `fetch` and a controlled env so the cases are
 * hermetic. Per `.design/technology/testing.md` "Forbidden test patterns",
 * NONE of these tests hit the real Tavily API — that is deferred to
 * STORY-019's smoke E2E.
 *
 * Each `describe` block cites the AC verbatim from
 * `.stories/project-spec/STORY-009-web-search-tool.md` so a reviewer can
 * grep by criterion.
 *
 * AC coverage (FR-012, FR-022, FR-023, NFR-005):
 *  - simulated `fetch` rejection (network error)            → transient
 *  - simulated HTTP 500                                     → transient
 *  - simulated HTTP 429                                     → transient
 *  - simulated HTTP 401                                     → terminal
 *  - simulated malformed body (fails output contract)      → terminal
 *  - missing TAVILY_API_KEY                                 → terminal, no network
 *  - pre-aborted AbortSignal                                → no network call
 *  - tool registers as `name: "web-search"`
 *  - source contains no setTimeout / retry loop (static scan)
 *  - source does not import packages/data-* (static scan)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createWebSearchHandler, webSearchTool, type FetchLike, type EnvReader } from './index.js';

// A small, well-formed body the handler accepts without complaint. Used as
// the response payload for the no-throw success path so we can isolate the
// failure-path assertions in this file.
const validTavilyBody = {
  results: [
    {
      title: 'A page',
      url: 'https://example.com/page',
      content: 'A snippet about the page.',
      score: 0.9,
    },
  ],
};

/**
 * Build a fake `FetchLike` that resolves with a stub response. Each test
 * passes its own status / body / behavior; this keeps the test bodies
 * concise and the call signature explicit.
 */
const makeFetch = (impl: Parameters<typeof vi.fn<FetchLike>>[0]): FetchLike =>
  vi.fn<FetchLike>(impl) as unknown as FetchLike;

const validInput = { query: 'a query', maxResults: 10 } as const;

const validEnv: EnvReader = { TAVILY_API_KEY: 'test-key' };

describe('AC: a simulated `fetch` rejection (network error) MUST return transient', () => {
  it('returns { ok: false, error: { kind: "transient" } } and does not throw', async () => {
    const fakeFetch = makeFetch(async () => {
      // Simulate a DNS / ECONNRESET-style network error. `undici.fetch`
      // rejects with a `TypeError` whose `.cause` is the underlying
      // `Error: getaddrinfo ENOTFOUND ...`; we model the same shape here.
      throw new TypeError('fetch failed');
    });
    const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('transient');
    expect(result.error.message).toContain('fetch failed');
  });
});

describe('AC: a simulated HTTP 500 response MUST return transient', () => {
  it('classifies status >= 500 as transient', async () => {
    const fakeFetch = makeFetch(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));
    const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'transient', message: 'http-500' },
    });
  });

  it('also classifies 502 / 503 / 504 as transient', async () => {
    for (const status of [502, 503, 504]) {
      const fakeFetch = makeFetch(async () => ({
        ok: false,
        status,
        json: async () => ({}),
      }));
      const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });
      const result = await handler(validInput, new AbortController().signal);
      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'transient', message: `http-${status}` },
      });
    }
  });
});

describe('AC: a simulated HTTP 429 response MUST return transient', () => {
  it('classifies 429 as transient (rate-limit retry hint)', async () => {
    const fakeFetch = makeFetch(async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    }));
    const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'transient', message: 'http-429' },
    });
  });
});

describe('AC: a simulated HTTP 401 response MUST return terminal', () => {
  it('classifies 401 as terminal — auth is not transient', async () => {
    const fakeFetch = makeFetch(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    }));
    const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'terminal', message: 'http-401' },
    });
  });

  it('also classifies 400 / 403 / 404 as terminal', async () => {
    for (const status of [400, 403, 404]) {
      const fakeFetch = makeFetch(async () => ({
        ok: false,
        status,
        json: async () => ({}),
      }));
      const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });
      const result = await handler(validInput, new AbortController().signal);
      expect(result).toMatchObject({
        ok: false,
        error: { kind: 'terminal', message: `http-${status}` },
      });
    }
  });
});

describe('AC: a simulated malformed body MUST return terminal `malformed-provider-response`', () => {
  it('returns terminal when a result row has no URL (fails ResultCardContract.url minLength)', async () => {
    // A row with a missing `url` field projects to a card whose `url` is
    // `""`, which fails `minLength: 1` on `ResultCardContract.url`. The
    // canonical `Value.Check` against `WebSearchOutputContract` surfaces
    // this as `malformed-provider-response` per the failure taxonomy in
    // `.design/components/web-search-tool.md`.
    const ok200Fetch = makeFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ title: 'a title', content: 'a snippet' /* url missing */ }],
      }),
    }));
    const handler = createWebSearchHandler({ fetch: ok200Fetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('malformed-provider-response');
  });

  it('returns terminal when a result row has a non-uri URL (fails format: "uri")', async () => {
    // `mailto:` URLs parse via `new URL(...)` with an empty `hostname`,
    // so the projected `domain` is `""` and the row fails `minLength: 1`
    // on `ResultCardContract.domain`.
    const ok200Fetch = makeFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ title: 't', url: 'mailto:foo@example.com', content: 's' }],
      }),
    }));
    const handler = createWebSearchHandler({ fetch: ok200Fetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('malformed-provider-response');
  });

  it('returns terminal when response.json() itself throws (unparseable body)', async () => {
    const fakeFetch = makeFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    }));
    const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });

    const result = await handler(validInput, new AbortController().signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('malformed-provider-response');
  });
});

describe('AC: missing TAVILY_API_KEY MUST return terminal `missing-api-key` AND make no network call', () => {
  it('returns terminal `missing-api-key` and does not invoke fetch', async () => {
    const fakeFetch = vi.fn<FetchLike>();
    const handler = createWebSearchHandler({
      fetch: fakeFetch as unknown as FetchLike,
      env: {} /* TAVILY_API_KEY absent */,
    });

    const result = await handler(validInput, new AbortController().signal);

    expect(result).toEqual({
      ok: false,
      error: { kind: 'terminal', message: 'missing-api-key' },
    });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('treats an empty-string TAVILY_API_KEY as missing', async () => {
    const fakeFetch = vi.fn<FetchLike>();
    const handler = createWebSearchHandler({
      fetch: fakeFetch as unknown as FetchLike,
      env: { TAVILY_API_KEY: '' },
    });

    const result = await handler(validInput, new AbortController().signal);

    expect(result).toEqual({
      ok: false,
      error: { kind: 'terminal', message: 'missing-api-key' },
    });
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});

describe('AC: a pre-aborted AbortSignal MUST cause the handler to return early without making a network call', () => {
  it('returns terminal `cancelled` and does not invoke fetch when signal is already aborted', async () => {
    const fakeFetch = vi.fn<FetchLike>();
    const handler = createWebSearchHandler({
      fetch: fakeFetch as unknown as FetchLike,
      env: validEnv,
    });
    const ac = new AbortController();
    ac.abort(new Error('budget-exceeded'));

    const result = await handler(validInput, ac.signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('cancelled');
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('returns terminal `cancelled` (NOT transient) when fetch rejects after abort fires mid-request', async () => {
    // Simulate `undici.fetch` rejecting because the signal aborted while
    // the request was in flight. The handler MUST observe the post-abort
    // signal state and surface terminal `cancelled` instead of transient.
    const ac = new AbortController();
    const fakeFetch = makeFetch(async () => {
      ac.abort(new Error('budget-exceeded'));
      throw new DOMException('aborted', 'AbortError');
    });
    const handler = createWebSearchHandler({ fetch: fakeFetch, env: validEnv });

    const result = await handler(validInput, ac.signal);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error.kind).toBe('terminal');
    expect(result.error.message).toBe('cancelled');
  });
});

describe('AC: tool registers itself with the registry under name: "web-search"', () => {
  it('exports `webSearchTool` whose descriptor.name is the kebab-case "web-search"', () => {
    expect(webSearchTool.descriptor.name).toBe('web-search');
  });

  it('descriptor.description is non-empty', () => {
    expect(webSearchTool.descriptor.description.length).toBeGreaterThan(0);
  });

  it('descriptor.inputSchema and outputSchema are TypeBox schemas (defined and object-typed)', () => {
    expect(webSearchTool.descriptor.inputSchema).toBeDefined();
    expect(webSearchTool.descriptor.outputSchema).toBeDefined();
  });
});

describe('AC: handler honors WEB_SEARCH_DEFAULT_MAX_RESULTS env override', () => {
  it('passes the env-supplied default to the provider when input does not specify maxResults', async () => {
    const seenBodies: string[] = [];
    const fakeFetch = makeFetch(async (_url, init) => {
      if (init?.body !== undefined && typeof init.body === 'string') seenBodies.push(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => validTavilyBody,
      };
    });
    const handler = createWebSearchHandler({
      fetch: fakeFetch,
      env: { TAVILY_API_KEY: 'k', WEB_SEARCH_DEFAULT_MAX_RESULTS: '17' },
    });

    // Pass a maxResults of 0 / undefined-ish to fall through to the env
    // override. The contract enforces minimum: 1, so we can't pass 0
    // through the registry — but `createWebSearchHandler` is a direct seam
    // and we want to assert the default-resolver branch. We pass a value
    // outside the contract here precisely to force the env-override fork;
    // production calls always come pre-validated by the registry per AC.
    await handler({ query: 'x', maxResults: 0 } as never, new AbortController().signal);

    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0]).toContain('"max_results":17');
  });
});

describe('AC: handler MUST NOT contain a setTimeout-based retry loop or backoff timer (static scan)', () => {
  // Mirrors the equivalent scan in packages/tools/src/registry.test.ts.
  // STORY-018 will move this rule into a workspace-level lint, but the
  // story scope explicitly calls for an AST/source-level guard here.
  const here = dirname(fileURLToPath(import.meta.url));

  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('src/index.ts contains no setTimeout / setInterval / retry / backoff references', () => {
    const code = stripComments(readFileSync(join(here, 'index.ts'), 'utf8'));
    expect(code).not.toMatch(/\bsetTimeout\s*\(/);
    expect(code).not.toMatch(/\bsetInterval\s*\(/);
    expect(code).not.toMatch(/\bretry\b/i);
    expect(code).not.toMatch(/\bbackoff\b/i);
  });
});

describe('AC: handler MUST NOT import packages/data-* (static scan)', () => {
  // Per `.design/components/web-search-tool.md` and the layer rules in
  // `.design/foundation/architecture.md`, the `web-search` tool MUST NOT
  // touch the data layer. STORY-018 wires `enforce-module-boundaries` as
  // the canonical lint; here we guard the boundary at source level so a
  // regression cannot land before that lint rolls out.
  const here = dirname(fileURLToPath(import.meta.url));

  it('src/index.ts does not import any @neo-search/data-* or packages/data-* module', () => {
    const code = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(code).not.toMatch(/@neo-search\/data-/);
    expect(code).not.toMatch(/packages\/data-/);
    // Also forbid better-sqlite3 / fs persistence APIs the data layer uses.
    expect(code).not.toMatch(/better-sqlite3/);
  });
});

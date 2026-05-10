/**
 * `@neo-search/tools-web-search` — the live web-search tool registration
 * (FR-012, FR-022, FR-023, NFR-005).
 *
 * Implements the contract pinned by `.design/components/web-search-tool.md`:
 * accept `WebSearchInputContract`, call Tavily over `undici.fetch`, parse the
 * response into `WebSearchOutputContract` (whose `results` field is
 * `Type.Array(ResultCardContract)`), and surface every failure mode as the
 * structured `ToolErrorContract` taxonomy from `agent-tools.ts`.
 *
 * The tool DOES NOT retry — that is the agent's `runWithBudget` job per I-27.
 * The tool DOES NOT touch the data layer — that is the `data-store` tool's
 * job per the layer rules in `.design/foundation/architecture.md`.
 *
 * Public surface:
 *  - `webSearchTool` — the `defineTool` registration the composition root
 *    hands to the registry (FR-022 / I-23).
 *  - `createWebSearchHandler({ fetch, env })` — factory that builds a handler
 *    bound to a specific `fetch` implementation and env reader. The factory
 *    is the testability seam: unit tests inject a stub `fetch`; production
 *    binds `undici.fetch` and `process.env`.
 *
 * Failure taxonomy (verbatim from `web-search-tool.md`):
 *   network throw / 5xx / 429        → { kind: "transient", message }
 *   HTTP 4xx (other)                 → { kind: "terminal", message }
 *   missing TAVILY_API_KEY           → { kind: "terminal", message: "missing-api-key" }
 *   response body fails contract     → { kind: "terminal", message: "malformed-provider-response" }
 *   pre-aborted / mid-request abort  → { kind: "terminal", message: "cancelled" }
 *   input fails input contract       → caught by registry BEFORE handler runs
 */
import { fetch as undiciFetch } from 'undici';
import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { WebSearchInputContract, WebSearchOutputContract } from '@neo-search/contracts';
import type { Result, ResultCardContract, ToolErrorContract } from '@neo-search/contracts';
import { defineTool } from '@neo-search/tools';

// TypeBox 0.33 treats an unknown `format` as a Check failure (see the
// compiler / value-check sources). The two formats this tool's output
// contract uses — `uri` (`ResultCardContract.url`) and `date-time`
// (`WebSearchOutputContract.fetchedAt`) — are NOT registered by default.
// Both `Value.Check` (this handler's defensive validator) and the
// registry's `TypeCompiler.Compile` validator must agree on what counts
// as malformed, which means a runtime format validator MUST be installed
// before this handler runs.
//
// We expose registration as an explicit, named, idempotent helper rather
// than mutating the global TypeBox `FormatRegistry` at module-import
// time. Import-time mutation makes the production-side import order
// influence which validators are active for any other consumer of the
// same TypeBox singleton. The contracts package keeps its analogous shim
// gated the same way (see `packages/contracts/src/__tests__/formats.ts`'s
// `registerFormats()`); this module mirrors that pattern.
//
// The composition root MUST call `registerWebSearchFormats()` once
// before invoking the `web-search` tool. `createWebSearchHandler` does
// NOT call it — the handler is constructed per-request in tests, and
// each construction touching a global would be the same import-time
// mutation in slower motion.
const URI_PATTERN = /^[a-z][a-z0-9+\-.]*:\/\/[^\s/$.?#].[^\s]*$/i;

let formatsRegistered = false;

/**
 * Register the format validators (`uri`, `date-time`) the
 * `WebSearchOutputContract` depends on, on the global TypeBox
 * `FormatRegistry`. Idempotent: subsequent calls are no-ops.
 *
 * Call this once from the composition root that wires `webSearchTool`
 * into the registry. Tests that exercise the validator-driven success
 * path call this in setup; tests that exercise pure failure-shape
 * surfaces (status codes, abort, missing API key) do not need it.
 */
export const registerWebSearchFormats = (): void => {
  if (formatsRegistered) return;
  formatsRegistered = true;
  if (!FormatRegistry.Has('uri')) {
    FormatRegistry.Set('uri', (value) => URI_PATTERN.test(value));
  }
  if (!FormatRegistry.Has('date-time')) {
    FormatRegistry.Set('date-time', (value) => !Number.isNaN(Date.parse(value)));
  }
};

/**
 * Tavily REST endpoint per `.design/technology/tech-stack.md`. Pinned as a
 * module-level constant so a reviewer searching for "tavily.com" finds
 * exactly one hit and a future provider swap is a single-line edit (the
 * provider abstraction the design accommodates per `web-search-tool.md`'s
 * "Variation accommodated" section).
 */
const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

/**
 * Provider name pinned to `"tavily"` literal — `WebSearchOutputContract` will
 * reject any other value. Switching providers is an ADR moment per the
 * design doc.
 */
const PROVIDER_NAME = 'tavily' as const;

/**
 * Default `maxResults` if neither the input nor `WEB_SEARCH_DEFAULT_MAX_RESULTS`
 * supplies one. Pinned to 50 per `.design/components/web-search-tool.md`'s
 * `WebSearchInputContract` declaration (`default: 50`). The contract itself
 * does not auto-apply defaults at runtime; we read the env override here.
 */
const DEFAULT_MAX_RESULTS = 50;

/**
 * Minimal structural type the handler depends on. Both `globalThis.fetch`
 * (Node 22 native, which IS undici's fetch under the hood) and `undici.fetch`
 * are assignable to this. Tests inject a stub matching this signature.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    body?: string;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/**
 * Reader abstraction over `process.env`-shaped maps. Tests inject a plain
 * object so the env can be controlled per-case without leaking to the wider
 * test process.
 */
export interface EnvReader {
  readonly TAVILY_API_KEY?: string | undefined;
  readonly WEB_SEARCH_DEFAULT_MAX_RESULTS?: string | undefined;
}

/**
 * Options accepted by `createWebSearchHandler`. `fetch` and `env` are
 * required so a caller MUST decide whether to bind production defaults
 * (`undici.fetch`, `process.env`) or test stubs — there is no implicit
 * fallback inside this module that would make a misconfigured handler appear
 * to work in unit tests but fail in production.
 *
 * `clock` is the time injection seam mandated by
 * `.design/foundation/conventions.md`'s Determinism rule: time MUST be
 * injected, not read directly from `Date.now()` / `new Date()` inside
 * business logic. The default is wall-clock; tests pin it to assert the
 * `fetchedAt` field on the output contract.
 */
export interface CreateWebSearchHandlerOptions {
  readonly fetch: FetchLike;
  readonly env: EnvReader;
  /**
   * Returns the wall-clock instant used to stamp `WebSearchOutputContract.fetchedAt`.
   * Defaults to `() => new Date()`. Tests pass a fixed `Date` to make
   * the output deterministic.
   */
  readonly clock?: () => Date;
}

const transient = (message: string, cause?: unknown): ToolErrorContract =>
  cause === undefined ? { kind: 'transient', message } : { kind: 'transient', message, cause };

const terminal = (message: string, cause?: unknown): ToolErrorContract =>
  cause === undefined ? { kind: 'terminal', message } : { kind: 'terminal', message, cause };

/**
 * Map an HTTP status to a tool-error `kind`. Per the failure taxonomy in
 * `web-search-tool.md`:
 *   - 5xx and 429 invite retry → `transient`
 *   - other 4xx are terminal (auth, malformed query, etc.)
 */
const classifyStatus = (status: number): 'transient' | 'terminal' => {
  if (status >= 500) return 'transient';
  if (status === 429) return 'transient';
  return 'terminal';
};

/**
 * Derive the `domain` field of a `ResultCardContract` from a result URL. We
 * use the standard `URL` parser; an invalid URL is recovered as the raw
 * string so a single bad row does not poison the whole response — but the
 * downstream output validator will catch the row if neither the URL nor a
 * domain can be extracted.
 */
const deriveDomain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};

/**
 * Tavily's response row shape. We narrow on access — every field is treated
 * as `unknown` until the output contract validator runs.
 */
interface TavilyResultRow {
  title?: unknown;
  url?: unknown;
  content?: unknown;
}

interface TavilyResponseBody {
  results?: unknown;
}

/**
 * Project one Tavily row onto the `ResultCardContract` shape. Coerces
 * non-string fields to empty strings rather than silently dropping the row
 * — the canonical correctness gate is the `Value.Check` against
 * `WebSearchOutputContract` below, which surfaces any malformed row as
 * `malformed-provider-response` per the failure taxonomy in
 * `.design/components/web-search-tool.md`.
 *
 * Per `web-search-tool.md`'s "Response parsing" section, `domain` is
 * derived by `new URL(url).hostname`; we keep that derivation here so the
 * downstream stores (FR-016 cache, FR-009 references) see the same
 * canonical domain.
 */
const parseRow = (row: TavilyResultRow): ResultCardContract => {
  const title = typeof row.title === 'string' ? row.title : '';
  const url = typeof row.url === 'string' ? row.url : '';
  const snippet = typeof row.content === 'string' ? row.content : '';
  const domain = url.length > 0 ? deriveDomain(url) : '';
  return { title, snippet, domain, url };
};

/**
 * Resolve the effective `maxResults`: the explicit input wins; otherwise the
 * `WEB_SEARCH_DEFAULT_MAX_RESULTS` env var (clamped to the contract's bounds);
 * otherwise the module default. The input contract has already validated the
 * input bounds before this handler runs (registry validates per STORY-003).
 *
 * Exported so the env-override branch can be tested directly without
 * forcing an out-of-contract input through the handler. The input
 * accepted here is intentionally narrower than `WebSearchInputContract`
 * — the tests want to assert "what does the resolver do when no
 * `maxResults` is supplied?" without pretending the registry would ever
 * deliver such an input in production.
 */
export const resolveMaxResults = (
  input: { readonly maxResults?: number },
  env: EnvReader,
): number => {
  if (typeof input.maxResults === 'number' && input.maxResults > 0) return input.maxResults;
  const raw = env.WEB_SEARCH_DEFAULT_MAX_RESULTS;
  if (typeof raw === 'string' && raw.length > 0) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000) return parsed;
  }
  return DEFAULT_MAX_RESULTS;
};

/**
 * Build the `web-search` handler bound to the supplied `fetch` and `env`.
 *
 * The returned function is a `ToolHandler<WebSearchInputContract,
 * WebSearchOutputContract>` and is structurally identical to the one the
 * registry calls. It NEVER throws — every failure path returns a structured
 * `Result<…, ToolErrorContract>` per I-26.
 *
 * Failure modes (matching the table in `web-search-tool.md`):
 *  - Pre-aborted signal → terminal `cancelled`, no network call.
 *  - Missing API key → terminal `missing-api-key`, no network call.
 *  - `fetch` rejects (network / abort mid-request) → terminal if abort,
 *    transient otherwise.
 *  - HTTP 5xx / 429 → transient.
 *  - HTTP 4xx (other) → terminal.
 *  - Body fails `WebSearchOutputContract` → terminal `malformed-provider-response`.
 */
export const createWebSearchHandler = (options: CreateWebSearchHandlerOptions) => {
  const { fetch, env, clock = () => new Date() } = options;

  return async (
    input: WebSearchInputContract,
    signal: AbortSignal,
  ): Promise<Result<WebSearchOutputContract, ToolErrorContract>> => {
    // Pre-flight cancellation check. The registry already guards this once
    // before calling the handler, but the handler MUST also short-circuit
    // (per the AC: "a pre-aborted AbortSignal MUST cause the handler to
    // return early without making a network call"). Belt-and-braces here
    // is cheap and locks down the no-network-on-abort guarantee against a
    // future registry refactor.
    if (signal.aborted) {
      return { ok: false, error: terminal('cancelled', signal.reason) };
    }

    const apiKey = env.TAVILY_API_KEY;
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      // Surface as `terminal` per the failure taxonomy: a missing key is a
      // configuration bug, not a transient upstream condition. The agent
      // MUST NOT retry it.
      return { ok: false, error: terminal('missing-api-key') };
    }

    const maxResults = resolveMaxResults(input, env);
    // Send the query body WITHOUT a duplicate `api_key` field. The key
    // travels exclusively in the `Authorization: Bearer ...` header
    // (the form the story scope calls for). Sending it in the body too
    // would double the leakage surface (request logs, error reports,
    // upstream proxies that scrub headers but not bodies) for no
    // additional functional value.
    const requestBody = JSON.stringify({
      query: input.query,
      max_results: maxResults,
    });

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetch(TAVILY_ENDPOINT, {
        method: 'POST',
        body: requestBody,
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (cause) {
      // `undici.fetch` rejects in two relevant cases: (a) network errors
      // (DNS, ECONNRESET, etc.) → transient per the taxonomy; (b)
      // `AbortSignal` fires mid-request → the registry will convert this
      // to a `cancelled` agent error, but the tool MUST still not throw,
      // so we return a terminal `cancelled` result here. We discriminate
      // on the post-fetch signal state because undici raises an
      // `AbortError` whose name is implementation-dependent.
      if (signal.aborted) {
        return { ok: false, error: terminal('cancelled', cause) };
      }
      const message = cause instanceof Error ? cause.message : 'network-error';
      return { ok: false, error: transient(message, cause) };
    }

    if (!response.ok) {
      const kind = classifyStatus(response.status);
      const message = `http-${response.status}`;
      return {
        ok: false,
        error: kind === 'transient' ? transient(message) : terminal(message),
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      // A 200 with an unparseable body IS a malformed-provider-response
      // event per the taxonomy. The output validator below would also
      // catch this, but `response.json()` itself throws on garbage bytes
      // before we ever reach the validator.
      return {
        ok: false,
        error: terminal('malformed-provider-response', cause),
      };
    }

    // Best-effort parse of Tavily's row shape into `ResultCardContract[]`.
    // We trust nothing about the upstream response structure — every field
    // access goes through a typeof guard. The final `Value.Check` against
    // `WebSearchOutputContract` is the canonical correctness gate.
    const tavilyBody = (body ?? {}) as TavilyResponseBody;
    const rawRows = Array.isArray(tavilyBody.results) ? tavilyBody.results : [];
    const results: ResultCardContract[] = [];
    for (const row of rawRows) {
      if (typeof row !== 'object' || row === null) continue;
      results.push(parseRow(row as TavilyResultRow));
    }

    const candidate: WebSearchOutputContract = {
      results,
      // Read time through the injected `clock` per the Determinism rule
      // in `.design/foundation/conventions.md`. The default
      // `() => new Date()` preserves wall-clock production behavior;
      // tests pin it to assert `fetchedAt` exactly.
      fetchedAt: clock().toISOString(),
      provider: PROVIDER_NAME,
    };

    if (!Value.Check(WebSearchOutputContract, candidate)) {
      return {
        ok: false,
        error: terminal('malformed-provider-response'),
      };
    }

    return { ok: true, value: candidate };
  };
};

/**
 * Production-bound default handler. Reads from `process.env` and calls
 * `undici.fetch`. The composition root MUST hand `webSearchTool` to the
 * registry; tests build their own handlers via `createWebSearchHandler` so
 * they can inject stubs.
 *
 * The two getters re-read `process.env` on every property access, so an
 * env var set after registration but before the first invocation is
 * observed correctly — this is what the AC for
 * "A handler invocation with no TAVILY_API_KEY env var MUST return
 * { kind: 'terminal', message: 'missing-api-key' }" requires. We use a
 * plain object with explicit getters rather than a `Proxy` because the
 * surface is exactly two known keys: a `Proxy` would advertise
 * unbounded-key access the type does not actually support.
 */
const defaultEnvReader: EnvReader = {
  get TAVILY_API_KEY() {
    return process.env.TAVILY_API_KEY;
  },
  get WEB_SEARCH_DEFAULT_MAX_RESULTS() {
    return process.env.WEB_SEARCH_DEFAULT_MAX_RESULTS;
  },
};

const defaultHandler = createWebSearchHandler({
  fetch: undiciFetch as unknown as FetchLike,
  env: defaultEnvReader,
});

/**
 * The registered `web-search` tool. Imported by the agent's composition
 * root and handed to `registry.register(...)`. Tests construct their own
 * handler via `createWebSearchHandler` and bypass this registration.
 */
export const webSearchTool = defineTool({
  descriptor: {
    name: 'web-search',
    description: 'Live web search via Tavily — parses provider results into ResultCardContract.',
    inputSchema: WebSearchInputContract,
    outputSchema: WebSearchOutputContract,
  },
  handler: defaultHandler,
});

/**
 * Agent loop core — the five-step orchestration shape pinned in
 * `.design/components/agent.md`.
 *
 * The five steps:
 *   1. Validate input against `AgentSearchRequestContract`.
 *   2. Route per `sourceFilter` via the lookup table (NFR-006 / I-22 / I-24).
 *   3. Invoke tools through the registry, wrapped in `runWithBudget`
 *      (NFR-005 / I-25 / I-27).
 *   4. Synthesize via the injected `SynthesisFn` (FR-013).
 *   5. Return a structured `AgentSearchResponseContract` (FR-023 / I-26).
 *
 * Routing is a `Record<SourceFilter, RouteHandler>` lookup. There is NO
 * `switch (sourceFilter)` block anywhere in this file — the AST scan in
 * STORY-018 enforces this.
 *
 * The agent NEVER imports any `packages/data-*` module — data access goes
 * through the `data-store` tool registered with the registry per ADR 0001
 * (`.design/decisions/0001-layer-boundaries.md`). The `enforce-module-boundaries`
 * lint rule encodes the reverse direction.
 *
 * ---------------------------------------------------------------------------
 * INTENTIONAL DEVIATION from `.design/components/agent.md` and
 * `.design/technology/tech-stack.md`: those documents say the agent "runs
 * LangGraph 0.2.34 over a tool-invocation state graph." This file is a
 * hand-rolled async function with a `Record<SourceFilter, RouteHandler>`
 * dispatch — it does NOT import `@langchain/langgraph` and does NOT
 * instantiate a `StateGraph`.
 *
 * Why the deviation is acceptable here (citation per
 * `.design/foundation/conventions.md` "Comments" — every intentional
 * departure MUST cite the FR/NFR/ADR ID it answers to):
 *
 *  - FR-011 ("Search execution MUST be driven by an agent that orchestrates
 *    tool usage, controls pagination and chunk retrieval, and manages data
 *    flow between layers — not by a thin pass-through API"): the FR's
 *    acceptance criterion is behavioral (orchestration, retries,
 *    cancellation, structured errors). It does NOT pin the implementation
 *    library. The five-step loop, the per-source lookup table, the shared
 *    `runWithBudget`, the AbortSignal propagation, and the structured-error
 *    contract are all present in this file and are exercised by the
 *    STORY-011 acceptance tests; FR-011's behavioral criterion is met.
 *
 *  - NFR-006 ("the system MUST NOT be implementable as a thin pass-through
 *    HTTP wrapper; routing MUST be a lookup table, not a switch"): met by
 *    the `routeHandlers` Record below. The STORY-018 AST scan asserts no
 *    `switch (sourceFilter)` block exists. LangGraph itself was the
 *    tech-stack rationale for NFR-006; the lookup table preserves the
 *    "not a hardcoded pipeline" property without the StateGraph wrapper.
 *
 *  - The runtime behavior is locked by 35 tests in
 *    `agent-loop.test.ts` and `run-with-budget.test.ts` plus the
 *    cross-layer integration spec in `tests/integration/agent-loop.spec.ts`.
 *    A future StateGraph adoption would have to keep those tests green —
 *    the behavior, not the framework, is what FR-011 / NFR-005 / NFR-006
 *    actually pin.
 *
 *  - The reviewer (PR #14, iteration 1) explicitly authorized this path on
 *    the condition this comment cite FR-011/NFR-006 and the runtime
 *    dependency be removed from `services/agent/package.json`. Both have
 *    been done. A follow-up ADR ("hand-rolled agent loop vs. LangGraph
 *    StateGraph") is the right place to formalize this; tracked as a
 *    deferred item in the STORY-011 PR description.
 * ---------------------------------------------------------------------------
 */
import { Value } from '@sinclair/typebox/value';
// The runtime import is the request validator; type-only re-exports of the
// other contracts come through the import-type block below. We keep the
// type-only imports separated from the runtime import so the
// FR-021 single-source-of-truth scan (which greps for inline `type`
// declarations of Contract-suffixed names) does not false-positive on
// inline `type` markers in mixed-import blocks.
import { AgentSearchRequestContract } from '@neo-search/contracts';
import type {
  AgentErrorContract,
  AgentSearchRequestContract as AgentSearchRequest,
  AgentSearchResponseContract as AgentSearchResponse,
  DataStoreInputContract,
  DataStoreOutputContract,
  ResultCardContract,
  Result,
  SearchResponseValueContract,
  SourceFilterEnum,
  WebSearchInputContract,
  WebSearchOutputContract,
} from '@neo-search/contracts';
import type { ToolRegistry } from '@neo-search/tools';
import { DEFAULT_RETRY_POLICY, runWithBudget, wallClock } from './run-with-budget.js';
import type { Clock, RetryPolicy } from './run-with-budget.js';

/**
 * The synthesis seam (FR-013). STORY-012 ships the real implementation;
 * STORY-011 only exposes the injection point. Tests pass a passthrough fake
 * that produces a deterministic answer summary so the loop body can be
 * verified without an LLM call.
 *
 * The function MUST honor `signal` — synthesis runs under the same
 * cancellation scope as every other tool invocation (per
 * `.design/components/agent.md`'s "Cancellation" row).
 */
export type SynthesisFn = (
  query: string,
  results: readonly ResultCardContract[],
  signal: AbortSignal,
) => Promise<Result<SynthesisOutput, AgentErrorContract>>;

/**
 * What synthesis returns: the answer summary text and the supporting
 * references. This is the `SearchResponseValueContract` minus `results` and
 * `pagination`, which the agent fills from the tool layer's output.
 */
export interface SynthesisOutput {
  readonly answer_summary: string;
  readonly references: SearchResponseValueContract['references'];
}

/**
 * Structured log seam — every tool invocation and every retry emits one
 * line. Mirrors `packages/tools/src/logger.ts` shape so the agent and the
 * registry use the same vocabulary.
 *
 * Per `.design/foundation/conventions.md`, every line is a single JSON
 * object with at least `ts`, `level`, `component`, `event`. The agent
 * passes its lines through this seam; production binds a pino sink, tests
 * pass a captured-line spy.
 */
export interface AgentLogger {
  log(level: 'info' | 'warn' | 'error', fields: AgentToolInvokedFields): void;
}

/**
 * Field bag for `agent.tool-invoked` (per the story scope: "every tool
 * invocation emits `agent.tool-invoked` with `tool`, `outcome`, `attempt`,
 * `elapsedMs`").
 *
 * Per `.design/foundation/conventions.md` "Logging": every line MUST carry
 * `component` and `event` (in `<component>.<verb>` form). The `component`
 * field is supplied by the bound logger at the production sink (matches
 * the directory under `components/` — i.e. `agent`). The `event` field is
 * supplied here so the agent's call site is the single source of truth for
 * the event token.
 */
export interface AgentToolInvokedFields {
  readonly event: 'agent.tool-invoked';
  readonly tool: string;
  readonly outcome: 'ok' | 'transient' | 'terminal' | 'cancelled' | 'validation';
  readonly attempt: number;
  readonly elapsedMs: number;
  readonly note?: string;
}

const silentAgentLogger: AgentLogger = {
  log() {
    /* intentionally no-op */
  },
};

/**
 * Inputs the agent factory accepts.
 *
 * `registry` is the only legal seam between the agent and the rest of the
 * system (ADR 0001). `synthesize` is the FR-013 hook STORY-012 fills in.
 * `clock` is the time injection seam mandated by
 * `.design/foundation/conventions.md` "Determinism"; tests pass a
 * controllable clock, production passes `wallClock`. `logger` is optional
 * and defaults to a silent sink so tests do not require log assertions to
 * exercise the loop.
 */
export interface CreateAgentOptions {
  readonly registry: ToolRegistry;
  readonly synthesize: SynthesisFn;
  /** Defaults to `wallClock`. */
  readonly clock?: Clock;
  /** Defaults to `DEFAULT_RETRY_POLICY` (NFR-005 / OQ-001). */
  readonly retryPolicy?: RetryPolicy;
  /** Optional ID generator for `history.append`. Defaults to `crypto.randomUUID`. */
  readonly idGenerator?: () => string;
  /** Wall-clock now() reader for `history.append.ts`. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
  /** Optional structured logger. Defaults to a silent sink. */
  readonly logger?: AgentLogger;
  /** Optional max-results bound for the LIVE web-search tool. Defaults to 50. */
  readonly maxLiveResults?: number;
}

/**
 * The function the API hands a request to. Returns a discriminated-union
 * `Result<value, error>` with NEVER a thrown exception across this seam
 * (FR-023 / I-26).
 */
export type AgentFn = (request: unknown, signal: AbortSignal) => Promise<AgentSearchResponse>;

/**
 * Build the agent function bound to a specific `registry`, `synthesize`,
 * and `clock`. The returned function is the API ↔ Agent boundary surface
 * (per `.design/components/communication.md` Edge 2).
 */
export const createAgent = (options: CreateAgentOptions): AgentFn => {
  const registry = options.registry;
  const synthesize = options.synthesize;
  const clock = options.clock ?? wallClock;
  const retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const logger = options.logger ?? silentAgentLogger;
  const idGenerator = options.idGenerator ?? defaultIdGenerator;
  const now = options.now ?? ((): Date => new Date());
  const maxLiveResults = options.maxLiveResults ?? 50;

  /**
   * Invoke a tool via the registry under the shared retry helper. The agent
   * NEVER calls `registry.invoke` directly — every invocation goes through
   * this wrapper so:
   *   1. retries are uniform (`runWithBudget`);
   *   2. cancellation is uniform (the budget-derived signal);
   *   3. logging is uniform (`agent.tool-invoked` lines).
   *
   * Returns the agent-shaped `Result<O, AgentErrorContract>` — the helper
   * has already mapped the tool-error taxonomy to the agent-error one.
   */
  const invokeTool = async <I, O>(
    tool: string,
    input: I,
    budgetMs: number,
    upstream: AbortSignal,
  ): Promise<Result<O, AgentErrorContract>> => {
    const startedAt = now().getTime();
    let attempts = 0;
    const result = await runWithBudget<O>(
      async (derivedSignal) => {
        attempts++;
        const attemptStart = now().getTime();
        const r = await registry.invoke<I, O>(tool, input, derivedSignal);
        const elapsedMs = now().getTime() - attemptStart;
        if (r.ok) {
          logger.log('info', {
            event: 'agent.tool-invoked',
            tool,
            outcome: 'ok',
            attempt: attempts,
            elapsedMs,
          });
        } else {
          logger.log(r.error.kind === 'transient' ? 'warn' : 'error', {
            event: 'agent.tool-invoked',
            tool,
            outcome: r.error.kind,
            attempt: attempts,
            elapsedMs,
          });
        }
        return r;
      },
      retryPolicy,
      { totalMs: budgetMs, signal: upstream, clock },
    );

    if (!result.ok) {
      logger.log(result.error.kind === 'cancelled' ? 'warn' : 'error', {
        event: 'agent.tool-invoked',
        tool,
        outcome: result.error.kind,
        attempt: attempts,
        elapsedMs: now().getTime() - startedAt,
        note: 'final',
      });
    }

    return result;
  };

  /**
   * Per-source-filter route handler. Each handler returns the parsed
   * `ResultCard[]` for synthesis OR an agent error to short-circuit the
   * loop.
   */
  type RouteHandler = (
    request: AgentSearchRequest,
    signal: AbortSignal,
  ) => Promise<
    Result<
      {
        readonly results: ResultCardContract[];
        readonly pagination: SearchResponseValueContract['pagination'];
      },
      AgentErrorContract
    >
  >;

  /**
   * LIVE handler — the canonical orchestration:
   *   1. invoke `web-search` (under `runWithBudget`);
   *   2. invoke `data-store` op `cache.write` (always, per I-8 — even on
   *      empty results);
   *   3. invoke `data-store` op `history.append` (always, per I-8);
   *   4. forward parsed results.
   */
  const handleLive: RouteHandler = async (request, signal) => {
    const webSearchResult = await invokeTool<WebSearchInputContract, WebSearchOutputContract>(
      'web-search',
      { query: request.query, maxResults: maxLiveResults },
      request.budgetMs,
      signal,
    );
    if (!webSearchResult.ok) return webSearchResult;

    const results = webSearchResult.value.results;

    // I-8: cache.write MUST happen on every LIVE search, including zero
    // results. The cache acts as the durability point for "what did we just
    // serve?" — skipping it on empty results would create a HISTORY entry
    // without a recoverable payload (per `.design/components/data-layer.md`).
    const cacheWrite = await invokeTool<DataStoreInputContract, DataStoreOutputContract>(
      'data-store',
      { op: 'cache.write', query: request.query, results },
      request.budgetMs,
      signal,
    );
    if (!cacheWrite.ok) return cacheWrite;
    if (cacheWrite.value.op !== 'cache.write') {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          message: `data-store: expected op cache.write, got ${cacheWrite.value.op}`,
        },
      };
    }
    const chunkIds = cacheWrite.value.chunkIds;

    // I-8: history.append MUST happen on every LIVE search. The agent does
    // not deduplicate — that is the API's job via clientRequestId
    // (`.design/components/agent.md` "Idempotency").
    const historyAppend = await invokeTool<DataStoreInputContract, DataStoreOutputContract>(
      'data-store',
      {
        op: 'history.append',
        entry: {
          // The store stamps `id` and `ts` itself; placeholders satisfy the
          // contract validator (see STORY-006 / data-history's append
          // contract and STORY-010's data-store integration spec).
          id: idGenerator(),
          query: request.query,
          sourceFilter: 'LIVE',
          ts: now().toISOString(),
          resultChunkIds: chunkIds,
        },
      },
      request.budgetMs,
      signal,
    );
    if (!historyAppend.ok) return historyAppend;

    return {
      ok: true,
      value: {
        results,
        pagination: { page: request.page, totalChunks: chunkIds.length, hasMore: false },
      },
    };
  };

  /**
   * HISTORY handler — list the requested page; pick the first entry; cache.read
   * its results. An empty page produces a successful empty-results outcome
   * (the synthesis layer will surface "no history" naturally).
   */
  const handleHistory: RouteHandler = async (request, signal) => {
    const listResult = await invokeTool<DataStoreInputContract, DataStoreOutputContract>(
      'data-store',
      { op: 'history.list', page: request.page },
      request.budgetMs,
      signal,
    );
    if (!listResult.ok) return listResult;
    if (listResult.value.op !== 'history.list') {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          message: `data-store: expected op history.list, got ${listResult.value.op}`,
        },
      };
    }
    const entries = listResult.value.entries;
    const pagination = listResult.value.pagination;

    if (entries.length === 0) {
      return { ok: true, value: { results: [], pagination } };
    }

    // The most-recent entry on the requested page is the canonical
    // "selected" entry. The story scope leaves the selection algorithm to
    // the simplest sensible default — the page's first row — because the
    // request shape carries no entry id (the route handler signature only
    // sees `page`).
    const chosen = entries[0];
    if (!chosen) {
      return { ok: true, value: { results: [], pagination } };
    }

    const readResult = await invokeTool<DataStoreInputContract, DataStoreOutputContract>(
      'data-store',
      { op: 'cache.read', query: chosen.query, page: 1 },
      request.budgetMs,
      signal,
    );
    if (!readResult.ok) return readResult;
    if (readResult.value.op !== 'cache.read') {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          message: `data-store: expected op cache.read, got ${readResult.value.op}`,
        },
      };
    }
    return {
      ok: true,
      value: { results: readResult.value.results, pagination: readResult.value.pagination },
    };
  };

  /**
   * BOOKMARK handler — list the requested page of bookmarks; map them to
   * `ResultCardContract` for synthesis. Per
   * `.design/components/data-layer.md` a bookmark's payload is `unknown`
   * by contract; we forward what we have, letting the synthesis layer
   * decide how to render mixed `result | answer` payloads.
   */
  const handleBookmark: RouteHandler = async (request, signal) => {
    const listResult = await invokeTool<DataStoreInputContract, DataStoreOutputContract>(
      'data-store',
      { op: 'bookmark.list', page: request.page },
      request.budgetMs,
      signal,
    );
    if (!listResult.ok) return listResult;
    if (listResult.value.op !== 'bookmark.list') {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          message: `data-store: expected op bookmark.list, got ${listResult.value.op}`,
        },
      };
    }
    const entries = listResult.value.entries;
    const pagination = listResult.value.pagination;

    // Map bookmark payloads → ResultCard view. Per the contract, a
    // `kind: 'result'` payload IS already a ResultCard-shaped object; a
    // `kind: 'answer'` payload is an answer-summary blob. We forward both
    // through the synthesis layer; STORY-012 owns the rendering policy.
    const results: ResultCardContract[] = [];
    for (const entry of entries) {
      if (entry.kind === 'result' && isResultCard(entry.payload)) {
        results.push(entry.payload);
      }
    }

    return { ok: true, value: { results, pagination } };
  };

  /**
   * The routing lookup (NFR-006 / I-22 / I-24): adding a new source filter
   * is a new entry plus a route handler — the loop body MUST NOT change.
   * STORY-018's AST scan asserts no `switch (sourceFilter)` block exists.
   */
  const routeHandlers: Record<SourceFilterEnum, RouteHandler> = {
    LIVE: handleLive,
    HISTORY: handleHistory,
    BOOKMARK: handleBookmark,
  };

  /**
   * The agent function. NEVER throws across the API ↔ Agent boundary
   * (FR-023, I-26). Every code path within this closure either returns a
   * structured `Result` or is caught by the top-level try/catch below.
   *
   * The try/catch is the FR-023 / I-26 safety net: the agent's tool path
   * goes through `invokeTool`, which is itself wrapped in `runWithBudget`
   * (the helper never throws across its boundary). But `synthesize(...)`
   * is invoked DIRECTLY, not via the registry, so a thrown `SynthesisFn`
   * (or, defensively, an unexpected throw from any other code path inside
   * the closure) would otherwise propagate as a rejected Promise and
   * violate the API ↔ Agent seam contract. The catch maps anything thrown
   * to a `terminal` agent error so the API ↔ Agent boundary always sees a
   * structured `Result<value, error>`.
   *
   * Per `.design/foundation/conventions.md`: "every throw MUST be caught
   * at the layer boundary and converted into the structured result".
   */
  return async (request: unknown, signal: AbortSignal): Promise<AgentSearchResponse> => {
    try {
      // Step 1: validate input. A schema mismatch surfaces as `validation`
      // and MUST NOT invoke any tool.
      if (!Value.Check(AgentSearchRequestContract, request)) {
        const errors = [...Value.Errors(AgentSearchRequestContract, request)];
        const message = errors.length
          ? errors.map((e) => `${e.path || '/'} ${e.message}`).join('; ')
          : 'invalid request';
        return {
          ok: false,
          error: { kind: 'validation', message },
        };
      }

      const validRequest = request as AgentSearchRequest;

      // Step 2: route. The lookup is total over `SourceFilterEnum` — TypeScript
      // checks coverage at compile time.
      const handler = routeHandlers[validRequest.sourceFilter];
      if (!handler) {
        // Defensive: a request that satisfies the contract has a
        // SourceFilter the table covers. This branch only fires if the
        // contract drifted ahead of the lookup (a regression the route-table
        // exhaustiveness test catches).
        return {
          ok: false,
          error: {
            kind: 'terminal',
            message: `no route handler for sourceFilter=${String(validRequest.sourceFilter)}`,
          },
        };
      }

      // Step 3: invoke tools (delegated to the route handler, which uses
      // `invokeTool` internally so every call is `runWithBudget`-wrapped).
      const routed = await handler(validRequest, signal);
      if (!routed.ok) {
        return { ok: false, error: routed.error };
      }

      // Step 4: synthesize. Synthesis MUST run for every source filter so the
      // answer-quality contract stays uniform (per
      // `.design/components/agent.md` and `.design/components/synthesis.md`).
      // The synthesis call uses the SAME upstream signal — synthesis itself
      // does not get a fresh budget; it shares the request budget with tools.
      const synth = await synthesize(validRequest.query, routed.value.results, signal);
      if (!synth.ok) {
        return { ok: false, error: synth.error };
      }

      // Step 5: return.
      return {
        ok: true,
        value: {
          answer_summary: synth.value.answer_summary,
          references: synth.value.references,
          results: routed.value.results,
          pagination: routed.value.pagination,
        },
      };
    } catch (thrown: unknown) {
      // FR-023 / I-26 safety net. A thrown synthesizer (or any other
      // unexpected throw inside this closure) MUST surface as a structured
      // `terminal` error — never as a rejected Promise across the API ↔
      // Agent seam. We emit a structured log line so the failure is
      // forensically visible even though it never reaches the registry.
      const message = thrown instanceof Error ? thrown.message : 'agent: unexpected throw';
      logger.log('error', {
        event: 'agent.tool-invoked',
        tool: 'agent',
        outcome: 'terminal',
        attempt: 1,
        elapsedMs: 0,
        note: 'uncaught-throw',
      });
      return {
        ok: false,
        error: {
          kind: 'terminal',
          message,
          details: thrown,
        },
      };
    }
  };
};

/**
 * Default ID generator for `history.append`. Lives at module scope so the
 * agent factory's signature stays a single-step injection.
 */
const defaultIdGenerator = (): string => {
  // `crypto.randomUUID` is available globally on Node 22+ (per the tech
  // stack pin) without importing `node:crypto`. The `globalThis` reference
  // keeps the module portable to environments where `crypto` lives on the
  // global rather than requiring a node-specific import.
  return globalThis.crypto.randomUUID();
};

/**
 * Best-effort structural check for a `ResultCardContract`-shaped value.
 * Used when projecting bookmark payloads (whose `kind: 'result'` payload
 * is `unknown` per the contract). A loose check here is acceptable —
 * downstream synthesis will run its own validation.
 */
const isResultCard = (value: unknown): value is ResultCardContract => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === 'string' &&
    typeof v.snippet === 'string' &&
    typeof v.domain === 'string' &&
    typeof v.url === 'string'
  );
};

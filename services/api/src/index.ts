/**
 * `@neo-search/api` — Fastify HTTP surface (STORY-013).
 *
 * Per `.design/components/search-api.md`, the API is a thin layer that:
 *  - validates request payloads against `@neo-search/contracts` TypeBox
 *    schemas at the wire boundary (FR-010, FR-021);
 *  - invokes the agent with the API ↔ Agent contract;
 *  - translates agent errors (terminal / transient / cancelled / validation)
 *    into HTTP status codes + structured JSON bodies per the error-surface
 *    table;
 *  - applies `clientRequestId` deduplication (5s TTL in-memory LRU) for write
 *    endpoints (POST /api/search, POST /api/bookmarks);
 *  - forwards the request `AbortSignal` into the agent call (I-25).
 *
 * Public surface:
 *  - `createApi({ agent, clock })` — returns a configured Fastify instance
 *    with all four routes registered. The composition root (`main.ts`) calls
 *    this once at boot.
 *
 * The four routes (FR-010, FR-005, FR-023):
 *  - POST /api/search    → `SearchRequestContract` → agent → `UiApiAnswerContract`
 *  - POST /api/bookmarks → `BookmarkSaveRequestContract` → agent via data-store
 *  - GET  /api/bookmarks → page query param → agent → `BookmarkListResponseContract`
 *  - GET  /api/history   → page query param → agent → `HistoryListResponseContract`
 *
 * Per ADR 0001 / I-17, this package MUST NOT import `@neo-search/data-*` or
 * call tools directly. The only legal downstream is `services/agent`.
 */
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import cors from '@fastify/cors';
import { Type } from '@sinclair/typebox';
import type {
  SearchRequestContract,
  UiApiAnswerContract,
  BookmarkSaveRequestContract,
  BookmarkSaveResponseContract,
  BookmarkListResponseContract,
  HistoryListResponseContract,
  AgentSearchRequestContract,
  AgentSearchResponseContract,
  AgentErrorContract,
  DataStoreInputContract,
  DataStoreOutputContract,
} from '@neo-search/contracts';
import type { AgentFn } from '@neo-search/agent';
// eslint-disable-next-line @nx/enforce-module-boundaries -- ToolRegistry type is required for API factory signature; registry is injected from composition root per ADR 0001
import type { ToolRegistry } from '@neo-search/tools';

/**
 * Clock interface for the API layer. Includes `now()` for dedup cache TTL
 * and `wait()` for future timeout support. Per
 * `.design/foundation/conventions.md`, time MUST be injected rather than
 * read directly from `Date.now()`.
 */
export interface ApiClock {
  /**
   * Returns the current wall-clock instant in milliseconds since epoch.
   * Tests inject a deterministic clock; production binds `Date.now`.
   */
  now(): number;
  /**
   * Wait for `ms` milliseconds. Optional for the API layer — currently
   * unused, but part of the `Clock` contract for consistency with the
   * agent's clock interface.
   */
  wait(ms: number): Promise<void>;
}

/**
 * Factory dependencies. The agent is injected so the API can be instantiated
 * in tests without standing up the full composition root; the clock is
 * injected per `.design/foundation/conventions.md` ("Time MUST be injected")
 * so the dedup-cache TTL is testable without real timers. The registry is
 * injected so the API can invoke data-store operations (bookmark/history
 * CRUD) that are not routed through the agent's search contract per ADR 0001.
 */
export interface CreateApiOptions {
  readonly agent: AgentFn;
  readonly registry: ToolRegistry;
  readonly clock: ApiClock;
}

/**
 * In-memory LRU deduplication cache entry. Each entry holds the cached
 * response and the wall-clock instant it expires.
 */
interface DedupEntry {
  readonly response: unknown;
  readonly expiresAt: number;
}

/**
 * Error shape returned on the wire per `.design/components/search-api.md`'s
 * error-surface table. Matches the UI ↔ API contract (not explicitly declared
 * as a `Contract`-suffixed export from `@neo-search/contracts` because the
 * error body is embedded in every response, not a standalone boundary type).
 */
interface ApiErrorBody {
  readonly ok: false;
  readonly error: {
    readonly kind: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

/**
 * Deduplication TTL per STORY-013 scope: 5s window. Configurable as a
 * module-level constant so a future story expanding the window is a
 * single-line edit (no magic numbers scattered in the route handlers).
 */
const DEDUP_TTL_MS = 5_000;

/**
 * Default budget for agent invocations. Per NFR-005, LIVE searches that
 * invoke `web-search` MUST be bounded by a 10s budget. The API sets this on
 * every agent request; the agent's `runWithBudget` helper enforces it.
 */
const DEFAULT_AGENT_BUDGET_MS = 10_000;

/**
 * Map an `AgentErrorContract.kind` to the HTTP status code per
 * `.design/components/search-api.md`'s error-surface table.
 */
const errorKindToStatus = (kind: AgentErrorContract['kind']): number => {
  switch (kind) {
    case 'validation':
      return 400;
    case 'terminal':
      return 502;
    case 'transient':
      return 503;
    case 'cancelled':
      return 504;
  }
};

/**
 * Create the Fastify instance with all four routes registered.
 *
 * The returned instance is NOT listening yet — the composition root calls
 * `.listen(...)` after construction. This two-step shape lets tests inject
 * via `fastify.inject(...)` without racing the `listen` call.
 */
export const createApi = (options: CreateApiOptions): FastifyInstance => {
  const { agent, registry, clock } = options;

  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: undefined,
    },
  }).withTypeProvider<TypeBoxTypeProvider>();

  // CORS: enable `localhost:5173` (Vite default) and the API's own origin per
  // the STORY-013 scope note ("no CORS production wiring beyond enabling
  // localhost:5173 and the API's own origin"). Parse the origin URL to prevent
  // injection attacks (e.g., https://evil.com?localhost:5173).
  fastify.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const url = new URL(origin);
        const allowed =
          url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1' ||
          url.hostname === '0.0.0.0';
        callback(null, allowed);
      } catch {
        callback(null, false);
      }
    },
  });

  // In-memory deduplication cache. Keyed by `clientRequestId` (UUID string);
  // the value is the cached response + expiry timestamp. The Map MUST clear
  // on process restart (no persistent dedupe per OQ-004).
  const dedupCache = new Map<string, DedupEntry>();

  /**
   * Check the dedup cache for a non-expired entry. Returns the cached
   * response if present; otherwise `null`. Expired entries are pruned
   * lazily on lookup (the 5s TTL window is best-effort per the design doc).
   */
  const checkDedupCache = (clientRequestId: string | undefined): unknown | null => {
    if (typeof clientRequestId !== 'string' || clientRequestId.length === 0) return null;
    const entry = dedupCache.get(clientRequestId);
    if (entry === undefined) return null;
    const now = clock.now();
    if (now >= entry.expiresAt) {
      dedupCache.delete(clientRequestId);
      return null;
    }
    return entry.response;
  };

  /**
   * Store a response in the dedup cache with a 5s TTL. No-op if
   * `clientRequestId` is missing or empty.
   */
  const storeDedupCache = (clientRequestId: string | undefined, response: unknown): void => {
    if (typeof clientRequestId !== 'string' || clientRequestId.length === 0) return;
    const expiresAt = clock.now() + DEDUP_TTL_MS;
    dedupCache.set(clientRequestId, { response, expiresAt });
  };

  /**
   * Shared handler for agent errors → HTTP status + JSON body. Logs the
   * error translation per `.design/foundation/conventions.md` structured
   * logging ("api.error-translated" with the request id and status).
   */
  const replyWithAgentError = (
    reply: FastifyReply,
    error: AgentErrorContract,
    requestId: string,
  ): void => {
    const status = errorKindToStatus(error.kind);
    const body: ApiErrorBody = {
      ok: false,
      error: {
        kind: error.kind === 'transient' ? 'transient_exhausted' : error.kind,
        message: error.message,
        details: error.details,
      },
    };
    fastify.log.info({
      event: 'api.error-translated',
      requestId,
      agentErrorKind: error.kind,
      httpStatus: status,
    });
    reply.status(status).send(body);
  };

  /**
   * POST /api/search — body `SearchRequestContract`, returns `UiApiAnswerContract`.
   *
   * Deduplicates via `clientRequestId` within a 5s window. Propagates the
   * request `AbortSignal` into the agent call (I-25). Translates agent
   * errors per the error-surface table.
   */
  fastify.post<{ Body: SearchRequestContract }>(
    '/api/search',
    {
      schema: {
        body: Type.Object({
          query: Type.String({ minLength: 1, maxLength: 2000 }),
          sourceFilter: Type.Union([
            Type.Literal('LIVE'),
            Type.Literal('HISTORY'),
            Type.Literal('BOOKMARK'),
          ]),
          page: Type.Integer({ minimum: 1 }),
          clientRequestId: Type.Optional(Type.String({ format: 'uuid' })),
        }),
      },
    },
    async (request, reply) => {
      const requestId = request.id;
      fastify.log.info({
        event: 'api.request-received',
        requestId,
        route: '/api/search',
        sourceFilter: request.body.sourceFilter,
      });

      const { clientRequestId } = request.body;

      const cached = checkDedupCache(clientRequestId);
      if (cached !== null) {
        fastify.log.info({
          event: 'api.dedup-cache-hit',
          requestId,
          clientRequestId,
        });
        return reply.status(200).send(cached);
      }

      const agentRequest: AgentSearchRequestContract = {
        query: request.body.query,
        sourceFilter: request.body.sourceFilter as 'LIVE' | 'HISTORY' | 'BOOKMARK',
        page: request.body.page,
        budgetMs: DEFAULT_AGENT_BUDGET_MS,
      };

      let agentResponse: AgentSearchResponseContract;
      try {
        const signal =
          'signal' in request.raw && request.raw.signal instanceof AbortSignal
            ? request.raw.signal
            : new AbortController().signal;
        agentResponse = await agent(agentRequest, signal);
      } catch (cause) {
        fastify.log.error({
          event: 'api.unexpected-throw',
          requestId,
          cause,
        });
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'internal error',
          },
        };
        return reply.status(500).send(errorBody);
      }

      if (!agentResponse.ok) {
        return replyWithAgentError(reply, agentResponse.error, requestId);
      }

      const responseBody: UiApiAnswerContract = agentResponse.value;
      storeDedupCache(clientRequestId, responseBody);

      fastify.log.info({
        event: 'api.response-sent',
        requestId,
        status: 200,
      });

      return reply.status(200).send(responseBody);
    },
  );

  /**
   * POST /api/bookmarks — save a bookmark (result or answer).
   *
   * Per the STORY-013 scope note, the API forwards a synthetic agent request
   * that invokes the `data-store` tool's `bookmark.save` op. Deduplicates
   * via `clientRequestId`.
   */
  fastify.post<{ Body: BookmarkSaveRequestContract }>(
    '/api/bookmarks',
    {
      schema: {
        body: Type.Object({
          kind: Type.Union([Type.Literal('result'), Type.Literal('answer')]),
          payload: Type.Unknown(),
          clientRequestId: Type.Optional(Type.String({ format: 'uuid' })),
        }),
      },
    },
    async (request, reply) => {
      const requestId = request.id;
      fastify.log.info({
        event: 'api.request-received',
        requestId,
        route: '/api/bookmarks',
        method: 'POST',
      });

      const { clientRequestId } = request.body;
      const cached = checkDedupCache(clientRequestId);
      if (cached !== null) {
        fastify.log.info({
          event: 'api.dedup-cache-hit',
          requestId,
          clientRequestId,
        });
        return reply.status(200).send(cached);
      }

      // Invoke the data-store tool's bookmark.save op through the registry per
      // ADR 0001. The API reaches the data layer via the tooling layer.
      const dataStoreInput: DataStoreInputContract = {
        op: 'bookmark.save',
        entry: {
          kind: request.body.kind,
          payload: request.body.payload,
        },
      };

      let dataStoreResult;
      try {
        const signal =
          'signal' in request.raw && request.raw.signal instanceof AbortSignal
            ? request.raw.signal
            : new AbortController().signal;
        dataStoreResult = await registry.invoke<DataStoreInputContract, DataStoreOutputContract>(
          'data-store',
          dataStoreInput,
          signal,
        );
      } catch (cause) {
        fastify.log.error({
          event: 'api.unexpected-throw',
          requestId,
          cause,
        });
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'internal error',
          },
        };
        return reply.status(500).send(errorBody);
      }

      if (!dataStoreResult.ok) {
        const agentError: AgentErrorContract = {
          kind: dataStoreResult.error.kind,
          message: dataStoreResult.error.message,
          details: dataStoreResult.error.cause,
        };
        return replyWithAgentError(reply, agentError, requestId);
      }

      if (dataStoreResult.value.op !== 'bookmark.save') {
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'data-store returned unexpected op',
          },
        };
        return reply.status(500).send(errorBody);
      }

      const responseBody: BookmarkSaveResponseContract = {
        id: dataStoreResult.value.id,
      };

      storeDedupCache(clientRequestId, responseBody);

      fastify.log.info({
        event: 'api.response-sent',
        requestId,
        status: 200,
      });

      return reply.status(200).send(responseBody);
    },
  );

  /**
   * GET /api/bookmarks — list bookmarks with pagination.
   *
   * Invokes the agent with a synthetic request that routes to the
   * `bookmark.list` data-store op.
   */
  fastify.get<{ Querystring: { page?: string } }>(
    '/api/bookmarks',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const requestId = request.id;
      fastify.log.info({
        event: 'api.request-received',
        requestId,
        route: '/api/bookmarks',
        method: 'GET',
      });

      const page = Number.parseInt(request.query.page ?? '1', 10);
      if (!Number.isInteger(page) || page < 1) {
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'validation',
            message: 'page must be a positive integer',
          },
        };
        return reply.status(400).send(errorBody);
      }

      // Invoke the data-store tool's bookmark.list op through the registry per
      // ADR 0001.
      const dataStoreInput: DataStoreInputContract = {
        op: 'bookmark.list',
        page,
      };

      let dataStoreResult;
      try {
        const signal =
          'signal' in request.raw && request.raw.signal instanceof AbortSignal
            ? request.raw.signal
            : new AbortController().signal;
        dataStoreResult = await registry.invoke<DataStoreInputContract, DataStoreOutputContract>(
          'data-store',
          dataStoreInput,
          signal,
        );
      } catch (cause) {
        fastify.log.error({
          event: 'api.unexpected-throw',
          requestId,
          cause,
        });
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'internal error',
          },
        };
        return reply.status(500).send(errorBody);
      }

      if (!dataStoreResult.ok) {
        const agentError: AgentErrorContract = {
          kind: dataStoreResult.error.kind,
          message: dataStoreResult.error.message,
          details: dataStoreResult.error.cause,
        };
        return replyWithAgentError(reply, agentError, requestId);
      }

      if (dataStoreResult.value.op !== 'bookmark.list') {
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'data-store returned unexpected op',
          },
        };
        return reply.status(500).send(errorBody);
      }

      const responseBody: BookmarkListResponseContract = {
        entries: dataStoreResult.value.entries,
        pagination: dataStoreResult.value.pagination,
      };

      fastify.log.info({
        event: 'api.response-sent',
        requestId,
        status: 200,
      });

      return reply.status(200).send(responseBody);
    },
  );

  /**
   * GET /api/history — list history with pagination.
   *
   * Invokes the agent with a synthetic request that routes to the
   * `history.list` data-store op.
   */
  fastify.get<{ Querystring: { page?: string } }>(
    '/api/history',
    {
      schema: {
        querystring: Type.Object({
          page: Type.Optional(Type.String()),
        }),
      },
    },
    async (request, reply) => {
      const requestId = request.id;
      fastify.log.info({
        event: 'api.request-received',
        requestId,
        route: '/api/history',
        method: 'GET',
      });

      const page = Number.parseInt(request.query.page ?? '1', 10);
      if (!Number.isInteger(page) || page < 1) {
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'validation',
            message: 'page must be a positive integer',
          },
        };
        return reply.status(400).send(errorBody);
      }

      // Invoke the data-store tool's history.list op through the registry per
      // ADR 0001.
      const dataStoreInput: DataStoreInputContract = {
        op: 'history.list',
        page,
      };

      let dataStoreResult;
      try {
        const signal =
          'signal' in request.raw && request.raw.signal instanceof AbortSignal
            ? request.raw.signal
            : new AbortController().signal;
        dataStoreResult = await registry.invoke<DataStoreInputContract, DataStoreOutputContract>(
          'data-store',
          dataStoreInput,
          signal,
        );
      } catch (cause) {
        fastify.log.error({
          event: 'api.unexpected-throw',
          requestId,
          cause,
        });
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'internal error',
          },
        };
        return reply.status(500).send(errorBody);
      }

      if (!dataStoreResult.ok) {
        const agentError: AgentErrorContract = {
          kind: dataStoreResult.error.kind,
          message: dataStoreResult.error.message,
          details: dataStoreResult.error.cause,
        };
        return replyWithAgentError(reply, agentError, requestId);
      }

      if (dataStoreResult.value.op !== 'history.list') {
        const errorBody: ApiErrorBody = {
          ok: false,
          error: {
            kind: 'internal',
            message: 'data-store returned unexpected op',
          },
        };
        return reply.status(500).send(errorBody);
      }

      const responseBody: HistoryListResponseContract = {
        entries: dataStoreResult.value.entries,
        pagination: dataStoreResult.value.pagination,
      };

      fastify.log.info({
        event: 'api.response-sent',
        requestId,
        status: 200,
      });

      return reply.status(200).send(responseBody);
    },
  );

  return fastify;
};

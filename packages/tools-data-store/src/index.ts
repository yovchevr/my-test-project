/**
 * `@neo-search/tools-data-store` — the `data-store` tool registration
 * (FR-014, FR-015, FR-016, FR-018, FR-022, FR-023, NFR-006; ADR 0001).
 *
 * Implements the contract pinned by `.design/components/data-store-tool.md`:
 * a thin op-discriminated facade over the three data-layer stores. The agent
 * reaches the data layer ONLY through this tool — STORY-018's
 * `enforce-module-boundaries` rule encodes the reverse direction (no
 * agent → data direct import).
 *
 * Per ADR 0001 (`.design/decisions/0001-layer-boundaries.md`), this is the
 * structural seam that makes the four-layer boundary discipline enforceable.
 * Together with `web-search` (STORY-009) it satisfies the FR-022 floor of
 * two registered tools.
 *
 * Public surface:
 *   - `dataStoreTool` — the `defineTool` registration the composition root
 *     hands to the registry. Bound to a placeholder handler that fails
 *     terminal until the composition root rebuilds it via
 *     `createDataStoreHandler` with real stores.
 *   - `createDataStoreHandler({ historyStore, bookmarkStore, searchCache })`
 *     — factory that wires the seven ops to concrete stores. Tests inject
 *     fakes; production binds the real `createHistoryStore` /
 *     `createBookmarkStore` / `createSearchCache` instances.
 *
 * Routing is a `Record<DataStoreOp, OpHandler>` lookup table (NOT a
 * `switch`) per NFR-006 / I-22 / I-23: adding a new op is a new entry plus a
 * new contract variant — no other file changes. STORY-018's AST scan asserts
 * no `switch (op)` block exists in this package; the unit-test
 * "extends to a synthetic 8th op" case is the regression guard.
 *
 * Failure taxonomy (per `.design/components/data-store-tool.md`):
 *   pre-aborted signal              → { kind: "terminal", message: "cancelled" }
 *   `bookmark.get` not-found        → { kind: "validation", message: "not-found" }
 *   any thrown store exception      → { kind: "terminal", message }
 *   schema-shape output mismatch    → caught by the registry as terminal
 *
 * Layering (per `.design/foundation/architecture.md`): this package is the
 * ONLY component outside the data-layer packages permitted to import
 * `@neo-search/data-history`, `@neo-search/data-bookmarks`, and
 * `@neo-search/data-cache`. The `enforce-module-boundaries` rule encodes
 * that posture.
 */
import type { Static } from '@sinclair/typebox';
import { defineTool } from '@neo-search/tools';
import { DataStoreInputContract, DataStoreOutputContract } from '@neo-search/contracts';
import type { DataStoreOp, Result, ToolErrorContract } from '@neo-search/contracts';
import type { HistoryStore } from '@neo-search/data-history';
import type { BookmarkStore } from '@neo-search/data-bookmarks';
import type { SearchCache } from '@neo-search/data-cache';

/**
 * Strongly-typed inputs and outputs derived from the contract unions.
 */
type DataStoreInput = Static<typeof DataStoreInputContract>;
type DataStoreOutput = Static<typeof DataStoreOutputContract>;

/**
 * Narrow `DataStoreInput` to the variant carrying a specific `op` literal.
 * Lets each lookup-table entry receive only the input shape it cares about
 * without resorting to a runtime `switch`.
 */
type InputForOp<TOp extends DataStoreOp> = Extract<DataStoreInput, { op: TOp }>;
type OutputForOp<TOp extends DataStoreOp> = Extract<DataStoreOutput, { op: TOp }>;

/**
 * One entry in the routing table. Returns the structured `Result<O, E>`
 * shape — ops that detect a contract-shape mismatch (`bookmark.get`
 * not-found) emit a `validation` error from here; other thrown failures are
 * caught by the wrapping handler and translated to `terminal`.
 */
type OpHandler<TOp extends DataStoreOp> = (
  input: InputForOp<TOp>,
  signal: AbortSignal,
) => Promise<Result<OutputForOp<TOp>, ToolErrorContract>>;

/**
 * The full routing table. The shape is `{ [TOp]: OpHandler<TOp> }`; the
 * mapped-type makes adding a new op a single-entry change, exactly the
 * NFR-006 / I-23 promise.
 */
type DataStoreRoutingTable = {
  [TOp in DataStoreOp]: OpHandler<TOp>;
};

/**
 * Factory dependencies — explicit injection per
 * `.design/foundation/conventions.md` ("Determinism" and the STORY-010 scope
 * note: "explicit dependency injection so unit tests can swap stores for
 * fakes"). Every store's interface comes from its own data-layer package.
 */
export interface CreateDataStoreHandlerOptions {
  readonly historyStore: HistoryStore;
  readonly bookmarkStore: BookmarkStore;
  readonly searchCache: SearchCache;
}

const terminal = (message: string, cause?: unknown): ToolErrorContract =>
  cause === undefined ? { kind: 'terminal', message } : { kind: 'terminal', message, cause };

const validation = (message: string): ToolErrorContract => ({
  kind: 'validation',
  message,
});

/**
 * Stringify a thrown value for the `terminal.message` field. We prefer the
 * `Error.message` if available so a SQLite I/O error surfaces as a useful
 * description rather than `[object Object]`. The original throw is
 * preserved on the `cause` field for log forensics.
 */
const messageOf = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  return 'store-threw';
};

/**
 * Build the routing table bound to a specific set of stores. Every handler
 * is expressed as a single `await` against the matching store method —
 * there is no business logic, no caching layer, no per-user gate (per the
 * data-store-tool component's "MUST NOT" list).
 *
 * Handlers MAY throw — the wrapping `createDataStoreHandler` catches every
 * exception and translates it to `terminal`. The one exception is
 * `bookmark.get`, which surfaces a missing-by-id read as `validation`
 * (`not-found`) BEFORE returning, because the output union demands an
 * `entry`, not `entry | null` — there is no `null`-bearing variant for the
 * tool to produce.
 */
const buildRoutingTable = (deps: CreateDataStoreHandlerOptions): DataStoreRoutingTable => {
  const { historyStore, bookmarkStore, searchCache } = deps;

  return {
    'history.append': async (input, signal) => {
      const { id } = await historyStore.append(input.entry, signal);
      return { ok: true, value: { op: 'history.append', id } };
    },
    'history.list': async (input, signal) => {
      const { entries, pagination } = await historyStore.list(input.page, signal);
      return { ok: true, value: { op: 'history.list', entries, pagination } };
    },
    'bookmark.save': async (input, signal) => {
      const { id } = await bookmarkStore.save(input.entry, signal);
      return { ok: true, value: { op: 'bookmark.save', id } };
    },
    'bookmark.list': async (input, signal) => {
      const { entries, pagination } = await bookmarkStore.list(input.page, signal);
      return { ok: true, value: { op: 'bookmark.list', entries, pagination } };
    },
    'bookmark.get': async (input, signal) => {
      const entry = await bookmarkStore.get(input.id, signal);
      if (entry === null) {
        // The output union has no `entry: BookmarkEntry | null` variant — a
        // missing id is a contract-shape mismatch on the OUTPUT, not a store
        // failure. Surface as `validation` per the STORY-010 scope note:
        // "returns { kind: 'validation', message: 'not-found' } if null".
        return { ok: false, error: validation('not-found') };
      }
      return { ok: true, value: { op: 'bookmark.get', entry } };
    },
    'cache.write': async (input, signal) => {
      const { chunkIds } = await searchCache.write(input.query, input.results, signal);
      return { ok: true, value: { op: 'cache.write', chunkIds } };
    },
    'cache.read': async (input, signal) => {
      const { results, chunksRead, pagination } = await searchCache.read(
        input.query,
        input.page,
        signal,
      );
      return {
        ok: true,
        // FR-018 / NFR-004: `chunksRead` is propagated unchanged so the agent
        // and the API can surface it for verifiability per I-10.
        value: { op: 'cache.read', results, chunksRead, pagination },
      };
    },
  };
};

/**
 * Build the `data-store` handler bound to the supplied stores.
 *
 * Returned function is structurally a `ToolHandler<DataStoreInput,
 * DataStoreOutput>` and is identical to the one the registry calls. It
 * NEVER throws — every failure path returns a structured
 * `Result<…, ToolErrorContract>` per I-26.
 *
 * Failure modes:
 *  - Pre-aborted signal → `terminal: cancelled`, no store call invoked.
 *  - Unknown op (defensive — the registry validates the input contract
 *    first) → `terminal: unknown-op`.
 *  - Store throws (e.g. SQLite I/O error, RangeError on bad page) →
 *    `terminal: <error.message>`, with the original throw on `cause`.
 *  - `bookmark.get` for an unknown id → `validation: not-found`.
 */
export const createDataStoreHandler = (
  options: CreateDataStoreHandlerOptions,
): ((
  input: DataStoreInput,
  signal: AbortSignal,
) => Promise<Result<DataStoreOutput, ToolErrorContract>>) => {
  const routes = buildRoutingTable(options);

  return async (
    input: DataStoreInput,
    signal: AbortSignal,
  ): Promise<Result<DataStoreOutput, ToolErrorContract>> => {
    // Pre-flight cancellation check. The registry guards this once before
    // the handler runs, but the AC requires the handler ALSO short-circuit:
    // "a pre-aborted AbortSignal MUST cause the handler to return early
    // without invoking any store method." Defence-in-depth here locks down
    // the no-side-effects-on-abort guarantee against a future registry
    // refactor.
    if (signal.aborted) {
      return { ok: false, error: terminal('cancelled', signal.reason) };
    }

    // Lookup-table dispatch. The cast preserves the per-op input narrowing
    // because TypeScript cannot statically prove the lookup result aligns
    // with the input variant — `Record<K, V>` indexed by `K` returns the
    // homogeneous `V`, losing the `Extract<T, { op: K }>` link. The runtime
    // safety comes from the registry's input-validator: by the time we
    // reach here, `input` matches `DataStoreInputContract`, so its `op`
    // field is one of the seven literals and the table holds a handler for
    // each.
    const handler = (routes as Record<string, OpHandler<DataStoreOp> | undefined>)[input.op];
    if (handler === undefined) {
      // Defensive: the registry validates the input contract before the
      // handler runs (STORY-003), so this branch only fires if a caller
      // bypasses the registry (e.g. a test driving the handler directly
      // with a malformed op). Surface as terminal per
      // `.design/components/data-store-tool.md`'s "schema-shape violations
      // on output ... MUST surface as terminal".
      return { ok: false, error: terminal(`unknown-op: ${String(input.op)}`) };
    }

    try {
      // The cast is the inverse of the lookup-shape erasure above — we
      // reattach the variant input the handler actually expects. The
      // runtime invariant (`input.op === <op>` matches the table key) is
      // enforced by the contract validator upstream.
      return await handler(input as InputForOp<DataStoreOp>, signal);
    } catch (cause) {
      // I-26 / FR-023: every store throw MUST be caught at the layer
      // boundary and converted into the structured result shape. The
      // registry catches throws as a defensive backstop, but the AC
      // requires THIS handler to do the translation explicitly so the
      // `terminal.message` is store-aware (e.g. the SQLite error message
      // verbatim) rather than the registry's generic `handler-threw:
      // <message>` wrapper.
      return { ok: false, error: terminal(messageOf(cause), cause) };
    }
  };
};

/**
 * The registered `data-store` tool. The composition root rebuilds the
 * handler with real stores via `createDataStoreHandler` before handing the
 * tool to the registry — this default registration is a syntactically valid
 * `RegisteredTool` whose handler returns a terminal error so a misconfigured
 * composition (forgot to swap the handler) is loud at runtime rather than
 * silently using uninitialized stores.
 *
 * Tests build their own handler via `createDataStoreHandler` and bypass
 * this registration.
 */
export const dataStoreTool = defineTool({
  descriptor: {
    name: 'data-store',
    description:
      'Op-discriminated facade over the history store, bookmark store, and search cache.',
    inputSchema: DataStoreInputContract,
    outputSchema: DataStoreOutputContract,
  },
  handler: async (_input, _signal) => ({
    ok: false,
    error: terminal('handler-not-bound: composition root MUST call createDataStoreHandler'),
  }),
});

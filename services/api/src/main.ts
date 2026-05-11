/**
 * `services/api/src/main.ts` — composition root (STORY-013).
 *
 * Per `.design/components/search-api.md` and the STORY-013 scope, this module:
 *  - constructs the tool registry and registers `web-search` + `data-store`;
 *  - instantiates the real data-layer stores (history, bookmarks, cache) from
 *    a `NEO_SEARCH_DATA_DIR` directory (default: `./.data` relative to cwd);
 *  - builds the agent with the real synthesizer (env-driven model + prompt);
 *  - binds the API via `createApi({ agent, clock })`;
 *  - listens on `PORT` (default 3001).
 *
 * Per `.design/foundation/conventions.md`, this is the ONLY place in the API
 * package permitted to import the tool packages directly — everywhere else
 * goes through the agent.
 *
 * The @nx/enforce-module-boundaries rule is disabled for this file because
 * the composition root explicitly violates the layer boundaries by design
 * (FR-024 / ADR 0001). This is the single controlled boundary-crossing point
 * where the API wires the agent with real tools and data stores.
 */
/* eslint-disable @nx/enforce-module-boundaries */
import { createApi, type ApiClock } from './index.js';
import { createAgent, createSynthesizer, wallClock } from '@neo-search/agent';
import { createRegistry } from '@neo-search/tools';
import { webSearchTool, registerWebSearchFormats } from '@neo-search/tools-web-search';
import { dataStoreTool, createDataStoreHandler } from '@neo-search/tools-data-store';
import { createHistoryStore } from '@neo-search/data-history';
import { createBookmarkStore } from '@neo-search/data-bookmarks';
import { createSearchCache } from '@neo-search/data-cache';
import Anthropic from '@anthropic-ai/sdk';
/* eslint-enable @nx/enforce-module-boundaries */

/**
 * Read `NEO_SEARCH_DATA_DIR` from the environment, defaulting to `./.data`
 * relative to the current working directory. The three data-layer stores
 * (history, bookmarks, cache) will create their SQLite databases and chunk
 * files under this directory.
 */
const dataDir = process.env.NEO_SEARCH_DATA_DIR ?? './.data';

/**
 * Read `PORT` from the environment, defaulting to 3001. The API listens on
 * `0.0.0.0:<port>` so the Vite dev server running on `localhost:5173` can
 * reach it.
 */
const port = Number.parseInt(process.env.PORT ?? '3001', 10);

/**
 * Read `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` from the environment. Per
 * `.design/technology/tech-stack.md`, the model ID MUST NOT be hardcoded —
 * it is selected per-environment via env var. The default is
 * `claude-sonnet-4-20250514` (the latest Sonnet as of STORY-012's
 * implementation).
 */
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (typeof anthropicApiKey !== 'string' || anthropicApiKey.length === 0) {
  console.error('ANTHROPIC_API_KEY env var is required but missing or empty.');
  process.exit(1);
}

const anthropicModel = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';

/**
 * Main boot sequence. Constructs the registry, registers tools, builds the
 * agent, binds the API, and listens.
 */
const main = async (): Promise<void> => {
  console.warn('[@neo-search/api] Starting composition...');

  // Register the TypeBox format validators (`uri`, `date-time`) the
  // `web-search` tool depends on. Per the tool's exports, this MUST be
  // called once before the tool runs.
  registerWebSearchFormats();

  // Construct the tool registry and register the two tools.
  const registry = createRegistry();
  registry.register(webSearchTool);

  // Build the real data-layer stores. Each store is initialized with
  // `dataDir` and creates its own subdirectory (`<dataDir>/history/`,
  // `<dataDir>/bookmarks/`, `<dataDir>/cache/`).
  const historyStore = createHistoryStore({ dataDir });
  const bookmarkStore = createBookmarkStore({ dataDir });
  const searchCache = createSearchCache({ dataDir });

  // Bind the `data-store` tool handler with the real stores. Per
  // `@neo-search/tools-data-store`'s exports, the default `dataStoreTool`
  // registration has a placeholder handler that returns `terminal`; the
  // composition root MUST rebuild it with `createDataStoreHandler`.
  const dataStoreHandler = createDataStoreHandler({
    historyStore,
    bookmarkStore,
    searchCache,
  });

  // Re-register the `data-store` tool with the real handler. The registry's
  // `register` method is idempotent on the tool name — a second call with
  // the same `name` replaces the handler.
  registry.register({
    ...dataStoreTool,
    handler: dataStoreHandler,
  });

  console.warn('[@neo-search/api] Registry built; tools registered:', ['web-search', 'data-store']);

  // Build the real synthesizer with the Anthropic SDK. Per STORY-012, the
  // factory accepts `{ anthropic, model, prompt }`. The prompt is optional
  // and defaults to `DEFAULT_SYNTHESIS_PROMPT`. Cast to `any` to bridge the
  // structural mismatch between the SDK's readonly arrays and the agent's
  // mutable interface — the agent never mutates the messages array, so this
  // is safe at runtime.
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });
  const synthesize = createSynthesizer({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    anthropic: anthropic as any,
    model: anthropicModel,
  });

  console.warn('[@neo-search/api] Synthesizer built; model:', anthropicModel);

  // Build the agent with the registry and synthesizer. Per STORY-011, the
  // factory signature is `createAgent({ registry, synthesize, clock })`.
  const agent = createAgent({
    registry,
    synthesize,
    clock: wallClock,
  });

  console.warn('[@neo-search/api] Agent built.');

  // Bind the API with the agent, registry, and a clock that includes `now()`.
  const apiClock: ApiClock = {
    now: () => Date.now(),
    wait: (ms) => wallClock.wait(ms, new AbortController().signal),
  };

  const api = createApi({
    agent,
    registry,
    clock: apiClock,
  });

  // Listen on `0.0.0.0:<port>` so the Vite dev server can reach it.
  try {
    await api.listen({ port, host: '0.0.0.0' });
    console.warn(`[@neo-search/api] Listening on http://0.0.0.0:${port}`);
  } catch (err) {
    console.error('[@neo-search/api] Failed to listen:', err);
    process.exit(1);
  }
};

main();

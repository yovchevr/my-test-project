/**
 * `web-search` tool input/output contract (FR-012, FR-021, FR-022).
 *
 * The shape that crosses the registry into the live web search tool. Both
 * `services/agent` and `packages/tools-web-search` import from this module.
 *
 * See `.design/components/web-search-tool.md` for the canonical definition
 * and the failure taxonomy mapped to `ToolErrorContract` from
 * `agent-tools.ts`.
 */
import { Type, type Static } from '@sinclair/typebox';
import { ResultCardContract } from '../data.js';

/**
 * Input to the `web-search` tool. `maxResults` is bounded by the cache /
 * chunking budget (FR-017 pins 100 results per chunk; the upper bound here
 * is the design's "1000+ results per query" target from NFR-003).
 */
export const WebSearchInputContract = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 2000 }),
    maxResults: Type.Integer({ minimum: 1, maximum: 1000 }),
  },
  { $id: 'WebSearchInputContract' },
);
export type WebSearchInputContract = Static<typeof WebSearchInputContract>;

/**
 * Output of the `web-search` tool. `provider` is pinned to the literal
 * `"tavily"` per `.design/technology/tech-stack.md`; switching providers is
 * an ADR moment, not a quiet contract widening.
 */
export const WebSearchOutputContract = Type.Object(
  {
    results: Type.Array(ResultCardContract),
    fetchedAt: Type.String({ format: 'date-time' }),
    provider: Type.Literal('tavily'),
  },
  { $id: 'WebSearchOutputContract' },
);
export type WebSearchOutputContract = Static<typeof WebSearchOutputContract>;

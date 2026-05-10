/**
 * `@neo-search/contracts` — single source of truth for the four FR-021
 * boundary contracts.
 *
 * Per `.design/foundation/naming-conventions.md`, every contract type ends
 * in `Contract` and is defined here exactly once; consumers (UI, API,
 * agent, tools, data layer) MUST import from this module and MUST NOT
 * redeclare any `Contract`-suffixed type. STORY-018 wires the
 * `no-restricted-imports` ESLint rule that enforces this.
 *
 * The four boundary modules:
 *   - `ui-api.ts`      — UI ↔ API     (FR-010)
 *   - `api-agent.ts`   — API ↔ Agent  (FR-021)
 *   - `agent-tools.ts` — Agent ↔ Tools (FR-022)
 *   - `tools/data-store.ts` — Agent ↔ Data, surfaced via the `data-store` tool (ADR 0001)
 *
 * Plus shared record types in `data.ts` and the `web-search` tool's
 * input/output schemas in `tools/web-search.ts`.
 */

// UI ↔ API boundary (FR-010, FR-021).
export {
  SearchRequestContract,
  UiApiAnswerContract,
  BookmarkSaveRequestContract,
  BookmarkSaveResponseContract,
  BookmarkListResponseContract,
  HistoryListResponseContract,
} from './ui-api.js';

// API ↔ Agent boundary (FR-021).
export {
  SourceFilterEnum,
  AgentSearchRequestContract,
  AgentSearchResponseContract,
  AgentErrorContract,
  SearchResponseValueContract,
} from './api-agent.js';

// Agent ↔ Tools boundary (FR-021, FR-022).
export { ToolDescriptorContract, ToolErrorContract, ResultContract } from './agent-tools.js';
export type { Result, ToolHandler } from './agent-tools.js';

// Agent ↔ Data boundary, surfaced via the `data-store` tool (ADR 0001).
export { DataStoreInputContract, DataStoreOutputContract } from './tools/data-store.js';
export type { DataStoreOp } from './tools/data-store.js';

// `web-search` tool input/output (FR-012, FR-022).
export { WebSearchInputContract, WebSearchOutputContract } from './tools/web-search.js';

// Shared record types referenced by multiple boundary contracts.
export {
  ResultCardContract,
  PaginationContract,
  ReferenceEntryContract,
  HistoryEntryContract,
  BookmarkEntryContract,
  BookmarkSaveContract,
} from './data.js';

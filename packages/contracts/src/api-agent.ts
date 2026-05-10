/**
 * API ↔ Agent boundary contract (FR-021).
 *
 * In-process shape between `services/api` and `services/agent`. Both sides
 * import from this module — the API MUST NOT translate to its own type
 * (per `.design/components/search-api.md`, "MUST NOT define its own
 * request/response types").
 */
import { Type, type Static } from '@sinclair/typebox';
import { PaginationContract, ReferenceEntryContract, ResultCardContract } from './data.js';

/**
 * Closed enum of source types per `.design/domain/glossary.md`. Exported so
 * the agent's source-filter routing lookup can key off the same literal
 * values used at the wire boundary (NFR-006: variants are data, not code).
 */
export const SourceFilterEnum = Type.Union(
  [Type.Literal('LIVE'), Type.Literal('HISTORY'), Type.Literal('BOOKMARK')],
  { $id: 'SourceFilterEnum' },
);
export type SourceFilterEnum = Static<typeof SourceFilterEnum>;

/**
 * The API ↔ Agent request shape. `budgetMs` is the per-request agent budget
 * (NFR-005 pins LIVE searches at 10s); the API forwards the value derived
 * from its own request handling so the agent never has to read process env
 * to find its budget.
 */
export const AgentSearchRequestContract = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 2000 }),
    sourceFilter: SourceFilterEnum,
    page: Type.Integer({ minimum: 1 }),
    budgetMs: Type.Integer({ minimum: 1, maximum: 60_000 }),
  },
  { $id: 'AgentSearchRequestContract' },
);
export type AgentSearchRequestContract = Static<typeof AgentSearchRequestContract>;

/**
 * The success-side payload of an agent response — the structured answer plus
 * its supporting results and pagination metadata.
 */
export const SearchResponseValueContract = Type.Object(
  {
    answer_summary: Type.String({ minLength: 1 }),
    references: Type.Array(ReferenceEntryContract),
    results: Type.Array(ResultCardContract),
    pagination: PaginationContract,
  },
  { $id: 'SearchResponseValueContract' },
);
export type SearchResponseValueContract = Static<typeof SearchResponseValueContract>;

/**
 * Structured agent error. `kind` is the discriminant the API maps to HTTP
 * status codes per `.design/components/search-api.md`'s error-surface table.
 */
export const AgentErrorContract = Type.Object(
  {
    kind: Type.Union([
      Type.Literal('validation'),
      Type.Literal('terminal'),
      Type.Literal('transient'),
      Type.Literal('cancelled'),
    ]),
    message: Type.String({ minLength: 1 }),
    details: Type.Optional(Type.Unknown()),
  },
  { $id: 'AgentErrorContract' },
);
export type AgentErrorContract = Static<typeof AgentErrorContract>;

/**
 * Discriminated `Result<SearchResponseValueContract, AgentErrorContract>`.
 * The agent always returns one of the two variants; the API never receives
 * a thrown exception across this boundary (FR-023, I-26).
 */
export const AgentSearchResponseContract = Type.Union(
  [
    Type.Object({ ok: Type.Literal(true), value: SearchResponseValueContract }),
    Type.Object({ ok: Type.Literal(false), error: AgentErrorContract }),
  ],
  { $id: 'AgentSearchResponseContract' },
);
export type AgentSearchResponseContract = Static<typeof AgentSearchResponseContract>;

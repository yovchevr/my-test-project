/**
 * UI ↔ API boundary contract (FR-010, FR-021).
 *
 * The wire shape between the browser and `services/api`. Per
 * `.design/components/search-api.md`, both the API and the UI MUST import
 * from this module rather than hand-writing the response shape.
 */
import { Type, type Static } from '@sinclair/typebox';
import { PaginationContract, ReferenceEntryContract, ResultCardContract } from './data.js';

/**
 * Closed enum of source types per `.design/domain/glossary.md`. Exported
 * separately so the API and the UI can share it; mirrored in `api-agent.ts`
 * via `SourceFilterEnum`.
 */
const SourceFilterUnion = Type.Union(
  [Type.Literal('LIVE'), Type.Literal('HISTORY'), Type.Literal('BOOKMARK')],
  { $id: 'SourceFilterUnion' },
);

/**
 * Search request the UI sends to `/api/search`. `page` is 1-indexed to match
 * the UI's pagination affordance (FR-006).
 */
export const SearchRequestContract = Type.Object(
  {
    query: Type.String({ minLength: 1, maxLength: 2000 }),
    sourceFilter: SourceFilterUnion,
    page: Type.Integer({ minimum: 1 }),
    clientRequestId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { $id: 'SearchRequestContract' },
);
export type SearchRequestContract = Static<typeof SearchRequestContract>;

/**
 * The successful answer payload returned by `/api/search` (FR-010).
 *
 * `answer_summary` is FR-007's required field; `references` is FR-009's.
 * Both are mandatory and non-empty (FR-009's "non-empty title / url /
 * context" rule is enforced inside `ReferenceEntryContract`).
 */
export const UiApiAnswerContract = Type.Object(
  {
    answer_summary: Type.String({ minLength: 1 }),
    references: Type.Array(ReferenceEntryContract),
    results: Type.Array(ResultCardContract),
    pagination: PaginationContract,
  },
  { $id: 'UiApiAnswerContract' },
);
export type UiApiAnswerContract = Static<typeof UiApiAnswerContract>;

/**
 * Save-side request for `POST /api/bookmarks`.
 */
export const BookmarkSaveRequestContract = Type.Object(
  {
    kind: Type.Union([Type.Literal('result'), Type.Literal('answer')]),
    payload: Type.Unknown(),
    clientRequestId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { $id: 'BookmarkSaveRequestContract' },
);
export type BookmarkSaveRequestContract = Static<typeof BookmarkSaveRequestContract>;

/**
 * Response from `POST /api/bookmarks` — just the assigned id.
 */
export const BookmarkSaveResponseContract = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { $id: 'BookmarkSaveResponseContract' },
);
export type BookmarkSaveResponseContract = Static<typeof BookmarkSaveResponseContract>;

/**
 * A single bookmark as the UI sees it. Matches the data layer's
 * `BookmarkEntryContract` shape (the UI ↔ API contract carries it through
 * verbatim). This is an internal helper; per
 * `.design/foundation/naming-conventions.md`, internal types MUST NOT end
 * in `Contract`.
 */
const bookmarkRecord = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: Type.Union([Type.Literal('result'), Type.Literal('answer')]),
    payload: Type.Unknown(),
    ts: Type.String({ format: 'date-time' }),
  },
  { $id: 'BookmarkRecord' },
);

/**
 * Response from `GET /api/bookmarks` — paginated list of bookmark records.
 */
export const BookmarkListResponseContract = Type.Object(
  {
    entries: Type.Array(bookmarkRecord),
    pagination: PaginationContract,
  },
  { $id: 'BookmarkListResponseContract' },
);
export type BookmarkListResponseContract = Static<typeof BookmarkListResponseContract>;

/**
 * A single history record as the UI sees it. Internal helper — see the
 * note above for the naming-convention rule.
 */
const historyRecord = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    query: Type.String({ minLength: 1 }),
    sourceFilter: SourceFilterUnion,
    ts: Type.String({ format: 'date-time' }),
  },
  { $id: 'HistoryRecord' },
);

/**
 * Response from `GET /api/history` — paginated list of history records.
 */
export const HistoryListResponseContract = Type.Object(
  {
    entries: Type.Array(historyRecord),
    pagination: PaginationContract,
  },
  { $id: 'HistoryListResponseContract' },
);
export type HistoryListResponseContract = Static<typeof HistoryListResponseContract>;

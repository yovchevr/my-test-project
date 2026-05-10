/**
 * Shared data-layer record contracts (FR-014, FR-015, FR-016, FR-021).
 *
 * These record shapes are referenced by multiple boundary contracts (UI ↔ API,
 * Agent ↔ Tools, Agent ↔ Data) and so live in their own module. Per
 * `.design/foundation/naming-conventions.md`, every type whose name ends in
 * `Contract` MUST be defined exactly once in `@neo-search/contracts`.
 *
 * See `.design/components/data-layer.md` for the canonical record-shape
 * description and `.design/decisions/0001-layer-boundaries.md` for why these
 * record types live here rather than per-package.
 */
import { Type, type Static } from '@sinclair/typebox';

/**
 * A single entry returned by the web search tool: title, snippet, domain, URL.
 * See `.design/domain/glossary.md` ("Result").
 */
export const ResultCardContract = Type.Object(
  {
    title: Type.String({ minLength: 1 }),
    snippet: Type.String(),
    domain: Type.String({ minLength: 1 }),
    url: Type.String({ format: 'uri', minLength: 1 }),
  },
  { $id: 'ResultCardContract' },
);
export type ResultCardContract = Static<typeof ResultCardContract>;

/**
 * Pagination metadata attached to every list/cache read. `totalChunks` is the
 * total chunk count for the underlying query (FR-017); `hasMore` is the UI's
 * affordance hint (FR-006).
 */
export const PaginationContract = Type.Object(
  {
    page: Type.Integer({ minimum: 1 }),
    totalChunks: Type.Integer({ minimum: 0 }),
    hasMore: Type.Boolean(),
  },
  { $id: 'PaginationContract' },
);
export type PaginationContract = Static<typeof PaginationContract>;

/**
 * A persisted history record (FR-014). Entries MUST survive process restart.
 * `resultChunkIds` references the cache chunks holding this search's results.
 */
export const HistoryEntryContract = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    query: Type.String({ minLength: 1 }),
    sourceFilter: Type.Union([
      Type.Literal('LIVE'),
      Type.Literal('HISTORY'),
      Type.Literal('BOOKMARK'),
    ]),
    ts: Type.String({ format: 'date-time' }),
    resultChunkIds: Type.Array(Type.String()),
  },
  { $id: 'HistoryEntryContract' },
);
export type HistoryEntryContract = Static<typeof HistoryEntryContract>;

/**
 * A persisted bookmark (FR-015). Identified by a stable `id`; the payload is
 * either a single `Result` or an answer summary, discriminated by `kind`.
 */
export const BookmarkEntryContract = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    kind: Type.Union([Type.Literal('result'), Type.Literal('answer')]),
    payload: Type.Unknown(),
    ts: Type.String({ format: 'date-time' }),
  },
  { $id: 'BookmarkEntryContract' },
);
export type BookmarkEntryContract = Static<typeof BookmarkEntryContract>;

/**
 * The save-side shape for a new bookmark (no server-assigned `id` or `ts` yet).
 */
export const BookmarkSaveContract = Type.Object(
  {
    kind: Type.Union([Type.Literal('result'), Type.Literal('answer')]),
    payload: Type.Unknown(),
  },
  { $id: 'BookmarkSaveContract' },
);
export type BookmarkSaveContract = Static<typeof BookmarkSaveContract>;

/**
 * A single reference entry attached to an answer (FR-009). All three string
 * fields MUST be non-empty; `url` MUST be a `uri`-format string.
 */
export const ReferenceEntryContract = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    url: Type.String({ format: 'uri', minLength: 1 }),
    context: Type.String({ minLength: 1 }),
  },
  { $id: 'ReferenceEntryContract' },
);
export type ReferenceEntryContract = Static<typeof ReferenceEntryContract>;

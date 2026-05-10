/**
 * `data-store` tool input/output contract — the Agent ↔ Data boundary
 * (FR-014, FR-015, FR-016, FR-018, FR-021, FR-022).
 *
 * Per ADR 0001 (`.design/decisions/0001-layer-boundaries.md`), the agent
 * reaches the data layer ONLY through this tool. The two unions below
 * encode every legal data-layer operation; new operations are non-breaking
 * additions to the union (per the ADR's consequences section).
 *
 * The `op` discriminant is the only routing key — handlers MUST switch on
 * `op` literals, never on input contents. The output's `op` literal MUST
 * match the input's per call (one-to-one), which the contract test under
 * `__tests__/data-store.spec.ts` asserts structurally.
 */
import { Type, type Static } from '@sinclair/typebox';
import {
  BookmarkEntryContract,
  BookmarkSaveContract,
  HistoryEntryContract,
  PaginationContract,
  ResultCardContract,
} from '../data.js';

/**
 * Discriminated union over the seven data-layer ops the prototype supports
 * (per `.design/components/data-store-tool.md`):
 *  - `history.append`  — FR-014
 *  - `history.list`    — FR-014
 *  - `bookmark.save`   — FR-015
 *  - `bookmark.list`   — FR-015
 *  - `bookmark.get`    — FR-015
 *  - `cache.write`     — FR-016
 *  - `cache.read`      — FR-016, FR-018
 */
export const DataStoreInputContract = Type.Union(
  [
    Type.Object({
      op: Type.Literal('history.append'),
      entry: HistoryEntryContract,
    }),
    Type.Object({
      op: Type.Literal('history.list'),
      page: Type.Integer({ minimum: 1 }),
    }),
    Type.Object({
      op: Type.Literal('bookmark.save'),
      entry: BookmarkSaveContract,
    }),
    Type.Object({
      op: Type.Literal('bookmark.list'),
      page: Type.Integer({ minimum: 1 }),
    }),
    Type.Object({
      op: Type.Literal('bookmark.get'),
      id: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      op: Type.Literal('cache.write'),
      query: Type.String({ minLength: 1 }),
      results: Type.Array(ResultCardContract),
    }),
    Type.Object({
      op: Type.Literal('cache.read'),
      query: Type.String({ minLength: 1 }),
      page: Type.Integer({ minimum: 1 }),
    }),
  ],
  { $id: 'DataStoreInputContract' },
);
export type DataStoreInputContract = Static<typeof DataStoreInputContract>;

/**
 * Discriminated union over the seven output variants. The `op` literal
 * MUST match the corresponding input op for any single tool invocation
 * (the registry validates this before returning the result to the agent).
 *
 * The `chunksRead` field on `cache.read` is what makes the NFR-004
 * "no full scan" assertion measurable — see I-10 in `.design/`.
 */
export const DataStoreOutputContract = Type.Union(
  [
    Type.Object({
      op: Type.Literal('history.append'),
      id: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      op: Type.Literal('history.list'),
      entries: Type.Array(HistoryEntryContract),
      pagination: PaginationContract,
    }),
    Type.Object({
      op: Type.Literal('bookmark.save'),
      id: Type.String({ minLength: 1 }),
    }),
    Type.Object({
      op: Type.Literal('bookmark.list'),
      entries: Type.Array(BookmarkEntryContract),
      pagination: PaginationContract,
    }),
    Type.Object({
      op: Type.Literal('bookmark.get'),
      entry: BookmarkEntryContract,
    }),
    Type.Object({
      op: Type.Literal('cache.write'),
      chunkIds: Type.Array(Type.String({ minLength: 1 })),
    }),
    Type.Object({
      op: Type.Literal('cache.read'),
      results: Type.Array(ResultCardContract),
      chunksRead: Type.Integer({ minimum: 0 }),
      pagination: PaginationContract,
    }),
  ],
  { $id: 'DataStoreOutputContract' },
);
export type DataStoreOutputContract = Static<typeof DataStoreOutputContract>;

/**
 * The seven `op` literal values, exported as a frozen tuple so the contract
 * tests can assert input/output coverage without re-encoding the list.
 */
export const DATA_STORE_OPS = [
  'history.append',
  'history.list',
  'bookmark.save',
  'bookmark.list',
  'bookmark.get',
  'cache.write',
  'cache.read',
] as const;
export type DataStoreOp = (typeof DATA_STORE_OPS)[number];

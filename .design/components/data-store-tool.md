---
title: data-store tool
read_when: implementing or modifying how the agent reads/writes history, bookmarks, or the search cache
boundary: core
requirements: [FR-014, FR-015, FR-016, FR-018, FR-022, FR-023, NFR-006]
---

# `data-store` tool

The registered tool that exposes the data layer (history store, bookmark store, indexed search cache) to the agent through a single uniform interface. Lives in `packages/tools-data-store`. Wraps the data-layer packages described in `components/data-layer.md`.

## Responsibilities

- Provide a single tool the agent invokes for **all** data-layer reads and writes. Per FR-022, this is the second of the two required tools (alongside `web-search`).
- Discriminate operations by an `op` field in the input contract (`history.append`, `history.list`, `bookmark.save`, `bookmark.list`, `bookmark.get`, `cache.write`, `cache.read`). The agent picks the op via the source-filter route handler — never via a query-string branch (NFR-006, I-22).
- Translate data-layer errors into the structured `ToolErrorContract`. Storage I/O failures MUST surface as `terminal`; schema-validation failures MUST surface as `validation`.
- Honor the request `AbortSignal` so a slow disk read can be interrupted by the agent budget.

## What this component MUST NOT do

- It MUST NOT contain business logic. It is a thin facade over the data-layer packages — schema validation, op routing, error translation, and nothing else.
- It MUST NOT be bypassed by the agent (I-18, FR-024). The agent MUST NOT import `packages/data-history`, `packages/data-bookmarks`, or `packages/data-cache` directly.
- It MUST NOT define its own copy of the data-layer record shapes — they live in `@neo-search/contracts/data.ts` (I-34).
- It MUST NOT throw across the tool boundary (I-26).
- It MUST NOT carry per-user partitioning, session isolation, or auth gating (I-14, I-15).

## Public contract

The input is a discriminated union over the supported ops:

```ts
// packages/contracts/src/tools/data-store.ts
export const DataStoreInputContract = Type.Union([
  Type.Object({ op: Type.Literal("history.append"), entry: HistoryEntryContract }),
  Type.Object({ op: Type.Literal("history.list"), page: Type.Integer({ minimum: 1 }) }),
  Type.Object({ op: Type.Literal("bookmark.save"), entry: BookmarkSaveContract }),
  Type.Object({ op: Type.Literal("bookmark.list"), page: Type.Integer({ minimum: 1 }) }),
  Type.Object({ op: Type.Literal("bookmark.get"), id: Type.String() }),
  Type.Object({ op: Type.Literal("cache.write"), query: Type.String(), results: Type.Array(ResultCardContract) }),
  Type.Object({ op: Type.Literal("cache.read"), query: Type.String(), page: Type.Integer({ minimum: 1 }) }),
]);

export const DataStoreOutputContract = Type.Union([
  Type.Object({ op: Type.Literal("history.append"), id: Type.String() }),
  Type.Object({ op: Type.Literal("history.list"), entries: Type.Array(HistoryEntryContract), pagination: PaginationContract }),
  Type.Object({ op: Type.Literal("bookmark.save"), id: Type.String() }),
  Type.Object({ op: Type.Literal("bookmark.list"), entries: Type.Array(BookmarkEntryContract), pagination: PaginationContract }),
  Type.Object({ op: Type.Literal("bookmark.get"), entry: BookmarkEntryContract }),
  Type.Object({ op: Type.Literal("cache.write"), chunkIds: Type.Array(Type.String()) }),
  Type.Object({ op: Type.Literal("cache.read"), results: Type.Array(ResultCardContract), chunksRead: Type.Integer(), pagination: PaginationContract }),
]);
```

The `chunksRead` field on `cache.read` is what makes the NFR-004 test assertion possible (it MUST be strictly less than the total chunks for the query when total > 1; see I-10).

## Inputs / outputs / idempotency / versioning

| Aspect | Posture |
| --- | --- |
| Inputs | Validated against the input union by the tooling layer before the handler runs. |
| Outputs | Validated against the output union after the handler returns; the `op` discriminant MUST match the input's. |
| Idempotency | `history.append` and `bookmark.save` are idempotent within a 5s window via the API's `clientRequestId` (deduplication happens in the API; the tool itself just appends). `cache.write` is idempotent — a repeated write for the same `query` overwrites the chunks for that query atomically. All read ops are inherently idempotent. |
| Versioning | The op union versions with `@neo-search/contracts`. Adding a new op is non-breaking; removing or restricting one requires a superseding ADR. |
| Cancellation | Every handler MUST forward the `AbortSignal` to the underlying data-layer call. |

## Variation accommodated

- **New op kinds** — adding a new op is a new variant on the union plus a handler clause. The agent's route handlers gain a new entry in their lookup; the agent loop MUST NOT change.
- **Storage substrate** — the data layer's storage substrate (SQLite + segmented JSON today) MAY be replaced; the tool's contract is what stays. See `components/data-layer.md`.

## Variation NOT accommodated

- **Per-user storage** — single-user prototype (OQ-005, I-14).
- **Auth-gated reads/writes** — no auth regime (OQ-004, I-15).
- **Retention policies** — no retention (OQ-004, I-13).

## Layering

`data-store` is registered with the tooling layer. Its only legal upstream is the registry (which the agent calls). It MAY import the data-layer packages (`packages/data-history`, `packages/data-bookmarks`, `packages/data-cache`) — it is the **only** component permitted to do so other than the data-layer packages themselves (FR-024, I-18).

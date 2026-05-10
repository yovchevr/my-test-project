-- packages/data-bookmarks/migrations/001-initial.sql
--
-- Initial schema for the bookmark store (FR-015, STORY-007).
--
-- Per .design/components/data-layer.md the table is `bookmarks(id PK, kind, payload JSON, ts)`.
-- Lookup by id resolves directly via the primary key — the index IS the PK.
--
-- Single-user prototype semantics (I-14, I-15, OQ-002, OQ-005): there is NO `user_id`,
-- `tenant_id`, or session column. The schema-introspection test in `bookmark-store.test.ts`
-- enforces this NFR-006 / NFR posture.

CREATE TABLE IF NOT EXISTS bookmarks (
  id      TEXT PRIMARY KEY NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('result', 'answer')),
  payload TEXT NOT NULL,
  ts      TEXT NOT NULL
);

-- `ts DESC` ordering powers BookmarkStore.list (pageSize = 25). The PK already covers
-- get-by-id; no other indices are needed at the prototype scale.
CREATE INDEX IF NOT EXISTS bookmarks_ts_idx ON bookmarks (ts DESC);

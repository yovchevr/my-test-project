-- STORY-006 / FR-014 — initial history table.
--
-- Per `.design/components/data-layer.md`, the history store is backed by a
-- single SQLite table. The columns mirror the table description in that doc
-- exactly: `id`, `query`, `source_filter`, `ts`, `result_chunk_ids` (JSON).
--
-- The schema MUST NOT carry a `user_id`, `tenant_id`, or session column
-- (I-14, NFR-006, OQ-005). STORY-018 enforces this with a repo-level grep;
-- STORY-006 enforces it via the schema-introspection test in this package.
--
-- `ts` is stored as an ISO-8601 string so the in-process clock is reflected
-- without timezone ambiguity (per `.design/foundation/conventions.md` —
-- determinism requires injected time, never `Date.now()` in business logic).
-- The `ts DESC` index supports the `list` ordering acceptance criterion.
CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY NOT NULL,
  query TEXT NOT NULL,
  source_filter TEXT NOT NULL CHECK (source_filter IN ('LIVE', 'HISTORY', 'BOOKMARK')),
  ts TEXT NOT NULL,
  result_chunk_ids TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_ts ON history (ts DESC);

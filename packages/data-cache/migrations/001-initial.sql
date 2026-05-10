-- packages/data-cache/migrations/001-initial.sql
--
-- Initial schema for the indexed search cache (FR-016, FR-018, FR-020, NFR-004,
-- STORY-005). The two tables and the lookup SQL are pinned by
-- `.design/components/data-layer.md` and ADR 0003
-- (`.design/decisions/0003-chunking-strategy.md`).
--
-- Why two tables instead of one:
--   `cache_chunks`  carries one row per on-disk chunk body (chunk_id PK).
--   `cache_index`   carries one row per (query, page) and points at a chunk_id.
-- A single page-N read therefore costs exactly one PK-served lookup against
-- `cache_index`, which is the FR-020 / NFR-004 "no full scan" assertion. The
-- cardinality at the NFR-003 floor (1000 results, pageSize = 25) is 40 rows in
-- `cache_index` and 10 rows in `cache_chunks` — trivially indexed.
--
-- Single-user prototype semantics (I-14, I-15, OQ-002, OQ-005): there is NO
-- `user_id`, `tenant_id`, or session column. STORY-018 enforces this with a
-- repo-level grep; STORY-005's schema-introspection test enforces it here.

CREATE TABLE IF NOT EXISTS cache_chunks (
  chunk_id      TEXT PRIMARY KEY NOT NULL,
  query         TEXT NOT NULL,
  sequence      INTEGER NOT NULL,
  byte_size     INTEGER NOT NULL,
  path          TEXT NOT NULL,
  -- 0-based ordinal of this chunk's first result within the full result list.
  -- Cached on the row so a `read(query, page)` can compute the chunk-local
  -- offset (`(page - 1) * pageSize - first_ordinal`) without a second SQL hop.
  -- Equivalent to SUM(byte_size of prior chunks for this query), but stored
  -- directly so the read path is one SELECT.
  first_ordinal INTEGER NOT NULL
);

-- `(query, page) -> chunk_id` is the FR-020 lookup. Composite PK gives an O(log n)
-- index lookup served by SQLite's primary-key b-tree — see ADR 0003.
CREATE TABLE IF NOT EXISTS cache_index (
  query    TEXT NOT NULL,
  page     INTEGER NOT NULL,
  chunk_id TEXT NOT NULL,
  PRIMARY KEY (query, page),
  FOREIGN KEY (chunk_id) REFERENCES cache_chunks (chunk_id)
);

-- Secondary index lets `write` find and clear all rows for a given query in a
-- single transaction (the "atomic replace" acceptance criterion). The primary
-- key already covers (query, page) lookups, but `WHERE query = ?` deletes need
-- a query-only seek; this keeps that path fast on many-page queries.
CREATE INDEX IF NOT EXISTS cache_chunks_query_idx ON cache_chunks (query);

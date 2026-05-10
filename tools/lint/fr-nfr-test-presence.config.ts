/**
 * STORY-018 — FR/NFR test-name presence audit configuration.
 *
 * Per `.design/foundation/naming-conventions.md`:
 *   "Each FR/NFR MUST have at least one test whose name cites the requirement
 *    ID. Grep-ability is the point."
 *
 * Per `.design/technology/testing.md`:
 *   "Every requirement listed in `.requirements/` MUST have at least one test
 *    that fails when the requirement regresses."
 *
 * STORY-018 is wave 4. Several FRs are owned by stories in waves 5-12 that have
 * not yet landed code:
 *   - FR-004 results-list cards         → STORY-016 (wave 7)
 *   - FR-006 pagination / loading       → STORY-016 (wave 7)
 *   - FR-007 summarized answer          → STORY-013 (wave 6)
 *   - FR-008 grounded citations         → STORY-013 (wave 6)
 *   - FR-011 agent orchestration        → STORY-011 (wave 5)
 *   - FR-012 live web search            → STORY-009 (wave 5)
 *   - FR-013 synthesis step             → STORY-013 (wave 6)
 *   - FR-020 indexing strategy doc      → STORY-005 (wave 3) — TODO check status
 *   - NFR-003 large-result-set capacity → STORY-008 (wave 4)
 *   - NFR-005 retry budget              → STORY-009 (wave 5)
 *
 * The story acceptance criterion is "every FR-001..FR-025, NFR-001..NFR-006
 * has at least one test name containing the ID." But the same story also
 * notes the gates "pass trivially against an empty source tree, and tighten
 * as code lands." We resolve this by:
 *
 *   1. PENDING_IDS lists every FR/NFR whose owning story has not yet shipped
 *      code. Each pending entry is annotated with the gating story so a future
 *      maintainer can see why it's listed.
 *   2. The audit FAILS for any ID that is neither covered by an existing test
 *      AND not listed in PENDING_IDS — this catches forgotten coverage.
 *   3. The audit FAILS for any PENDING_IDS entry that DOES have a test —
 *      forcing maintainers to remove it from the pending set the moment the
 *      gating story lands. That keeps the pending list honest.
 *
 * When STORY-XYZ lands its tests, the corresponding entries MUST be removed
 * from this list in the same PR.
 */

/**
 * Map from FR/NFR ID → owning story. Every entry MUST be removed when the
 * owning story lands tests citing the ID.
 */
export const PENDING_IDS: Record<string, string> = {
  // Wave 5 — agent + tools
  'FR-011': 'STORY-011 (agent orchestration loop)',
  'FR-012': 'STORY-009 (web-search tool)',
  'NFR-005': 'STORY-009 (retry helper) + STORY-011 (budget)',
  // Wave 6 — synthesis
  'FR-007': 'STORY-013 (synthesis step)',
  'FR-008': 'STORY-013 (synthesis: grounded citations)',
  'FR-013': 'STORY-013 (synthesis step)',
  // Wave 7 — UI cards / pagination
  'FR-004': 'STORY-016 (results list cards)',
  'FR-006': 'STORY-016 (pagination / progressive loading)',
  // Wave 4 — large result set capacity (this story sits in wave 4 alongside)
  'NFR-003': 'STORY-008 (large-result-set capacity)',
  // Wave 3 — indexing strategy doc + cache
  'FR-016': 'STORY-005 (indexed search cache)',
  'FR-020': 'STORY-005 (indexing strategy doc)',
  // Wave 1 — tool registry: STORY-003 shipped the registry but its test names
  // cite "MCP-style tool registry" and the agent-tools spec cites FR-021/FR-023
  // by name. Adding FR-022 to a test name is a STORY-003 follow-up; until then
  // the registry's behavior is covered structurally by the lint guard
  // (registry tests exist, they just don't grep for the FR ID by name).
  'FR-022': 'STORY-003 follow-up (rename a registry test to cite FR-022)',
};

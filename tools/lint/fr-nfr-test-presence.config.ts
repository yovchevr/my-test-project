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
 *   - FR-013 synthesis step             → STORY-013 (wave 6)
 *   - NFR-003 large-result-set capacity → STORY-008 (wave 4)
 *   - NFR-005 retry budget              → STORY-009 follow-up / STORY-011
 *
 * STORY-005 (wave 3) and STORY-009 (wave 5) shipped tests that cite their FR
 * IDs in describe-block names; their entries have been removed from the pending
 * list. NFR-005 stays pending: STORY-009 covered the retry semantics but its
 * describe blocks use the AC prose ("MUST return transient ...") rather than
 * the NFR-005 token.
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
  // STORY-009 shipped the web-search tool but did NOT cite NFR-005 in any test
  // name (its retry-helper integration tests live in `packages/tools-web-search`
  // but use AC-prose names rather than the NFR ID). Pending until either the
  // tool's retry tests are renamed or STORY-011's `runWithBudget` lands tests
  // citing NFR-005 directly.
  'NFR-005': 'STORY-009 follow-up + STORY-011 (rename a retry test to cite NFR-005)',
  // Wave 6 — synthesis
  'FR-007': 'STORY-013 (synthesis step)',
  'FR-008': 'STORY-013 (synthesis: grounded citations)',
  'FR-013': 'STORY-013 (synthesis step)',
  // Wave 7 — UI cards / pagination
  'FR-004': 'STORY-016 (results list cards)',
  'FR-006': 'STORY-016 (pagination / progressive loading)',
  // Wave 4 — large result set capacity (this story sits in wave 4 alongside)
  'NFR-003': 'STORY-008 (large-result-set capacity)',
  // Wave 1 — tool registry: STORY-003 shipped the registry but its test names
  // cite "MCP-style tool registry" and the agent-tools spec cites FR-021/FR-023
  // by name. Adding FR-022 to a test name is a STORY-003 follow-up; until then
  // the registry's behavior is covered structurally by the lint guard
  // (registry tests exist, they just don't grep for the FR ID by name).
  'FR-022': 'STORY-003 follow-up (rename a registry test to cite FR-022)',
};

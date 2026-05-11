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
  // STORY-011 (wave 5/6) shipped tests citing FR-011, FR-013, FR-022, NFR-005:
  //   - run-with-budget.test.ts cites NFR-005 (the five sub-cases) and FR-023.
  //   - agent-loop.test.ts cites FR-013 (synthesis uniformity).
  //   - tests/integration/agent-loop.spec.ts cites FR-011, FR-022, FR-023.
  // Their entries have been removed from the pending list.
  // STORY-012 (wave 7) shipped synthesis tests citing FR-007, FR-008, FR-009,
  // and FR-013 in:
  //   - services/agent/src/synthesis/synthesis.test.ts
  //   - services/agent/src/synthesis/validator.test.ts
  //   - services/agent/src/references.test.ts
  // Their entries have been removed from the pending list.
  // STORY-016 (wave 9) shipped tests citing FR-004 and FR-006 in:
  //   - apps/ui/src/components/ResultCard.test.tsx (FR-004)
  //   - apps/ui/src/components/ResultsList.test.tsx (FR-004)
  //   - apps/ui/src/components/LoadMoreButton.test.tsx (FR-006)
  //   - apps/ui/src/hooks/useSearch.test.tsx (FR-006)
  // Their entries have been removed from the pending list.
  // STORY-008 (wave 5) shipped `packages/data-cache/src/large-set.spec.ts` whose
  // describe-block + test names cite NFR-003 — entry removed.
};

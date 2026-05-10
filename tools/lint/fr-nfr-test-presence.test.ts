/**
 * STORY-018 — every FR / NFR ID listed in `.requirements/` has at least one
 * test whose name cites it.
 *
 * Per `.design/foundation/naming-conventions.md`:
 *   "Each FR/NFR MUST have at least one test whose name cites the requirement
 *    ID. Grep-ability is the point."
 *
 * Per `.design/technology/testing.md`:
 *   "Every requirement listed in `.requirements/` MUST have at least one test
 *    that fails when the requirement regresses."
 *
 * The acceptance criterion in STORY-018 says the gate must exit 0 against the
 * current codebase. Several FRs are owned by stories that haven't shipped code
 * yet — those are listed in `fr-nfr-test-presence.config.ts` PENDING_IDS, and
 * the audit forces a maintainer to remove the pending entry the moment a real
 * test for that ID lands.
 *
 * The scan walks every `*.test.ts(x)` and `*.spec.ts(x)` under apps/, services/,
 * packages/, tests/, and tools/. It looks for test names — `it("...")` and
 * `test("...")` — that contain the ID token (e.g. `FR-005`, `NFR-006`).
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PENDING_IDS } from './fr-nfr-test-presence.config.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const REQUIREMENT_ID_PATTERN = /\b(FR-\d{3}|NFR-\d{3})\b/g;

function listRequirementIds(): string[] {
  const dirs = ['.requirements/functional', '.requirements/non-functional'];
  const ids = new Set<string>();
  for (const dir of dirs) {
    const abs = join(repoRoot, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      const match = entry.match(/^(FR-\d{3}|NFR-\d{3})/);
      if (match?.[1]) ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

function collectTestFiles(): string[] {
  const roots = ['apps', 'services', 'packages', 'tests', 'tools'];
  const files: string[] = [];
  const stack: string[] = [];
  for (const r of roots) {
    const abs = join(repoRoot, r);
    if (existsSync(abs)) stack.push(abs);
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of readdirSync(cur)) {
      const abs = join(cur, entry);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') {
          continue;
        }
        stack.push(abs);
        continue;
      }
      if (
        entry.endsWith('.test.ts') ||
        entry.endsWith('.test.tsx') ||
        entry.endsWith('.spec.ts') ||
        entry.endsWith('.spec.tsx')
      ) {
        files.push(abs);
      }
    }
  }
  return files;
}

/**
 * Pull `it("...")` / `test("...")` / `describe("...")` names out of a test
 * file's source. The point isn't perfect parsing — it's grepping for names
 * that contain an FR/NFR ID. We use a tolerant regex that captures the first
 * argument (the description string) of these calls.
 */
function extractTestNames(source: string): string[] {
  const names: string[] = [];
  // Match: it('...', or it("...", or it(`...`, — same for test and describe.
  const re = /\b(?:it|test|describe)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[2];
    if (name) names.push(name);
  }
  return names;
}

function buildIdToFilesIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const file of collectTestFiles()) {
    const src = readFileSync(file, 'utf8');
    const names = extractTestNames(src);
    const idsInFile = new Set<string>();
    for (const name of names) {
      const matches = name.matchAll(REQUIREMENT_ID_PATTERN);
      for (const match of matches) {
        const id = match[1];
        if (id) idsInFile.add(id);
      }
    }
    for (const id of idsInFile) {
      const arr = index.get(id) ?? [];
      arr.push(file);
      index.set(id, arr);
    }
  }
  return index;
}

describe('STORY-018 — every FR / NFR has at least one test name citing its ID', () => {
  const requirementIds = listRequirementIds();
  const idIndex = buildIdToFilesIndex();

  it('the requirements directory enumerates at least 25 FRs and 6 NFRs', () => {
    const frs = requirementIds.filter((id) => id.startsWith('FR-'));
    const nfrs = requirementIds.filter((id) => id.startsWith('NFR-'));
    expect(frs.length).toBeGreaterThanOrEqual(25);
    expect(nfrs.length).toBeGreaterThanOrEqual(6);
  });

  it('every FR / NFR has at least one test name citing it, OR is listed in PENDING_IDS', () => {
    const missing: string[] = [];
    const wronglyPending: string[] = [];

    for (const id of requirementIds) {
      const hits = idIndex.get(id) ?? [];
      const isPending = id in PENDING_IDS;

      if (hits.length === 0 && !isPending) {
        missing.push(id);
      }
      if (hits.length > 0 && isPending) {
        wronglyPending.push(
          `${id} is listed as pending but has tests in:\n    ${hits.join('\n    ')}\n  → remove the entry from tools/lint/fr-nfr-test-presence.config.ts`,
        );
      }
    }

    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(
        `the following FR/NFR IDs have no test name citing them and are not in PENDING_IDS:\n  ${missing.join(', ')}\n  → either add a test name or list the ID in tools/lint/fr-nfr-test-presence.config.ts with its gating story`,
      );
    }
    if (wronglyPending.length > 0) {
      errors.push(
        `the following IDs are pending but DO have tests:\n  ${wronglyPending.join('\n  ')}`,
      );
    }
    expect(errors, errors.join('\n\n')).toEqual([]);
  });

  it('PENDING_IDS only contains real FR/NFR IDs (no stale entries)', () => {
    const known = new Set(requirementIds);
    const stale = Object.keys(PENDING_IDS).filter((id) => !known.has(id));
    expect(stale, `unknown IDs in PENDING_IDS: ${stale.join(', ')}`).toEqual([]);
  });
});

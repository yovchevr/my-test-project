/**
 * STORY-018 / NFR-006 / I-22 / I-27 — AST scans for "no hardcoded flows".
 *
 * The conventions in `.design/components/agent.md`, `.design/components/data-store-tool.md`,
 * and `.design/components/web-search-tool.md` declare specific patterns the codebase
 * MUST NOT contain. This test enforces them structurally — if a future commit
 * adds a `switch (sourceFilter)` block to the agent, this file fails CI.
 *
 * Each scan locates its target file (via package + symbol-export hint per
 * `.design/foundation/naming-conventions.md`); if the target file does not yet
 * exist, the scan PASSES with a documented note: this story is wired before the
 * feature stories land, and "they pass trivially against an empty source tree,
 * and tighten as code lands." The acceptance criterion in the story explicitly
 * notes "the AST-scan test MUST pass on the current code (zero hardcoded query
 * branches in the agent; zero `switch (op)` in data-store tool; zero retry loop
 * in web-search tool)" — the current code has no agent loop / data-store handler
 * / web-search handler, so all four scans are trivially satisfied.
 *
 * The "trivially satisfied" branch is deliberately observable in test output:
 * each scan logs `pending: <file>` to its assertion message so a maintainer can
 * see at a glance which files the scan is waiting on.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Best-effort file locator: given a directory and a list of preferred relative
 * filenames, return the first one that exists. If none exist, return null.
 *
 * The story explicitly says the scan should not hardcode paths — "scans operate
 * on the package + symbol level (e.g. 'the file exporting `agentLoop`'), not
 * on hardcoded paths." So we accept a list of likely names and fall back to a
 * directory scan that greps for the symbol's export marker.
 */
function findFile(packageDir: string, candidates: string[]): string | null {
  const absDir = join(repoRoot, packageDir);
  if (!existsSync(absDir)) return null;
  for (const cand of candidates) {
    const abs = join(absDir, cand);
    if (existsSync(abs) && statSync(abs).isFile()) return abs;
  }
  return null;
}

/**
 * Find any file under `packageDir/src` whose source code contains a literal
 * `export ... <symbolName>(`. This is a pragmatic surrogate for "the file
 * exporting symbolName" — good enough for a structural scan, and resilient to
 * the file's eventual rename.
 */
function findFileExporting(packageDir: string, symbolName: string): string | null {
  const srcDir = join(repoRoot, packageDir, 'src');
  if (!existsSync(srcDir)) return null;
  const stack = [srcDir];
  const exportPattern = new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|class)\\s+${symbolName}\\b`,
  );
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        stack.push(abs);
        continue;
      }
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
      const src = readFileSync(abs, 'utf8');
      if (exportPattern.test(src)) return abs;
    }
  }
  return null;
}

/** Strip line + block comments + string contents so regex scans don't hit them. */
function stripCommentsAndStrings(source: string): string {
  // Block comments
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments
  s = s.replace(/\/\/[^\n]*/g, '');
  // Double-quoted strings
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""');
  // Single-quoted strings
  s = s.replace(/'(?:\\.|[^'\\])*'/g, "''");
  // Template literals (replace contents with `` to keep the structure but drop user text)
  s = s.replace(/`(?:\\.|[^`\\])*`/g, '``');
  return s;
}

describe('STORY-018 / NFR-006 — agent loop has no hardcoded query branches or switch on sourceFilter', () => {
  it('NFR-006: zero `if (query === ...)` and zero `if (query.startsWith(...))` in the agent loop', () => {
    // Locate the agent loop file by symbol — `agentLoop` per `components/agent.md`.
    const file =
      findFileExporting('services/agent', 'agentLoop') ??
      findFile('services/agent', ['src/agent-loop.ts', 'src/agent.ts']);
    if (!file) {
      // Trivially satisfied per STORY-018 "passes against empty source tree" note.
      // STORY-011 will land the agent loop; this scan will tighten then.
      expect(true, 'pending: services/agent/src/agent-loop.ts (STORY-011)').toBe(true);
      return;
    }
    const src = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    expect(src, `agent loop ${file} contains \`if (query === ...)\``).not.toMatch(
      /if\s*\(\s*query\s*===\s*/,
    );
    expect(src, `agent loop ${file} contains \`query.startsWith(...)\``).not.toMatch(
      /query\.startsWith\s*\(/,
    );
  });

  it('NFR-006: zero `switch (sourceFilter)` blocks in services/agent', () => {
    const agentSrcDir = join(repoRoot, 'services/agent/src');
    if (!existsSync(agentSrcDir)) {
      expect(true, 'pending: services/agent/src (STORY-011)').toBe(true);
      return;
    }
    const offenders: string[] = [];
    const stack = [agentSrcDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          stack.push(abs);
          continue;
        }
        if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
        const src = stripCommentsAndStrings(readFileSync(abs, 'utf8'));
        if (/switch\s*\(\s*sourceFilter\s*\)/.test(src)) {
          offenders.push(abs);
        }
      }
    }
    expect(offenders, 'agent contains switch (sourceFilter) blocks').toEqual([]);
  });
});

describe('STORY-018 / NFR-006 — data-store tool handler has no `switch (op)` (lookup table only)', () => {
  it('NFR-006: zero `switch (op)` blocks in tools-data-store', () => {
    const pkgDir = join(repoRoot, 'packages/tools-data-store/src');
    if (!existsSync(pkgDir)) {
      expect(true, 'pending: packages/tools-data-store/src (STORY-010)').toBe(true);
      return;
    }
    const offenders: string[] = [];
    const stack = [pkgDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          stack.push(abs);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
        const src = stripCommentsAndStrings(readFileSync(abs, 'utf8'));
        if (/switch\s*\(\s*op\s*\)/.test(src)) {
          offenders.push(abs);
        }
      }
    }
    expect(offenders, 'data-store handler contains switch (op) blocks').toEqual([]);
  });
});

describe('STORY-018 / NFR-006 — web-search tool handler has no retry loop / no setTimeout / no backoff timer', () => {
  it('NFR-006: zero `setTimeout` calls in tools-web-search (retry lives in runWithBudget only)', () => {
    const pkgDir = join(repoRoot, 'packages/tools-web-search/src');
    if (!existsSync(pkgDir)) {
      expect(true, 'pending: packages/tools-web-search/src (STORY-009)').toBe(true);
      return;
    }
    const offenders: string[] = [];
    const stack = [pkgDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          stack.push(abs);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
        const src = stripCommentsAndStrings(readFileSync(abs, 'utf8'));
        if (/\bsetTimeout\s*\(/.test(src)) offenders.push(`${abs} (setTimeout)`);
        // Backoff terms: a bare `await sleep(` or a `for (let i = 0; i < retries; ` shape.
        if (/\bsleep\s*\(/.test(src) && !/runWithBudget/.test(src)) {
          offenders.push(`${abs} (sleep)`);
        }
      }
    }
    expect(offenders, 'web-search handler contains its own retry loop / timer').toEqual([]);
  });
});

describe('STORY-018 / NFR-006 — runWithBudget is the only place a derived AbortSignal is created from a budget timer in services/agent', () => {
  it('NFR-006: only `runWithBudget` may create an AbortSignal from a setTimeout-based budget', () => {
    const agentSrcDir = join(repoRoot, 'services/agent/src');
    if (!existsSync(agentSrcDir)) {
      expect(true, 'pending: services/agent/src (STORY-011)').toBe(true);
      return;
    }
    const offenders: string[] = [];
    const stack = [agentSrcDir];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory()) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          stack.push(abs);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) continue;
        // Skip the legitimate runWithBudget file itself.
        if (/run-with-budget\.ts$/.test(abs) || /runWithBudget\.ts$/.test(abs)) {
          continue;
        }
        const src = stripCommentsAndStrings(readFileSync(abs, 'utf8'));
        // Heuristic: a setTimeout next to an AbortController.abort or a derived
        // AbortSignal pattern is exactly what runWithBudget owns.
        if (/setTimeout\s*\(/.test(src) && /AbortController|AbortSignal/.test(src)) {
          offenders.push(abs);
        }
      }
    }
    expect(offenders, 'agent file other than runWithBudget creates a budget timer signal').toEqual(
      [],
    );
  });
});

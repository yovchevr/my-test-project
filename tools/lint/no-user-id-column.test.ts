/**
 * STORY-018 / NFR-006 / OQ-005 — repo-grep gate: no user-id / tenant-id /
 * session column in any data-* package's schema.
 *
 * The architecture posture is "single user, no auth" (OQ-005 resolved by
 * `.design/foundation/architecture.md`). NFR-006 explicitly forbids carrying
 * user-id columns, per-user namespaces, or session-keyed isolation in the
 * data layer:
 *
 * > Data-layer code MUST NOT carry user-id columns, per-user namespaces, or
 * > session-keyed isolation (NFR-006 acceptance criterion).
 *
 * This scan walks every `packages/data-*` migration and source file, strips
 * comments/strings, and asserts no `user_id`, `tenant_id`, or `session_id`
 * column declaration appears. (We allow the words to appear inside comments
 * — the conventions doc allows comments to discuss "we don't have user_id" —
 * but the actual SQL DDL or TypeScript field declaration MUST be absent.)
 *
 * The test names cite NFR-006 so the FR/NFR-test-presence audit picks them up.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const FORBIDDEN_COLUMNS = ['user_id', 'tenant_id', 'session_id', 'session_key'];

interface Offender {
  file: string;
  line: number;
  text: string;
  column: string;
}

/** Strip SQL line comments (`-- ...`) and block comments (`/* ... *\/`). */
function stripSqlComments(source: string): string {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/--[^\n]*/g, '');
  return s;
}

/** Strip TS comments + string contents so we don't flag mentions in docs/strings. */
function stripTsCommentsAndStrings(source: string): string {
  let s = source.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/\/\/[^\n]*/g, '');
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, "''");
  s = s.replace(/`(?:\\.|[^`\\])*`/g, '``');
  return s;
}

function scanFile(file: string): Offender[] {
  const raw = readFileSync(file, 'utf8');
  const stripped = file.endsWith('.sql') ? stripSqlComments(raw) : stripTsCommentsAndStrings(raw);
  const lines = stripped.split('\n');
  const offenders: Offender[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    for (const col of FORBIDDEN_COLUMNS) {
      // Word-boundary match. The column name must appear as an identifier,
      // not as a substring of another word.
      const re = new RegExp(`\\b${col}\\b`);
      if (re.test(line)) {
        offenders.push({ file, line: i + 1, text: line.trim(), column: col });
      }
    }
  }
  return offenders;
}

function scanDirectory(dir: string): Offender[] {
  if (!existsSync(dir)) return [];
  const offenders: Offender[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of readdirSync(cur)) {
      const abs = join(cur, entry);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        stack.push(abs);
        continue;
      }
      // Only check schema-bearing files: SQL migrations and TS source.
      if (!abs.endsWith('.sql') && !abs.endsWith('.ts') && !abs.endsWith('.tsx')) {
        continue;
      }
      // Test files may legitimately discuss user_id absence — exempt them.
      if (abs.endsWith('.test.ts') || abs.endsWith('.spec.ts')) continue;
      offenders.push(...scanFile(abs));
    }
  }
  return offenders;
}

describe('STORY-018 / NFR-006 / OQ-005 — data-* packages MUST NOT carry user-id / tenant-id / session columns', () => {
  it('NFR-006: no user_id column declaration in any data-* package schema or source', () => {
    const dataPackages = ['data-history', 'data-bookmarks', 'data-cache'];
    const offenders: Offender[] = [];
    for (const pkg of dataPackages) {
      offenders.push(...scanDirectory(join(repoRoot, 'packages', pkg)));
    }
    const filtered = offenders.filter((o) => o.column === 'user_id');
    expect(
      filtered,
      `user_id appears in:\n${filtered.map((o) => `  ${o.file}:${o.line}: ${o.text}`).join('\n')}`,
    ).toEqual([]);
  });

  it('NFR-006: no tenant_id column declaration in any data-* package schema or source', () => {
    const dataPackages = ['data-history', 'data-bookmarks', 'data-cache'];
    const offenders: Offender[] = [];
    for (const pkg of dataPackages) {
      offenders.push(...scanDirectory(join(repoRoot, 'packages', pkg)));
    }
    const filtered = offenders.filter((o) => o.column === 'tenant_id');
    expect(
      filtered,
      `tenant_id appears in:\n${filtered.map((o) => `  ${o.file}:${o.line}: ${o.text}`).join('\n')}`,
    ).toEqual([]);
  });

  it('NFR-006: no session_id / session_key column declaration in any data-* package', () => {
    const dataPackages = ['data-history', 'data-bookmarks', 'data-cache'];
    const offenders: Offender[] = [];
    for (const pkg of dataPackages) {
      offenders.push(...scanDirectory(join(repoRoot, 'packages', pkg)));
    }
    const filtered = offenders.filter(
      (o) => o.column === 'session_id' || o.column === 'session_key',
    );
    expect(
      filtered,
      `session column appears in:\n${filtered.map((o) => `  ${o.file}:${o.line}: ${o.text}`).join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * STORY-018 — dependency-version audit.
 *
 * Per `.design/technology/tech-stack.md`:
 *   "Every dependency MUST be pinned to an exact version. The `pnpm-lock.yaml`
 *    MUST be committed."
 *   "`latest`, caret, and tilde ranges MUST NOT be used."
 *
 * This audit walks every `package.json` under apps/, services/, packages/, and
 * the repo root, then asserts that no dependency / devDependency / peerDependency
 * uses a `^` or `~` range, an `*` glob, or `latest`. Workspace ranges
 * (`workspace:*`, `workspace:^`) are exempt — pnpm resolves them to the in-repo
 * package and they're the documented seam for monorepo siblings.
 *
 * The peerDependency for `tailwindcss` in `@neo-search/ui-tokens` uses an exact
 * version string per the existing config, so it lints clean.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface VersionOffender {
  packageJson: string;
  field: string;
  dep: string;
  range: string;
  reason: string;
}

function isExactPin(range: string): { ok: true } | { ok: false; reason: string } {
  // Workspace siblings — always allowed.
  if (range.startsWith('workspace:')) return { ok: true };
  // npm: aliases, file:, link: — out of scope for this prototype.
  if (range.startsWith('file:') || range.startsWith('link:')) return { ok: true };
  // 'latest' / '*' / caret / tilde — explicitly forbidden by tech-stack.md.
  if (range === 'latest') return { ok: false, reason: 'uses `latest`' };
  if (range === '*') return { ok: false, reason: 'uses `*`' };
  if (range.startsWith('^')) return { ok: false, reason: 'uses caret (^)' };
  if (range.startsWith('~')) return { ok: false, reason: 'uses tilde (~)' };
  if (range.startsWith('>') || range.startsWith('<')) {
    return { ok: false, reason: 'uses comparator range (> / <)' };
  }
  // x.y.x partial ranges
  if (/^\d+\.\d+\.x$/.test(range) || /^\d+\.x$/.test(range)) {
    return { ok: false, reason: 'uses partial-range (x)' };
  }
  // Acceptable: a plain semver, an http(s):// tarball, or a git URL.
  return { ok: true };
}

function collectPackageJsons(): string[] {
  const roots = ['apps', 'services', 'packages'];
  const files: string[] = [join(repoRoot, 'package.json')];
  for (const r of roots) {
    const root = join(repoRoot, r);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const dir = join(root, entry);
      const st = statSync(dir);
      if (!st.isDirectory()) continue;
      const pkgFile = join(dir, 'package.json');
      if (existsSync(pkgFile)) files.push(pkgFile);
    }
  }
  return files;
}

function auditPackageJson(file: string): VersionOffender[] {
  const raw = readFileSync(file, 'utf8');
  const parsed: PackageJson = JSON.parse(raw);
  const offenders: VersionOffender[] = [];
  const fields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;
  for (const field of fields) {
    const block = parsed[field];
    if (!block) continue;
    for (const [dep, range] of Object.entries(block)) {
      const r = isExactPin(range);
      if (!r.ok) {
        offenders.push({
          packageJson: file,
          field,
          dep,
          range,
          reason: r.reason,
        });
      }
    }
  }
  return offenders;
}

describe('STORY-018 / tech-stack.md — every dependency in every package.json is exact-pinned', () => {
  it('no `^`, `~`, `*`, `latest`, or partial-range version is used in any package.json', () => {
    const offenders: VersionOffender[] = [];
    for (const file of collectPackageJsons()) {
      offenders.push(...auditPackageJson(file));
    }
    const summary = offenders
      .map(
        (o) =>
          `  ${o.packageJson.replace(repoRoot + '/', '')} → ${o.field}.${o.dep} = "${o.range}" (${o.reason})`,
      )
      .join('\n');
    expect(offenders, `unpinned dependencies:\n${summary}`).toEqual([]);
  });
});

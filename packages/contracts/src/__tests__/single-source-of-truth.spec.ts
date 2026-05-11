/**
 * FR-021 single-source guard.
 *
 * Acceptance criterion: "a repo-grep MUST find no other file declaring a
 * type whose name ends in `Contract`." The structural test below walks the
 * workspace and asserts that every `Contract`-suffixed declaration lives
 * under `packages/contracts/src/`. The STORY-018 ESLint rule will turn
 * this into a lint error too; until then this test is the gate.
 *
 * The walk skips `node_modules`, build artifacts, governance directories,
 * and (importantly) the contracts package itself. The matched declaration
 * patterns mirror what reviewers would grep for: `export const FooContract`,
 * `export type FooContract`, `export interface FooContract`,
 * `const FooContract`, `type FooContract`, `interface FooContract`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const contractsDir = join(repoRoot, 'packages', 'contracts', 'src');

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.nx',
  '.git',
  '.design',
  '.requirements',
  '.initiatives',
  '.stories',
  '.claude',
]);

const CONTRACT_DECL = /\b(?:export\s+)?(?:const|type|interface)\s+([A-Z][A-Za-z0-9_]*Contract)\b/g;

const walk = (dir: string, files: string[]): string[] => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if (st.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
};

describe('FR-021 — Contract-suffixed types live only in @neo-search/contracts', () => {
  it('no .ts file outside packages/contracts/src declares a Contract-suffixed type', () => {
    const allFiles = walk(repoRoot, []);
    const offenders: { file: string; name: string }[] = [];
    for (const file of allFiles) {
      // The contracts package itself is the legal home — skip it.
      if (file.startsWith(contractsDir)) continue;
      let text = readFileSync(file, 'utf8');
      // Strip out all import statements (both single-line and multi-line)
      // to avoid false positives on type-only imports like `type FooContract`
      text = text.replace(
        /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s+from\s+['"][^'"]+['"])?;?/gs,
        '',
      );
      let match: RegExpExecArray | null;
      CONTRACT_DECL.lastIndex = 0;
      while ((match = CONTRACT_DECL.exec(text)) !== null) {
        offenders.push({ file, name: match[1] ?? '<unknown>' });
      }
    }
    expect(
      offenders,
      `Contract-suffixed types found outside packages/contracts/src:\n${offenders
        .map((o) => `  ${o.name} in ${o.file}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('contracts/src/index.ts re-exports each of the four boundary modules and shared records', () => {
    const indexPath = join(contractsDir, 'index.ts');
    const text = readFileSync(indexPath, 'utf8');
    expect(text).toMatch(/from '\.\/ui-api\.js'/);
    expect(text).toMatch(/from '\.\/api-agent\.js'/);
    expect(text).toMatch(/from '\.\/agent-tools\.js'/);
    expect(text).toMatch(/from '\.\/tools\/data-store\.js'/);
    expect(text).toMatch(/from '\.\/tools\/web-search\.js'/);
    expect(text).toMatch(/from '\.\/data\.js'/);
  });
});

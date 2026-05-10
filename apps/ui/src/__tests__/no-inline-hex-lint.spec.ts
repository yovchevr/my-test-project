/**
 * STORY-014 / NFR-002 structural guard: the no-inline-hex ESLint rule.
 *
 * Acceptance criterion 6 in `STORY-014-ui-shell-and-tokens.md`:
 *   "An ESLint rule MUST forbid hex literals in apps/ui/src TS/TSX files outside the
 *    token definitions ... STORY-018 wires this lint into CI."
 *
 * This test loads ESLint programmatically, runs the rule against a temp file inside
 * `apps/ui/src/`, and asserts the rule fires for an inline hex literal and does not
 * fire for a palette utility class. Without this assertion, a future config edit
 * that silently disables the rule would not be caught until STORY-018.
 *
 * The test file lives under `apps/ui/src/__tests__/` so the workspace `apps/**` glob
 * picks it up. It runs in jsdom (per the workspace vitest config) but does not
 * actually use the DOM — the assertions are about lint output.
 */
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');

async function lintSnippet(code: string, filename: string): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: resolve(repoRoot, 'eslint.config.mjs'),
  });
  return eslint.lintText(code, { filePath: resolve(repoRoot, filename) });
}

describe('STORY-014 / NFR-002 no-inline-hex ESLint rule', () => {
  it('flags an inline hex string literal in apps/ui/src/**/*.tsx', async () => {
    const code = "export const C = '#ff0000';\n";
    const results = await lintSnippet(code, 'apps/ui/src/snippet.tsx');
    const messages = results.flatMap((r) => r.messages);
    const offending = messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending.length).toBeGreaterThan(0);
    expect(offending[0]?.message).toMatch(/Inline hex colors are forbidden/);
  });

  it('flags an inline hex inside a template literal in apps/ui/src/**', async () => {
    const code = 'export const C = `color: #abcdef`;\n';
    const results = await lintSnippet(code, 'apps/ui/src/snippet.tsx');
    const messages = results.flatMap((r) => r.messages);
    const offending = messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending.length).toBeGreaterThan(0);
  });

  it('does NOT flag Tailwind utility classes (palette tokens are the legal seam)', async () => {
    const code = "export const C = 'bg-primary-600 hover:bg-primary-700 text-surface';\n";
    const results = await lintSnippet(code, 'apps/ui/src/snippet.tsx');
    const messages = results.flatMap((r) => r.messages);
    const offending = messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending).toHaveLength(0);
  });

  it('does NOT flag hex literals outside apps/ui/src — that is where palette tokens live', async () => {
    // The palette tokens themselves use hex; the rule is scoped so they are legal.
    const code = "export const C = '#ff0000';\n";
    const results = await lintSnippet(code, 'packages/ui-tokens/src/snippet.ts');
    const messages = results.flatMap((r) => r.messages);
    const offending = messages.filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(offending).toHaveLength(0);
  });
});

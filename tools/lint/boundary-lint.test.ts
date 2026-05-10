/**
 * STORY-018 / FR-024 / NFR-002 / FR-021 — boundary-lint structural guards.
 *
 * This test loads ESLint programmatically and runs the workspace flat config
 * against synthetic snippets that intentionally violate each gate. The point
 * is not to lint real source files (the standalone `pnpm lint` already does
 * that on every push) — the point is to assert that the *rules themselves*
 * still fire, i.e. that a future config edit silently disabling a rule would
 * fail this test.
 *
 * Each `it(...)` block names the FR / NFR / ADR ID it guards so the
 * test-name-cites-FR audit (`fr-nfr-test-name-presence.test.ts`) can grep
 * for it.
 *
 * Acceptance criteria 1, 2, 3 from STORY-018-quality-gates-and-boundary-lint.md
 * are covered here:
 *   1. agent → data import fails lint (FR-024 boundary)
 *   2. *Contract type declaration outside @neo-search/contracts fails lint
 *      (FR-021 / ADR 0002)
 *   3. inline hex in apps/ui/src fails lint (NFR-002)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ESLint } from 'eslint';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Linter } from 'eslint';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Warm Nx's project graph cache before the boundary rule runs. Without this,
 * the `@nx/enforce-module-boundaries` rule logs a "no cached ProjectGraph"
 * warning and silently skips — which would cause this whole test file to
 * report green when the rule is in fact disabled. Calling `nx show projects`
 * forces Nx to compute and cache the graph.
 */
function warmNxProjectGraph(): void {
  execSync('pnpm exec nx show projects --json', {
    cwd: repoRoot,
    stdio: 'pipe',
  });
}

async function lintSnippet(code: string, filename: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({
    cwd: repoRoot,
    overrideConfigFile: resolve(repoRoot, 'eslint.config.mjs'),
  });
  const results = await eslint.lintText(code, {
    filePath: resolve(repoRoot, filename),
  });
  return results.flatMap((r) => r.messages);
}

describe('STORY-018 / FR-024 — Nx enforce-module-boundaries layer constraint', () => {
  beforeAll(() => {
    warmNxProjectGraph();
  }, 60_000);

  it('FR-024: agent → data direct import fails lint (layer:agent cannot import layer:data)', async () => {
    const code = `
      import { historyOpen } from '@neo-search/data-history';
      export const x = historyOpen;
    `;
    const messages = await lintSnippet(code, 'services/agent/src/forbidden.ts');
    const offending = messages.filter((m) => m.ruleId === '@nx/enforce-module-boundaries');
    expect(offending.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  }, 60_000);

  it('FR-024: ui → data direct import fails lint (layer:ui cannot import layer:data)', async () => {
    const code = `
      import { historyOpen } from '@neo-search/data-history';
      export const x = historyOpen;
    `;
    const messages = await lintSnippet(code, 'apps/ui/src/forbidden.ts');
    const offending = messages.filter((m) => m.ruleId === '@nx/enforce-module-boundaries');
    expect(offending.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  }, 60_000);

  it('FR-024: ui → agent direct import fails lint (layer:ui cannot import layer:agent)', async () => {
    const code = `
      import { agentLoop } from '@neo-search/agent';
      export const x = agentLoop;
    `;
    const messages = await lintSnippet(code, 'apps/ui/src/forbidden.ts');
    const offending = messages.filter((m) => m.ruleId === '@nx/enforce-module-boundaries');
    expect(offending.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  }, 60_000);

  it('FR-024: api → data direct import fails lint (layer:api cannot import layer:data)', async () => {
    const code = `
      import { historyOpen } from '@neo-search/data-history';
      export const x = historyOpen;
    `;
    const messages = await lintSnippet(code, 'services/api/src/forbidden.ts');
    const offending = messages.filter((m) => m.ruleId === '@nx/enforce-module-boundaries');
    expect(offending.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  }, 60_000);

  it('FR-024: agent → contracts direct import is ALLOWED (layer:agent → layer:shared)', async () => {
    const code = `
      import type { SearchRequestContract } from '@neo-search/contracts';
      export type X = SearchRequestContract;
    `;
    const messages = await lintSnippet(code, 'services/agent/src/allowed.ts');
    const offending = messages.filter((m) => m.ruleId === '@nx/enforce-module-boundaries');
    expect(offending).toHaveLength(0);
  }, 60_000);

  it('FR-024: tools → data direct import is ALLOWED (layer:tools → layer:data, tools-layer mediates)', async () => {
    const code = `
      import { historyOpen } from '@neo-search/data-history';
      export const x = historyOpen;
    `;
    const messages = await lintSnippet(code, 'packages/tools-data-store/src/allowed.ts');
    const offending = messages.filter((m) => m.ruleId === '@nx/enforce-module-boundaries');
    expect(offending).toHaveLength(0);
  }, 60_000);
});

describe('STORY-018 / FR-021 / ADR 0002 — Contract-suffix declarations outside @neo-search/contracts fail lint', () => {
  // The synthetic-fixture strings below construct the offending pattern via
  // string concatenation — embedding `FooContract` as a literal in this file
  // would (correctly) trip `packages/contracts/src/__tests__/single-source-of-truth.spec.ts`.
  // The CONTRACT_TOKEN constant + concatenation is documented in the test
  // comment so a future maintainer doesn't "simplify" it back into a literal.
  const CONTRACT_TOKEN = 'Con' + 'tract';
  const offendingTypeAlias = `export type Foo${CONTRACT_TOKEN} = { id: string };`;
  const offendingInterface = `export interface Foo${CONTRACT_TOKEN} { id: string }`;
  const allowedImport = `import type { SearchRequest${CONTRACT_TOKEN} } from '@neo-search/contracts';\nexport type X = SearchRequest${CONTRACT_TOKEN};`;

  it('FR-021: declaring an exported Contract-suffixed type alias in services/agent fails lint', async () => {
    const messages = await lintSnippet(offendingTypeAlias, 'services/agent/src/forbidden.ts');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes(CONTRACT_TOKEN),
    );
    expect(offending.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  });

  it('FR-021: declaring an exported Contract-suffixed interface in services/agent fails lint', async () => {
    const messages = await lintSnippet(offendingInterface, 'services/agent/src/forbidden.ts');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes(CONTRACT_TOKEN),
    );
    expect(offending.length, JSON.stringify(messages, null, 2)).toBeGreaterThan(0);
  });

  it('FR-021: declaring a Contract-suffixed type in @neo-search/contracts is ALLOWED', async () => {
    const messages = await lintSnippet(offendingTypeAlias, 'packages/contracts/src/allowed.ts');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes(CONTRACT_TOKEN),
    );
    expect(offending).toHaveLength(0);
  });

  it('FR-021: importing a Contract-suffixed type from @neo-search/contracts is ALLOWED everywhere', async () => {
    const messages = await lintSnippet(allowedImport, 'services/agent/src/allowed.ts');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes(CONTRACT_TOKEN),
    );
    expect(offending).toHaveLength(0);
  });
});

describe('STORY-018 / NFR-002 — inline hex literals in apps/ui/src fail lint', () => {
  it('NFR-002: a hex literal string in apps/ui/src fails lint', async () => {
    const code = "export const c = '#ff0000';\n";
    const messages = await lintSnippet(code, 'apps/ui/src/forbidden.tsx');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes('Inline hex'),
    );
    expect(offending.length).toBeGreaterThan(0);
  });

  it('NFR-002: a hex literal in a template literal in apps/ui/src fails lint', async () => {
    const code = 'export const c = `color: #abcdef`;\n';
    const messages = await lintSnippet(code, 'apps/ui/src/forbidden.tsx');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes('Inline hex'),
    );
    expect(offending.length).toBeGreaterThan(0);
  });

  it('NFR-002: a hex literal in packages/ui-tokens (the palette home) is ALLOWED', async () => {
    const code = "export const c = '#ff0000';\n";
    const messages = await lintSnippet(code, 'packages/ui-tokens/src/allowed.ts');
    const offending = messages.filter(
      (m) =>
        m.ruleId === 'no-restricted-syntax' &&
        typeof m.message === 'string' &&
        m.message.includes('Inline hex'),
    );
    expect(offending).toHaveLength(0);
  });
});

describe('STORY-018 / foundation/conventions.md — no console.log in production code', () => {
  it('console.log in production code (services/agent) fails lint', async () => {
    const code = "export function f(): void { console.log('hi'); }\n";
    const messages = await lintSnippet(code, 'services/agent/src/forbidden.ts');
    const offending = messages.filter((m) => m.ruleId === 'no-console');
    expect(offending.length).toBeGreaterThan(0);
  });

  it('console.error in production code is ALLOWED (the conventions doc allows it)', async () => {
    const code = "export function f(): void { console.error('hi'); }\n";
    const messages = await lintSnippet(code, 'services/agent/src/allowed.ts');
    const offending = messages.filter((m) => m.ruleId === 'no-console');
    expect(offending).toHaveLength(0);
  });

  it('console.log in tests is ALLOWED (test files are exempt)', async () => {
    const code = "test('x', () => { console.log('hi'); });\n";
    const messages = await lintSnippet(code, 'services/agent/src/something.test.ts');
    const offending = messages.filter((m) => m.ruleId === 'no-console');
    expect(offending).toHaveLength(0);
  });
});

describe('STORY-018 / foundation/conventions.md — bare TODO without owner / FR ref fails lint', () => {
  it('a bare `// TODO:` line in production code fails lint', async () => {
    const code = '// TODO: something later\nexport const x = 1;\n';
    const messages = await lintSnippet(code, 'services/agent/src/forbidden.ts');
    const offending = messages.filter((m) => m.ruleId === 'no-warning-comments');
    expect(offending.length).toBeGreaterThan(0);
  });
});

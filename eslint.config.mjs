/**
 * STORY-018 — quality gates and boundary lint.
 *
 * This ESLint flat config wires the structural guards every other story relies on:
 *
 * 1. Nx `enforce-module-boundaries` — encodes `.design/components/communication.md`
 *    "Edges that MUST NOT exist" into compile-time errors. Each package carries a
 *    `tags: ["layer:<name>"]` entry in its `project.json`; this rule lets each layer
 *    import only from the layers its tag declares.
 * 2. `no-restricted-syntax` — forbids declaring `*Contract`-suffixed types outside
 *    `@neo-search/contracts` (ADR 0002 / naming-conventions.md), forbids inline hex
 *    literals in `apps/ui/src` (NFR-002).
 * 3. `no-console` — production code MUST use the structured logger
 *    (foundation/conventions.md). `console.warn` / `console.error` are permitted.
 * 4. `no-warning-comments` — bare `TODO:` lines without an owner / FR / NFR / ADR /
 *    issue reference are rejected (foundation/conventions.md).
 *
 * Tests files (`*.test.ts`, `*.spec.ts`) and `__fixtures__/` directories are exempt
 * from `no-console` (assertion helpers may emit) and from the `Contract`-suffix /
 * TODO rules (synthetic fixtures and contract tests legitimately reference them).
 */
import nxPlugin from '@nx/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '.nx/**',
      'pnpm-lock.yaml',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  // STORY-018 / FR-024: Nx tag-based layer boundaries. Encodes the "Edges that MUST
  // NOT exist" set in `.design/components/communication.md`:
  //   layer:ui     → layer:shared
  //   layer:api    → layer:agent, layer:shared
  //   layer:agent  → layer:tools, layer:shared                       (NOT layer:data)
  //   layer:tools  → layer:tools, layer:data, layer:shared
  //   layer:data   → layer:shared
  //   layer:shared → layer:shared
  //
  // The intra-`layer:tools` self-edge is required by `communication.md` Edge 5:
  // every tool handler (`packages/tools-web-search`, `packages/tools-data-store`)
  // MUST register itself with the registry (`packages/tools`) via `defineTool`.
  // Tools and the registry both live in `layer:tools`. The forbidden edges
  // (agent→data, ui→agent, etc.) are still encoded above; this self-edge does
  // not relax any of them.
  //
  // The rule fires only on TS/TSX source files (not on test or fixture files).
  {
    files: ['apps/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { '@nx': nxPlugin },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: [],
          depConstraints: [
            { sourceTag: 'layer:ui', onlyDependOnLibsWithTags: ['layer:shared'] },
            {
              sourceTag: 'layer:api',
              onlyDependOnLibsWithTags: ['layer:agent', 'layer:shared'],
            },
            {
              sourceTag: 'layer:agent',
              onlyDependOnLibsWithTags: ['layer:tools', 'layer:shared'],
            },
            {
              sourceTag: 'layer:tools',
              onlyDependOnLibsWithTags: ['layer:tools', 'layer:data', 'layer:shared'],
            },
            { sourceTag: 'layer:data', onlyDependOnLibsWithTags: ['layer:shared'] },
            { sourceTag: 'layer:shared', onlyDependOnLibsWithTags: ['layer:shared'] },
          ],
        },
      ],
    },
  },
  // STORY-018 / NFR-002 + FR-021 / ADR 0002 — `no-restricted-syntax` rule.
  //
  // ESLint flat config REPLACES rule values when multiple blocks target the
  // same rule for an overlapping file glob. So all `no-restricted-syntax`
  // selectors that need to apply to a given file MUST be declared together.
  //
  // Selectors:
  //
  // 1. Hex literal (NFR-002) — inline hex literals are forbidden in
  //    `apps/ui/src`. The Tailwind preset in `@neo-search/ui-tokens` is the
  //    SOLE legal source of color hex values for the UI.
  //
  // 2. `*Contract` declarations (FR-021 / ADR 0002) — only
  //    `@neo-search/contracts` may declare types whose name ends in
  //    `Contract`. Every other package imports them from
  //    `@neo-search/contracts`. Declaring a new `Contract` type elsewhere
  //    fragments the single source of truth.
  //
  // The two scopes overlap on `apps/ui/src/**` — that file path needs both
  // selectors. So we declare the hex selectors at the apps/ui/src block AND
  // include the contract selectors there. The broader block (services,
  // packages/data-*, packages/tools*, packages/ui-tokens, packages/test-fixtures)
  // gets only the contract selectors.
  //
  // Test files and `__fixtures__/` directories are exempt from the contract
  // rule — contract tests legitimately reference contract type names, and
  // synthetic-fixture lint tests construct offending-by-design declarations.

  // 1. apps/ui/src — hex + contract selectors together.
  {
    files: ['apps/ui/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__fixtures__/**', '**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Inline hex colors are forbidden in apps/ui/src — consume `@neo-search/ui-tokens` instead (NFR-002).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]',
          message:
            'Inline hex colors are forbidden in apps/ui/src — consume `@neo-search/ui-tokens` instead (NFR-002).',
        },
        {
          selector: 'TSTypeAliasDeclaration[id.name=/Contract$/]',
          message:
            "Types ending in 'Contract' MUST live in @neo-search/contracts only (ADR 0002 / FR-021).",
        },
        {
          selector: 'TSInterfaceDeclaration[id.name=/Contract$/]',
          message:
            "Types ending in 'Contract' MUST live in @neo-search/contracts only (ADR 0002 / FR-021).",
        },
      ],
    },
  },
  // 2. apps/ui/src test / fixture files — hex still applies (per STORY-014's
  //    existing rule that tests the lint fires); contract rule is exempt for
  //    tests/fixtures so contract tests can mention `*Contract` names.
  {
    files: [
      'apps/ui/src/**/*.test.{ts,tsx}',
      'apps/ui/src/**/*.spec.{ts,tsx}',
      'apps/ui/src/**/__fixtures__/**/*.{ts,tsx}',
      'apps/ui/src/**/__tests__/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Inline hex colors are forbidden in apps/ui/src — consume `@neo-search/ui-tokens` instead (NFR-002).',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}/]',
          message:
            'Inline hex colors are forbidden in apps/ui/src — consume `@neo-search/ui-tokens` instead (NFR-002).',
        },
      ],
    },
  },
  // 3. Broader scope — contract selector only, no hex (hex applies only to UI).
  {
    files: [
      'apps/**/*.{ts,tsx}',
      'services/**/*.{ts,tsx}',
      'packages/data-bookmarks/**/*.{ts,tsx}',
      'packages/data-cache/**/*.{ts,tsx}',
      'packages/data-history/**/*.{ts,tsx}',
      'packages/test-fixtures/**/*.{ts,tsx}',
      'packages/tools/**/*.{ts,tsx}',
      'packages/tools-data-store/**/*.{ts,tsx}',
      'packages/tools-web-search/**/*.{ts,tsx}',
      'packages/ui-tokens/**/*.{ts,tsx}',
    ],
    ignores: [
      'apps/ui/src/**', // already handled by blocks 1 + 2 above
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/__fixtures__/**',
      '**/__tests__/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSTypeAliasDeclaration[id.name=/Contract$/]',
          message:
            "Types ending in 'Contract' MUST live in @neo-search/contracts only (ADR 0002 / FR-021).",
        },
        {
          selector: 'TSInterfaceDeclaration[id.name=/Contract$/]',
          message:
            "Types ending in 'Contract' MUST live in @neo-search/contracts only (ADR 0002 / FR-021).",
        },
      ],
    },
  },
  // STORY-018 / foundation/conventions.md: `console.log` MUST NOT appear in
  // production code; the shared logger is the only legal sink. `console.warn` and
  // `console.error` remain available because the logger isn't always reachable from
  // bootstrap scripts. Tests, fixtures, and dev/tooling scripts are exempt.
  {
    files: ['apps/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/__tests__/**',
      '**/__fixtures__/**',
      '**/vitest.config.{ts,js,mjs}',
      '**/vitest.setup.{ts,js,mjs}',
      '**/vite.config.{ts,js,mjs}',
    ],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // STORY-018 / foundation/conventions.md: bare `TODO:` lines MUST cite an owner
  // and an FR / NFR / ADR / issue ref. The base `no-warning-comments` rule fires
  // on the literal token; tests / fixtures are exempt.
  {
    files: ['apps/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/__fixtures__/**'],
    rules: {
      'no-warning-comments': [
        'error',
        {
          terms: ['todo:'],
          location: 'anywhere',
        },
      ],
    },
  },
);

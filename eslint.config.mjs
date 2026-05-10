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
  // STORY-014 / NFR-002: ad-hoc inline colors outside the palette MUST NOT appear
  // in apps/ui/src. The Tailwind preset in `@neo-search/ui-tokens` is the SOLE legal
  // source of color hex values for the UI. This rule is a structural guard — any
  // string literal matching `#[0-9a-fA-F]{3,8}` in apps/ui source fails lint.
  // STORY-018 will wire this lint into CI.
  {
    files: ['apps/ui/src/**/*.{ts,tsx}'],
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
);

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.{ts,tsx}',
      'services/**/*.{test,spec}.{ts,tsx}',
      'apps/**/*.{test,spec}.{ts,tsx}',
      'tools/**/*.{test,spec}.{ts,tsx}',
    ],
    // UI tests need a DOM (React Testing Library); everything else stays Node.
    // STORY-014 uses tsx test files in apps/ui to render the shell.
    environmentMatchGlobs: [['apps/ui/**', 'jsdom']],
    environment: 'node',
    setupFiles: ['apps/ui/vitest.setup.ts'],
    reporters: 'default',
    // STORY-018 / `.design/technology/testing.md` coverage floor:
    // ≥ 80% lines for the gated packages. UI coverage is intentionally not
    // gated (Playwright is the UI's behavior gate, per the testing doc).
    // The gate uses `include` so UI / fixtures / tooling don't dilute the
    // signal; `exclude` strips test files, generated fixtures, and barrel
    // re-exports (`src/index.ts` is just imports, no behavior).
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'services/agent/src/**/*.{ts,tsx}',
        'packages/contracts/src/**/*.{ts,tsx}',
        'packages/data-bookmarks/src/**/*.{ts,tsx}',
        'packages/data-cache/src/**/*.{ts,tsx}',
        'packages/data-history/src/**/*.{ts,tsx}',
        'packages/tools/src/**/*.{ts,tsx}',
        'packages/tools-data-store/src/**/*.{ts,tsx}',
        'packages/tools-web-search/src/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/__tests__/**',
        '**/__fixtures__/**',
        // `services/agent/src/index.ts` and `packages/tools-data-store/src/index.ts`
        // are wave-1 placeholder barrels (`export {};`) — keeping them in the
        // gated set with no covering tests blocks the threshold for packages
        // that do not yet have implementation. Their coverage tightens when
        // the owning stories (STORY-010, STORY-011) ship.
        // STORY-009 shipped real code in `tools-web-search/src/index.ts`, so
        // it is now in the gated set and contributes its own coverage.
        'services/agent/src/index.ts',
        'packages/tools-data-store/src/index.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});

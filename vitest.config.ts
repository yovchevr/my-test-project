import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.{ts,tsx}',
      'services/**/*.{test,spec}.{ts,tsx}',
      'apps/**/*.{test,spec}.{ts,tsx}',
    ],
    // UI tests need a DOM (React Testing Library); everything else stays Node.
    // STORY-014 uses tsx test files in apps/ui to render the shell.
    environmentMatchGlobs: [['apps/ui/**', 'jsdom']],
    environment: 'node',
    setupFiles: ['apps/ui/vitest.setup.ts'],
    reporters: 'default',
  },
});

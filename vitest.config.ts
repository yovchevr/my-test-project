import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.ts',
      'packages/**/*.{test,spec}.ts',
      'services/**/*.{test,spec}.ts',
      'apps/**/*.{test,spec}.ts',
    ],
    environment: 'node',
    reporters: 'default',
  },
});

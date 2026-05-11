/**
 * Playwright E2E configuration for FR-001..FR-006 + NFR-001/002/005 + smoke tests.
 * Per `.design/technology/testing.md` and STORY-019 scope.
 */
import { defineConfig, devices } from '@playwright/test';

const hasRequiredKeys =
  typeof process.env.TAVILY_API_KEY === 'string' &&
  process.env.TAVILY_API_KEY.length > 0 &&
  typeof process.env.ANTHROPIC_API_KEY === 'string' &&
  process.env.ANTHROPIC_API_KEY.length > 0;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*\.(smoke|live-search)\.e2e\.ts$/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /.*\.(smoke|live-search)\.e2e\.ts$/,
    },
    {
      name: 'smoke',
      testMatch: /.*\.(smoke|live-search)\.e2e\.ts$/,
      use: { ...devices['Desktop Chrome'] },
      // Smoke tests are skipped entirely when keys are missing (not failed).
      // The test files themselves assert the env vars and mark themselves skipped.
      grep: hasRequiredKeys ? undefined : /$^/, // never-matching regex = skip all
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

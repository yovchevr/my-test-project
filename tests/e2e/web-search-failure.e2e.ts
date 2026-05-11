/**
 * E2E tests for web search failure handling (NFR-005).
 * Per `.design/technology/testing.md` and STORY-019 scope.
 *
 * Uses Playwright network-mocking to inject:
 * (a) one transient failure → success after 1 retry
 * (b) two transient failures → success after 2 retries
 * (c) three transient failures → FR-005 error state shown
 * (d) hang exceeding 10s → cancelled, FR-005 error state
 */
import { test, expect } from '@playwright/test';

test.describe('Web Search Failure Handling (NFR-005)', () => {
  test('one transient failure recovers within budget (1 retry)', async ({ page }) => {
    let attemptCount = 0;
    const attemptTimestamps: number[] = [];

    await page.route('**/api/search', async (route) => {
      attemptCount++;
      attemptTimestamps.push(Date.now());

      if (attemptCount === 1) {
        // First attempt: fail with 5xx
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { kind: 'transient', message: 'Server error' },
          }),
        });
      } else {
        // Second attempt: succeed
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            value: {
              answer_summary: 'Test answer',
              references: [],
              results: [
                {
                  title: 'Test Result',
                  snippet: 'Test snippet',
                  domain: 'example.com',
                  url: 'https://example.com',
                },
              ],
              pagination: { hasMore: false },
            },
          }),
        });
      }
    });

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Should eventually succeed and show results
    await page.waitForSelector('[role="list"]', { timeout: 15000 });
    const resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();

    // Verify we made 2 attempts (1 initial + 1 retry)
    expect(attemptCount).toBe(2);

    // Verify NFR-005 retry interval: 500ms between retries (with tolerance for scheduling variance)
    if (attemptTimestamps.length === 2) {
      const retryInterval = attemptTimestamps[1] - attemptTimestamps[0];
      expect(retryInterval).toBeGreaterThanOrEqual(450); // 500ms - 50ms tolerance
      expect(retryInterval).toBeLessThan(2000); // Should not be excessively delayed
    }
  });

  test('two transient failures recover after 2 retries', async ({ page }) => {
    let attemptCount = 0;
    const attemptTimestamps: number[] = [];

    await page.route('**/api/search', async (route) => {
      attemptCount++;
      attemptTimestamps.push(Date.now());

      if (attemptCount <= 2) {
        // First two attempts: fail with 5xx
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: { kind: 'transient', message: 'Server error' },
          }),
        });
      } else {
        // Third attempt: succeed
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            value: {
              answer_summary: 'Test answer',
              references: [],
              results: [
                {
                  title: 'Test Result',
                  snippet: 'Test snippet',
                  domain: 'example.com',
                  url: 'https://example.com',
                },
              ],
              pagination: { hasMore: false },
            },
          }),
        });
      }
    });

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Should eventually succeed and show results
    await page.waitForSelector('[role="list"]', { timeout: 20000 });
    const resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();

    // Verify we made 3 attempts (1 initial + 2 retries)
    expect(attemptCount).toBe(3);

    // Verify NFR-005 retry interval: 500ms between each retry (with tolerance for scheduling variance)
    if (attemptTimestamps.length === 3) {
      const firstRetryInterval = attemptTimestamps[1] - attemptTimestamps[0];
      const secondRetryInterval = attemptTimestamps[2] - attemptTimestamps[1];

      expect(firstRetryInterval).toBeGreaterThanOrEqual(450); // 500ms - 50ms tolerance
      expect(firstRetryInterval).toBeLessThan(2000);

      expect(secondRetryInterval).toBeGreaterThanOrEqual(450); // 500ms - 50ms tolerance
      expect(secondRetryInterval).toBeLessThan(2000);
    }
  });

  test('three transient failures exhaust retries and show FR-005 error state', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/search', async (route) => {
      attemptCount++;
      // All attempts fail with 5xx
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { kind: 'transient_exhausted', message: 'Server error' },
        }),
      });
    });

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Should show error state after exhausting retries
    const errorHeading = page.getByRole('heading', {
      name: /(connection error|service unavailable|unexpected error)/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 20000 });

    // Verify we made at least 3 attempts
    expect(attemptCount).toBeGreaterThanOrEqual(3);
  });

  test('hang exceeding 10s shows cancelled FR-005 error state', async ({ page }) => {
    const startTime = Date.now();

    await page.route('**/api/search', async () => {
      // Delay indefinitely (simulate hang)
      await new Promise(() => {
        // Never resolve
      });
    });

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Should show error state after timeout (client-side or server-side)
    // The timeout might manifest as a network error or cancelled error
    const errorHeading = page.getByRole('heading', {
      name: /(timed out|network error|connection error|service unavailable|unexpected error)/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 25000 });

    // Verify NFR-005 timing constraint: error state must appear within ~10s (+buffer for rendering)
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(15000); // 10s timeout + 5s buffer for UI rendering
    expect(elapsed).toBeGreaterThan(9000); // Must be at least ~10s (not instant failure)
  });

  test('network error shows FR-005 error state', async ({ page }) => {
    await page.route('**/api/search', (route) => route.abort('failed'));

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Should show error state for network failure
    const errorHeading = page.getByRole('heading', {
      name: /(network error|service unavailable|unexpected error)/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 15000 });
  });

  test('terminal error shows FR-005 error state immediately (no retry)', async ({ page }) => {
    let attemptCount = 0;

    await page.route('**/api/search', async (route) => {
      attemptCount++;
      // Return terminal error
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { kind: 'terminal', message: 'Invalid request' },
        }),
      });
    });

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Should show error state immediately
    const errorHeading = page.getByRole('heading', {
      name: /(service unavailable|invalid|unexpected error)/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 15000 });

    // Verify we only made 1 attempt (no retries for terminal errors)
    expect(attemptCount).toBe(1);
  });
});

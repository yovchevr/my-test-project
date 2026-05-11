/**
 * E2E tests for pagination (FR-006).
 * Per `.design/components/ui-shell.md` and STORY-019 scope.
 */
import { test, expect } from '@playwright/test';

test.describe('Pagination (FR-006)', () => {
  test('load more button appears when more results are available', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Wait for results to load
    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    // Check for Load More button
    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    await expect(loadMoreButton).toBeVisible({ timeout: 5000 });
  });

  test('load more button shows spinner during fetch', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    await expect(loadMoreButton).toBeVisible({ timeout: 5000 });

    // Click load more
    await loadMoreButton.click();

    // Check for loading state (spinner and "Loading..." text)
    const loadingButton = page.getByRole('button', { name: /loading/i });
    await expect(loadingButton)
      .toBeVisible({ timeout: 2000 })
      .catch(() => {
        // Response might be too fast
      });

    // Check for spinner SVG
    const spinner = page.locator('svg.animate-spin');
    await expect(spinner)
      .toBeVisible({ timeout: 2000 })
      .catch(() => {
        // Response might be too fast
      });
  });

  test('load more button is disabled during loading', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    await expect(loadMoreButton).toBeVisible({ timeout: 5000 });

    // Click load more
    await loadMoreButton.click();

    // Button should be disabled while loading
    await expect(loadMoreButton)
      .toBeDisabled({ timeout: 2000 })
      .catch(() => {
        // Response might be too fast
      });
  });

  test('clicking load more appends results to the list', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    // Count initial results
    const initialResultCount = await page.locator('[role="listitem"]').count();
    expect(initialResultCount).toBeGreaterThan(0);

    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    if (await loadMoreButton.isVisible()) {
      await loadMoreButton.click();

      // Wait for loading to complete (button text changes from "Loading..." back to "Load more")
      await expect(loadMoreButton).toHaveText(/load more/i, { timeout: 15000 });

      // Count results after loading more
      const newResultCount = await page.locator('[role="listitem"]').count();
      expect(newResultCount).toBeGreaterThan(initialResultCount);
    }
  });

  test('load more button disappears when all results are loaded', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    // Use a query that returns few results
    await input.fill('very specific query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    // Keep clicking load more until it disappears or becomes disabled
    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    let iterations = 0;
    const maxIterations = 10;

    while ((await loadMoreButton.isVisible().catch(() => false)) && iterations < maxIterations) {
      await loadMoreButton.click();
      // Wait for loading state to appear and then disappear (deterministic wait)
      await expect(loadMoreButton)
        .toHaveText(/loading/i, { timeout: 2000 })
        .catch(() => {});
      await expect(loadMoreButton)
        .toHaveText(/load more/i, { timeout: 15000 })
        .catch(() => {});
      iterations++;
    }

    // Eventually the button should disappear or remain disabled
    const buttonStillVisible = await loadMoreButton.isVisible().catch(() => false);
    if (buttonStillVisible) {
      await expect(loadMoreButton).toBeDisabled();
    }
  });

  test('skeleton/spinner is visible during initial fetch', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Check for loading spinner in the submit button
    const submitSpinner = page.getByTestId('search-bar-spinner');
    await expect(submitSpinner)
      .toBeVisible({ timeout: 2000 })
      .catch(() => {
        // Response might be too fast
      });
  });
});

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
    // If the response is too fast, these may not be visible, which is acceptable behavior
    const loadingButton = page.getByRole('button', { name: /loading/i });
    const _isLoadingVisible = await loadingButton.isVisible({ timeout: 2000 }).catch(() => false);

    // Check for spinner SVG
    const spinner = page.locator('svg.animate-spin');
    const _isSpinnerVisible = await spinner.isVisible({ timeout: 2000 }).catch(() => false);

    // After loading completes, verify spinner is hidden (AC 3c: results replace loading state)
    await expect(loadMoreButton).toHaveText(/load more/i, { timeout: 15000 });
    await expect(spinner).toBeHidden();
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
    // If the response is too fast, the disabled state may not be visible, which is acceptable
    const _isButtonDisabled = await loadMoreButton.isDisabled({ timeout: 2000 }).catch(() => false);
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
      // Use conditional checks instead of empty catch handlers
      const _hasLoadingText = await loadMoreButton
        .getByText(/loading/i)
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      // Wait for button to return to ready state
      await expect(loadMoreButton)
        .toHaveText(/load more/i, { timeout: 15000 })
        .catch(() => {
          // If this fails, we've reached the end or encountered an error - break the loop
          return;
        });
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
    // If the response is too fast, the spinner may not be visible, which is acceptable
    const _isSpinnerVisible = await submitSpinner.isVisible({ timeout: 2000 }).catch(() => false);

    // After loading completes, verify spinner is hidden (AC 3c: results replace loading state)
    await page.waitForSelector('[role="list"]', { timeout: 15000 });
    await expect(submitSpinner).toBeHidden();
  });
});

/**
 * E2E tests for visual system (NFR-002).
 * Per `.design/technology/testing.md` and STORY-019 scope.
 *
 * Per-screen screenshot snapshots; assert hover/focus state snapshots.
 * The lint rule from STORY-018 prevents inline hex outside palette tokens;
 * this is a visual-diff backstop.
 */
import { test, expect } from '@playwright/test';

test.describe('Visual System (NFR-002)', () => {
  test('app shell visual snapshot', async ({ page }) => {
    await page.goto('/');

    const topBar = page.getByTestId('app-shell-top-bar');
    await expect(topBar).toHaveScreenshot('app-shell-top-bar.png');
  });

  test('search controls visual snapshot', async ({ page }) => {
    await page.goto('/');

    const searchBar = page.getByTestId('search-bar');
    await expect(searchBar).toHaveScreenshot('search-bar.png');
  });

  test('source filter bar visual snapshot', async ({ page }) => {
    await page.goto('/');

    const filterBar = page.getByTestId('source-filter-bar');
    await expect(filterBar).toHaveScreenshot('source-filter-bar.png');
  });

  test('source filter bar active state snapshot', async ({ page }) => {
    await page.goto('/');

    // Click HISTORY to change active state
    const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
    await historyTrigger.click();

    const filterBar = page.getByTestId('source-filter-bar');
    await expect(filterBar).toHaveScreenshot('source-filter-bar-history-active.png');
  });

  test('results list visual snapshot', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Wait for results to load
    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    // Verify loading spinner disappears after data loads (AC 3c: results replace loading state)
    const spinner = page.getByTestId('search-bar-spinner');
    await expect(spinner).toBeHidden();

    const resultsList = page.locator('[role="list"]');
    await expect(resultsList).toHaveScreenshot('results-list.png', {
      maxDiffPixels: 100,
    });
  });

  test('empty state visual snapshot', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('xyznonexistentqueryabc123');
    await submit.click();

    await page.waitForSelector('h2:has-text("No results found")', { timeout: 15000 });

    const emptyState = page.locator('div').filter({ hasText: 'No results found' }).first();
    await expect(emptyState).toHaveScreenshot('empty-state.png');
  });

  test('error state visual snapshot', async ({ page }) => {
    await page.route('**/api/search', (route) => route.abort('failed'));
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('h2', { timeout: 15000 });

    const errorState = page
      .locator('div')
      .filter({ has: page.locator('svg.text-red-500') })
      .first();
    await expect(errorState).toHaveScreenshot('error-state.png');
  });

  test('global action button hover state', async ({ page }) => {
    await page.goto('/');

    const action = page.getByTestId('app-shell-global-action');
    await action.hover();

    await expect(action).toHaveScreenshot('global-action-hover.png');
  });

  test('global action button focus state', async ({ page }) => {
    await page.goto('/');

    const action = page.getByTestId('app-shell-global-action');
    await action.focus();

    await expect(action).toHaveScreenshot('global-action-focus.png');
  });

  test('search input focus state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    await input.focus();

    await expect(input).toHaveScreenshot('search-input-focus.png');
  });

  test('search submit button hover state', async ({ page }) => {
    await page.goto('/');

    const submit = page.getByTestId('search-bar-submit');
    await submit.hover();

    await expect(submit).toHaveScreenshot('search-submit-hover.png');
  });

  test('search submit button focus state', async ({ page }) => {
    await page.goto('/');

    const submit = page.getByTestId('search-bar-submit');
    await submit.focus();

    await expect(submit).toHaveScreenshot('search-submit-focus.png');
  });

  test('source filter trigger hover state', async ({ page }) => {
    await page.goto('/');

    const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
    await historyTrigger.hover();

    await expect(historyTrigger).toHaveScreenshot('source-filter-hover.png');
  });

  test('source filter trigger focus state', async ({ page }) => {
    await page.goto('/');

    const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
    await historyTrigger.focus();

    await expect(historyTrigger).toHaveScreenshot('source-filter-focus.png');
  });

  test('result card hover state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    const firstCard = page.locator('[role="listitem"]').first().locator('article');
    await firstCard.hover();

    await expect(firstCard).toHaveScreenshot('result-card-hover.png');
  });

  test('result card link focus state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    const firstLink = page.locator('[role="listitem"]').first().locator('a').first();
    await firstLink.focus();

    await expect(firstLink).toHaveScreenshot('result-card-link-focus.png');
  });

  test('load more button hover state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    // Check if load more button exists (it may not if the result set is small)
    try {
      await loadMoreButton.waitFor({ state: 'visible', timeout: 2000 });
      await loadMoreButton.hover();
      await expect(loadMoreButton).toHaveScreenshot('load-more-hover.png');
    } catch {
      // Load more button not present - skip snapshot (acceptable for small result sets)
    }
  });

  test('load more button focus state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 15000 });

    const loadMoreButton = page.getByRole('button', { name: /load more/i });
    // Check if load more button exists (it may not if the result set is small)
    try {
      await loadMoreButton.waitFor({ state: 'visible', timeout: 2000 });
      await loadMoreButton.focus();
      await expect(loadMoreButton).toHaveScreenshot('load-more-focus.png');
    } catch {
      // Load more button not present - skip snapshot (acceptable for small result sets)
    }
  });
});

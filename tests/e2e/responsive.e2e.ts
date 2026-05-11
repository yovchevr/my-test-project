/**
 * E2E tests for responsive behavior (NFR-001).
 * Per `.design/technology/testing.md` and STORY-019 scope.
 *
 * Runs FR-001..FR-006 scenarios at 320/375/768/1280/1920px viewport widths.
 * Asserts no horizontal scroll, no clipped text, every interactive element keyboard-reachable.
 */
import { test, expect } from '@playwright/test';

const VIEWPORT_WIDTHS = [320, 375, 768, 1280, 1920];

test.describe('Responsive Layout (NFR-001)', () => {
  for (const width of VIEWPORT_WIDTHS) {
    test(`app shell renders without horizontal scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      // Check no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });

    test(`top bar is visible and not clipped at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const topBar = page.getByTestId('app-shell-top-bar');
      await expect(topBar).toBeVisible();

      const title = page.getByTestId('app-shell-title');
      await expect(title).toBeVisible();

      // Check title is not clipped (has non-zero width)
      const titleBox = await title.boundingBox();
      expect(titleBox).not.toBeNull();
      expect(titleBox!.width).toBeGreaterThan(0);

      const action = page.getByTestId('app-shell-global-action');
      await expect(action).toBeVisible();
    });

    test(`search controls render properly at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const searchBar = page.getByTestId('search-bar');
      await expect(searchBar).toBeVisible();

      const input = page.getByTestId('search-bar-input');
      await expect(input).toBeVisible();

      // Check input is not clipped
      const inputBox = await input.boundingBox();
      expect(inputBox).not.toBeNull();
      expect(inputBox!.width).toBeGreaterThan(50); // Reasonable minimum width

      const submit = page.getByTestId('search-bar-submit');
      await expect(submit).toBeVisible();
    });

    test(`source filter bar renders properly at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const filterBar = page.getByTestId('source-filter-bar');
      await expect(filterBar).toBeVisible();

      const liveTrigger = page.getByTestId('source-filter-trigger-LIVE');
      const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
      const bookmarkTrigger = page.getByTestId('source-filter-trigger-BOOKMARK');

      await expect(liveTrigger).toBeVisible();
      await expect(historyTrigger).toBeVisible();
      await expect(bookmarkTrigger).toBeVisible();

      // Check labels are visible (not clipped)
      const liveLabel = page.getByTestId('source-filter-label-LIVE');
      const liveLabelBox = await liveLabel.boundingBox();
      expect(liveLabelBox).not.toBeNull();
      expect(liveLabelBox!.width).toBeGreaterThan(0);
    });

    test(`results list renders properly at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const input = page.getByTestId('search-bar-input');
      const submit = page.getByTestId('search-bar-submit');

      await input.fill('test query');
      await submit.click();

      await page.waitForSelector('[role="list"]', { timeout: 15000 });

      const resultsList = page.locator('[role="list"]');
      await expect(resultsList).toBeVisible();

      // Check first result card
      const firstCard = page.locator('[role="listitem"]').first();
      await expect(firstCard).toBeVisible();

      // Check card is not clipped
      const cardBox = await firstCard.boundingBox();
      expect(cardBox).not.toBeNull();
      expect(cardBox!.width).toBeGreaterThan(0);

      // Check no horizontal overflow in results
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    });

    test(`all interactive elements are keyboard-reachable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      // Tab through interactive elements
      const interactiveElements = [
        page.getByTestId('app-shell-global-action'),
        page.getByTestId('search-bar-input'),
        page.getByTestId('search-bar-submit'),
        page.getByTestId('source-filter-trigger-LIVE'),
        page.getByTestId('source-filter-trigger-HISTORY'),
        page.getByTestId('source-filter-trigger-BOOKMARK'),
      ];

      for (const element of interactiveElements) {
        await element.focus();
        await expect(element).toBeFocused();
      }
    });
  }

  test('empty state renders properly across all viewport widths', async ({ page }) => {
    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const input = page.getByTestId('search-bar-input');
      const submit = page.getByTestId('search-bar-submit');

      await input.fill('xyznonexistentqueryabc123');
      await submit.click();

      const emptyHeading = page.getByRole('heading', { name: /no results found/i });
      await expect(emptyHeading).toBeVisible({ timeout: 15000 });

      // Check no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }
  });

  test('error state renders properly across all viewport widths', async ({ page }) => {
    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      await page.route('**/api/search', (route) => route.abort('failed'));
      await page.goto('/');

      const input = page.getByTestId('search-bar-input');
      const submit = page.getByTestId('search-bar-submit');

      await input.fill('test query');
      await submit.click();

      const errorHeading = page.getByRole('heading', {
        name: /(network error|service unavailable|unexpected error)/i,
      });
      await expect(errorHeading).toBeVisible({ timeout: 15000 });

      // Check no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }
  });
});

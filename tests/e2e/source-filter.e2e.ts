/**
 * E2E tests for source filter bar (FR-003).
 * Per `.design/components/ui-shell.md` and STORY-019 scope.
 */
import { test, expect } from '@playwright/test';

test.describe('Source Filter Bar (FR-003)', () => {
  test('renders exactly three filters: LIVE, HISTORY, BOOKMARK with icons and labels', async ({
    page,
  }) => {
    await page.goto('/');

    const filterBar = page.getByTestId('source-filter-bar');
    await expect(filterBar).toBeVisible();

    // Check LIVE filter
    const liveTrigger = page.getByTestId('source-filter-trigger-LIVE');
    await expect(liveTrigger).toBeVisible();
    const liveIcon = page.getByTestId('source-filter-icon-LIVE');
    await expect(liveIcon).toBeVisible();
    const liveLabel = page.getByTestId('source-filter-label-LIVE');
    await expect(liveLabel).toHaveText('LIVE');

    // Check HISTORY filter
    const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
    await expect(historyTrigger).toBeVisible();
    const historyIcon = page.getByTestId('source-filter-icon-HISTORY');
    await expect(historyIcon).toBeVisible();
    const historyLabel = page.getByTestId('source-filter-label-HISTORY');
    await expect(historyLabel).toHaveText('HISTORY');

    // Check BOOKMARK filter
    const bookmarkTrigger = page.getByTestId('source-filter-trigger-BOOKMARK');
    await expect(bookmarkTrigger).toBeVisible();
    const bookmarkIcon = page.getByTestId('source-filter-icon-BOOKMARK');
    await expect(bookmarkIcon).toBeVisible();
    const bookmarkLabel = page.getByTestId('source-filter-label-BOOKMARK');
    await expect(bookmarkLabel).toHaveText('BOOKMARK');
  });

  test('selecting a filter changes the active state', async ({ page }) => {
    await page.goto('/');

    // Initially LIVE should be active
    const liveTrigger = page.getByTestId('source-filter-trigger-LIVE');
    await expect(liveTrigger).toHaveAttribute('data-state', 'active');

    // Click HISTORY
    const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
    await historyTrigger.click();

    // HISTORY should now be active
    await expect(historyTrigger).toHaveAttribute('data-state', 'active');
    await expect(liveTrigger).toHaveAttribute('data-state', 'inactive');

    // Click BOOKMARK
    const bookmarkTrigger = page.getByTestId('source-filter-trigger-BOOKMARK');
    await bookmarkTrigger.click();

    // BOOKMARK should now be active
    await expect(bookmarkTrigger).toHaveAttribute('data-state', 'active');
    await expect(historyTrigger).toHaveAttribute('data-state', 'inactive');
  });

  test('keyboard navigation works (arrow keys)', async ({ page }) => {
    await page.goto('/');

    const liveTrigger = page.getByTestId('source-filter-trigger-LIVE');
    const historyTrigger = page.getByTestId('source-filter-trigger-HISTORY');
    const bookmarkTrigger = page.getByTestId('source-filter-trigger-BOOKMARK');

    // Focus on LIVE
    await liveTrigger.focus();
    await expect(liveTrigger).toBeFocused();

    // Press right arrow to move to HISTORY
    await page.keyboard.press('ArrowRight');
    await expect(historyTrigger).toBeFocused();

    // Press right arrow to move to BOOKMARK
    await page.keyboard.press('ArrowRight');
    await expect(bookmarkTrigger).toBeFocused();

    // Press left arrow to move back to HISTORY
    await page.keyboard.press('ArrowLeft');
    await expect(historyTrigger).toBeFocused();
  });

  test('filters have visible focus rings', async ({ page }) => {
    await page.goto('/');

    const liveTrigger = page.getByTestId('source-filter-trigger-LIVE');
    await liveTrigger.focus();

    const hasFocusRing = await liveTrigger.evaluate((el) => {
      const styles = getComputedStyle(el);
      return styles.outline !== 'none' || styles.boxShadow.includes('ring');
    });
    expect(hasFocusRing).toBe(true);
  });

  test('filter bar wraps gracefully at 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');

    const filterBar = page.getByTestId('source-filter-bar');
    await expect(filterBar).toBeVisible();

    // Check no horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

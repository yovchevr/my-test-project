/**
 * E2E tests for the app shell (FR-001).
 * Per `.design/components/ui-shell.md` and STORY-019 scope.
 */
import { test, expect } from '@playwright/test';

test.describe('App Shell (FR-001)', () => {
  test('top bar is visible with product title and global action', async ({ page }) => {
    await page.goto('/');

    const topBar = page.getByTestId('app-shell-top-bar');
    await expect(topBar).toBeVisible();

    const title = page.getByTestId('app-shell-title');
    await expect(title).toBeVisible();
    await expect(title).toHaveText('neo-search');

    const action = page.getByTestId('app-shell-global-action');
    await expect(action).toBeVisible();
    await expect(action).toHaveText('Refresh');
  });

  test('top bar is sticky during scroll', async ({ page }) => {
    await page.goto('/');

    const topBar = page.getByTestId('app-shell-top-bar');
    await expect(topBar).toBeVisible();

    // Check computed position style includes sticky positioning
    const position = await topBar.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('sticky');

    // Scroll down and verify top bar remains visible
    await page.evaluate(() => window.scrollBy(0, 500));
    await expect(topBar).toBeVisible();
  });

  test('top bar renders consistently across viewport widths (NFR-001)', async ({ page }) => {
    const viewportWidths = [320, 375, 768, 1280, 1920];

    for (const width of viewportWidths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');

      const topBar = page.getByTestId('app-shell-top-bar');
      await expect(topBar).toBeVisible();

      const title = page.getByTestId('app-shell-title');
      await expect(title).toBeVisible();

      const action = page.getByTestId('app-shell-global-action');
      await expect(action).toBeVisible();

      // Assert height is consistent (3.5rem = 56px at default root font-size 16px)
      const box = await topBar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeCloseTo(56, 2);
    }
  });

  test('global action is keyboard accessible', async ({ page }) => {
    await page.goto('/');

    const action = page.getByTestId('app-shell-global-action');
    await action.focus();

    // Verify focus ring is visible
    const hasFocusRing = await action.evaluate((el) => {
      const styles = getComputedStyle(el);
      return styles.outline !== 'none' || styles.boxShadow.includes('ring');
    });
    expect(hasFocusRing).toBe(true);
  });
});

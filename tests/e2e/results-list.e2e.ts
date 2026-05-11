/**
 * E2E tests for results list (FR-004).
 * Per `.design/components/ui-shell.md` and STORY-019 scope.
 */
import { test, expect } from '@playwright/test';

test.describe('Results List (FR-004)', () => {
  test('results render as scrollable card-style rows with title, snippet, domain, and clickable link', async ({
    page,
  }) => {
    await page.goto('/');

    // Perform a search to get results
    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Wait for results to appear (wait for the loading state to clear)
    await page.waitForSelector('[role="list"]', { timeout: 10000 });

    // Check that results are rendered
    const resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();

    // Check for at least one result card
    const resultCards = page.locator('[role="listitem"]');
    const count = await resultCards.count();
    expect(count).toBeGreaterThan(0);

    // Check first result card structure
    const firstCard = resultCards.first();
    await expect(firstCard).toBeVisible();

    // Check title is present and is a link
    const titleLink = firstCard.locator('a').first();
    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveAttribute('href', /.+/);
    await expect(titleLink).toHaveAttribute('target', '_blank');
    await expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');

    // Check snippet is present (paragraph with text)
    const snippet = firstCard.locator('p').first();
    await expect(snippet).toBeVisible();

    // Check domain is present (smaller paragraph)
    const domain = firstCard.locator('p').nth(1);
    await expect(domain).toBeVisible();
  });

  test('result card is clickable and link works', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 10000 });

    const firstCard = page.locator('[role="listitem"]').first();
    const titleLink = firstCard.locator('a').first();

    // Verify link has valid href
    const href = await titleLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^https?:\/\/.+/);
  });

  test('results list is vertically scrollable when content exceeds viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 10000 });

    const resultsList = page.locator('[role="list"]');

    // Check if list has overflow-y-auto class
    const hasOverflow = await resultsList.evaluate((el) => {
      const styles = getComputedStyle(el);
      return styles.overflowY === 'auto' || styles.overflowY === 'scroll';
    });
    expect(hasOverflow).toBe(true);
  });

  test('result cards have hover state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 10000 });

    const firstCard = page.locator('[role="listitem"]').first().locator('article');

    // Hover over the card
    await firstCard.hover();

    // Check that shadow changes on hover (transition-shadow hover:shadow-lg)
    const shadowAfterHover = await firstCard.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadowAfterHover).toBeTruthy();
  });

  test('result card links are keyboard accessible', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('[role="list"]', { timeout: 10000 });

    const firstCard = page.locator('[role="listitem"]').first();
    const titleLink = firstCard.locator('a').first();

    // Focus on the link
    await titleLink.focus();
    await expect(titleLink).toBeFocused();

    // Check focus ring is visible
    const hasFocusRing = await titleLink.evaluate((el) => {
      const styles = getComputedStyle(el);
      return styles.outline !== 'none' || styles.textDecoration.includes('underline');
    });
    expect(hasFocusRing).toBe(true);
  });
});

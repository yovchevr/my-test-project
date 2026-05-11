/**
 * E2E tests for empty and error states (FR-005).
 * Per `.design/components/ui-shell.md` and STORY-019 scope.
 */
import { test, expect } from '@playwright/test';

test.describe('Empty and Error States (FR-005)', () => {
  test('zero-result query shows empty state', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    // Use a query that's likely to return zero results (or mock the response)
    await input.fill('xyznonexistentqueryabc123');
    await submit.click();

    // Wait for response and check for empty state
    // Empty state should have the "No results found" heading
    const emptyHeading = page.getByRole('heading', { name: /no results found/i });
    await expect(emptyHeading).toBeVisible({ timeout: 15000 });

    // Check the description text
    const emptyText = page.getByText(/no results for that query/i);
    await expect(emptyText).toBeVisible();

    // Check the search icon is present
    const emptyIcon = page.locator('svg').filter({ hasText: '' }).first();
    await expect(emptyIcon).toBeVisible();
  });

  test('empty state follows visual system with card styling', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('xyznonexistentqueryabc123');
    await submit.click();

    await page.waitForSelector('h2:has-text("No results found")', { timeout: 15000 });

    // Check that empty state has card-like styling (rounded, shadow)
    const emptyContainer = page.locator('div').filter({ hasText: 'No results found' }).first();
    const classes = await emptyContainer.getAttribute('class');
    expect(classes).toContain('rounded');
    expect(classes).toContain('shadow');
  });

  test('error state is shown on network failure', async ({ page }) => {
    // Mock a network failure by blocking the API endpoint
    await page.route('**/api/search', (route) => route.abort('failed'));

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    // Wait for error state
    const errorHeading = page.getByRole('heading', {
      name: /(network error|service unavailable|unexpected error)/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 15000 });

    // Check the error message is present
    const errorText = page.getByText(/(network error|service|try again)/i);
    await expect(errorText).toBeVisible();

    // Check the error icon is present (red warning icon)
    const errorIcon = page.locator('svg.text-red-500').first();
    await expect(errorIcon).toBeVisible();
  });

  test('error state is distinct from empty state', async ({ page }) => {
    // First test empty state
    await page.goto('/');
    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('xyznonexistentqueryabc123');
    await submit.click();

    const emptyHeading = page.getByRole('heading', { name: /no results found/i });
    await expect(emptyHeading).toBeVisible({ timeout: 15000 });

    // Now test error state on a fresh navigation
    await page.goto('/');
    await page.route('**/api/search', (route) => route.abort('failed'));

    await input.fill('test query');
    await submit.click();

    const errorHeading = page.getByRole('heading', {
      name: /(network error|service unavailable|unexpected error)/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 15000 });

    // Error state should NOT show "No results found"
    const noEmptyHeading = page.getByRole('heading', { name: /no results found/i });
    await expect(noEmptyHeading).not.toBeVisible();
  });

  test('error state follows visual system with card styling', async ({ page }) => {
    await page.route('**/api/search', (route) => route.abort('failed'));

    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('test query');
    await submit.click();

    await page.waitForSelector('h2', { timeout: 15000 });

    // Check that error state has card-like styling (rounded, shadow)
    const errorContainer = page
      .locator('div')
      .filter({ has: page.locator('svg.text-red-500') })
      .first();
    const classes = await errorContainer.getAttribute('class');
    expect(classes).toContain('rounded');
    expect(classes).toContain('shadow');
  });
});

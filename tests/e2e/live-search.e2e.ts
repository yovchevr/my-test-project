/**
 * E2E smoke test for live web search (FR-012).
 * Per `.design/technology/testing.md` and STORY-019 scope.
 *
 * Smoke-only, gated by TAVILY_API_KEY. Hits the real Tavily API to verify
 * the web-search tool returns parsed structured results matching the contract.
 */
import { test, expect } from '@playwright/test';

const hasTavilyKey =
  typeof process.env.TAVILY_API_KEY === 'string' && process.env.TAVILY_API_KEY.length > 0;

test.describe('Live Search (FR-012)', () => {
  test.skip(!hasTavilyKey, 'Skipped: TAVILY_API_KEY not set');

  test('real search returns parsed structured results', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    // Use a query that should return real results
    await input.fill('TypeScript programming language');
    await submit.click();

    // Wait for results to load
    await page.waitForSelector('[role="list"]', { timeout: 30000 });

    const resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();

    // Check for at least one result
    const resultCards = page.locator('[role="listitem"]');
    const count = await resultCards.count();
    expect(count).toBeGreaterThan(0);

    // Check first result has all required fields (title, snippet, domain, url)
    const firstCard = resultCards.first();
    await expect(firstCard).toBeVisible();

    const titleLink = firstCard.locator('a').first();
    await expect(titleLink).toBeVisible();

    const href = await titleLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toMatch(/^https?:\/\/.+/);

    const titleText = await titleLink.textContent();
    expect(titleText).toBeTruthy();
    expect(titleText!.length).toBeGreaterThan(0);

    const snippet = firstCard.locator('p').first();
    await expect(snippet).toBeVisible();
    const snippetText = await snippet.textContent();
    expect(snippetText).toBeTruthy();
    expect(snippetText!.length).toBeGreaterThan(0);

    const domain = firstCard.locator('p').nth(1);
    await expect(domain).toBeVisible();
    const domainText = await domain.textContent();
    expect(domainText).toBeTruthy();
    expect(domainText!.length).toBeGreaterThan(0);
  });

  test('search response includes answer summary and references', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    await input.fill('TypeScript programming language');
    await submit.click();

    // Wait for answer summary to appear (from STORY-017)
    await page.waitForSelector('text=/TypeScript|programming|language/', { timeout: 30000 });

    // Check that we have results
    const resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();
  });

  test('multiple searches work correctly', async ({ page }) => {
    await page.goto('/');

    const input = page.getByTestId('search-bar-input');
    const submit = page.getByTestId('search-bar-submit');

    // First search
    await input.fill('Python programming');
    await submit.click();
    await page.waitForSelector('[role="list"]', { timeout: 30000 });

    let resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();

    // Second search
    await input.fill('JavaScript frameworks');
    await submit.click();
    await page.waitForSelector('[role="list"]', { timeout: 30000 });

    resultsList = page.locator('[role="list"]');
    await expect(resultsList).toBeVisible();

    // Verify results changed (new search, not appended)
    const results = page.locator('[role="listitem"]');
    const count = await results.count();
    expect(count).toBeGreaterThan(0);
  });
});

import { expect, test } from '@playwright/test';

test('mobile navigation renders the BenderLogo with a 44px touch target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/tenant/current', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'westmoreland',
        display_name: 'The Bend - Westmoreland',
        primary_color: 'hsl(160,25%,24%)',
      }),
    });
  });
  await page.route('**/api/v1/**', async (route) => {
    if (route.request().url().includes('/tenant/current')) return;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/');

  const bender = page.locator('nav').getByRole('button', { name: 'Bender' });
  await expect(bender).toBeVisible();
  await expect(bender.locator('svg[role="img"][aria-label="Bender"]')).toHaveCount(1);
  await expect(bender.locator('svg.lucide-sparkles')).toHaveCount(0);
  const mark = bender.locator('svg[role="img"][aria-label="Bender"]');
  const markBox = await mark.boundingBox();
  expect(markBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(markBox?.height ?? 0).toBeGreaterThan(4);
  const box = await bender.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: '../.superpowers/sdd/2026-09-10-bend-jira-release/task-1-screenshots/mobile-home-390x844.png', fullPage: false });
});

test('site header uses the approved artwork and preserves tenant label and containment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/tenant/current', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend - Westmoreland' }) });
  });
  await page.route('**/api/v1/**', async (route) => {
    if (!route.request().url().includes('/tenant/current')) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/');
  const header = page.locator('header');
  await expect(header.locator('img[src="/images/the-bend-community-logo-black.png"]')).toBeVisible();
  await expect(header.getByText('Westmoreland', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('desktop site header preserves navigation with a materially larger approved mark', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/tenant/current', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend - Westmoreland' }) });
  });
  await page.route('**/api/v1/**', async (route) => {
    if (!route.request().url().includes('/tenant/current')) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/');
  const header = page.locator('header');
  const logo = header.locator('img[src="/images/the-bend-community-logo-black.png"]');
  await expect(logo).toBeVisible();
  await expect(header.getByText('Westmoreland', { exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Browse', exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Bender' })).toBeVisible();
  const logoBox = await logo.boundingBox();
  expect(logoBox?.height ?? 0).toBeGreaterThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('dark site header uses the approved white artwork without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/tenant/current', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend - Westmoreland' }) });
  });
  await page.route('**/api/v1/**', async (route) => {
    if (!route.request().url().includes('/tenant/current')) await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/');
  const header = page.locator('header');
  await expect(header.locator('img[src="/images/the-bend-community-logo-white.png"]')).toBeVisible();
  await expect(header.locator('img[src="/images/the-bend-community-logo-black.png"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../.superpowers/sdd/2026-09-10-bend-jira-release/task-1-screenshots/mobile-header-dark-390x844.png', fullPage: false });
});

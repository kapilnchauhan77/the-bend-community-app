import { expect, test, type Page } from '@playwright/test';


const planMatrix = [
  ['homepage', 'Homepage Feature', 30, 10000],
  ['homepage', 'Homepage Feature', 60, 18000],
  ['homepage', 'Homepage Feature', 90, 24000],
  ['footer', 'Footer Partners', 30, 6000],
  ['footer', 'Footer Partners', 60, 10800],
  ['footer', 'Footer Partners', 90, 14400],
  ['events', 'Events Page', 30, 8000],
  ['events', 'Events Page', 60, 14400],
  ['events', 'Events Page', 90, 19200],
  ['browse', 'Browse Page', 30, 8000],
  ['browse', 'Browse Page', 60, 14400],
  ['browse', 'Browse Page', 90, 19200],
] as const;


async function stubPricingApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = route.request().url();
    if (requestUrl.includes('/tenant/current')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'westmoreland',
          display_name: 'The Bend — Westmoreland',
          primary_color: 'hsl(160,25%,24%)',
        }),
      });
      return;
    }
    if (requestUrl.includes('/advertising/pricing')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: planMatrix.map(([placement, name, durationDays, priceCents], index) => ({
            id: `plan-${index + 1}`,
            name,
            description: `${durationDays}-day ${placement} sponsorship`,
            placement,
            duration_days: durationDays,
            price_cents: priceCents,
          })),
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}


test('Westmoreland sponsor packages display whole-dollar prices without cents', async ({ page }) => {
  await stubPricingApi(page);
  await page.goto('/advertise');

  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(12);
  await expect(page.getByText('$100', { exact: true })).toBeVisible();
  await expect(page.getByText('$180', { exact: true })).toBeVisible();
  await expect(page.getByText('$240', { exact: true })).toBeVisible();
  await expect(page.getByText('$108', { exact: true })).toBeVisible();
  await expect(page.getByText('$144', { exact: true })).toHaveCount(3);
  await expect(page.getByText('$192', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/\$\d+\.00/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Select', exact: true }).first().click();
  await expect(page.getByText('$100', { exact: true })).toBeVisible();
  await expect(page.getByText('$100.00', { exact: true })).toHaveCount(0);
});

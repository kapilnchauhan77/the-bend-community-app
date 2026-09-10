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

test('advertising selection includes the non-checkout Max option', async ({ page }) => {
  const postRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') postRequests.push(request.url());
  });
  await stubPricingApi(page);
  await page.goto('/advertise');

  await expect(page.getByRole('heading', { name: 'Max', exact: true })).toBeVisible();
  await expect(page.getByText('Custom pricing', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Make with BEND', exact: true })).toHaveAttribute('href', '/make-with-bend');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Get Started', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Make with BEND', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make with BEND', exact: true })).toBeVisible();
  expect(postRequests).toEqual([]);
});

test('Max card stays readable and contained in app dark mode on mobile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await stubPricingApi(page);
  await page.goto('/advertise');

  const heading = page.getByRole('heading', { name: 'Max', exact: true });
  const card = heading.locator('..');
  const link = page.getByRole('link', { name: 'Make with BEND', exact: true });
  await expect(heading).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const contrastRatio = await card.evaluate((element) => {
    const parseRgb = (value: string) => value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const relativeLuminance = (value: string) => {
      const [red, green, blue] = parseRgb(value).map((channel) => channel / 255);
      return [red, green, blue].map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const background = getComputedStyle(element).backgroundColor;
    const text = getComputedStyle(element.querySelector('p.text-gray-700') as HTMLElement).color;
    const backgroundLuminance = relativeLuminance(background);
    const textLuminance = relativeLuminance(text);
    return (Math.max(backgroundLuminance, textLuminance) + 0.05) / (Math.min(backgroundLuminance, textLuminance) + 0.05);
  });
  expect(contrastRatio).toBeGreaterThanOrEqual(4.5);

  await link.focus();
  await expect(link).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: testInfo.outputPath('max-card-dark-mobile.png'), fullPage: true });
});

test('advertising example features ProLine instead of Provoke', async ({ page }) => {
  await stubPricingApi(page);
  await page.goto('/advertise');

  await expect(page.getByRole('heading', { name: 'ProLine Group' })).toBeVisible();
  await expect(page.getByText('Provoke', { exact: true })).toHaveCount(0);
});

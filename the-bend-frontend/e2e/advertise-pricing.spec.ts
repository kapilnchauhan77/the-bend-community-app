import { expect, test, type Page } from '@playwright/test';


const planMatrix = [
  ['homepage', 'Homepage Feature', 30, 10000, 'plan-1'],
  ['homepage', 'Homepage Feature', 60, 18000, 'plan-2'],
  ['homepage', 'Homepage Feature', 90, 24000, 'plan-3'],
  ['footer', 'Footer Partners', 30, 6000, 'plan-4'],
  ['footer', 'Footer Partners', 60, 10800, 'plan-5'],
  ['footer', 'Footer Partners', 90, 14400, 'plan-6'],
  ['events', 'Events Page', 30, 8000, 'plan-7'],
  ['events', 'Events Page', 60, 14400, 'plan-8'],
  ['events', 'Events Page', 90, 19200, 'plan-9'],
  ['browse', 'Browse Page', 30, 8000, 'plan-10'],
  ['browse', 'Browse Page', 60, 14400, 'plan-11'],
  ['browse', 'Browse Page', 90, 19200, 'plan-12'],
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
          items: planMatrix.map(([placement, name, durationDays, priceCents, id]) => ({
            id,
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

  await expect(page.locator('[data-pricing-card]')).toHaveCount(4);
  await expect(page.getByRole('combobox')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(4);
  await expect(page.getByText('Placement:', { exact: true })).toHaveCount(0);
  await expect(page.getByText('$100', { exact: true })).toBeVisible();
  await expect(page.locator('[data-pricing-card="homepage"] option')).toHaveText(['30 days', '60 days', '90 days']);
  await expect(page.locator('[data-pricing-card="footer"] option')).toHaveText(['30 days', '60 days', '90 days']);
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

  await expect(page.getByRole('heading', { name: 'Max · Build with BEND', exact: true })).toBeVisible();
  await expect(page.getByText('Turn your business idea into a working product with the team behind The Bend. From reservation systems to custom apps, we’ll help you build it.', { exact: true })).toBeVisible();
  await expect(page.getByText('Hosting, support, and third-party costs are quoted separately.', { exact: true })).toBeVisible();
  await expect(page.getByText('Custom pricing', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Make with BEND', exact: true })).toHaveAttribute('href', '/make-with-bend');
  await expect(page.getByRole('button', { name: 'Select', exact: true })).toHaveCount(4);
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

  const heading = page.getByRole('heading', { name: 'Max · Build with BEND', exact: true });
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

  const ctaContrastRatio = await link.evaluate((element) => {
    const parseRgb = (value: string) => value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const luminance = (value: string) => parseRgb(value).slice(0, 3).map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(element).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(ctaContrastRatio).toBeGreaterThanOrEqual(4.5);

  await link.focus();
  await expect(link).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: testInfo.outputPath('max-card-dark-mobile.png'), fullPage: true });
});

test('Max card light-mode text and CTA colors meet WCAG AA contrast', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await stubPricingApi(page);
  await page.goto('/advertise');
  const values = await page.locator('[data-advertise-max-card]').evaluate((card) => {
    const relativeLuminance = (value: string) => {
      const [r, g, b] = value.match(/\d+(?:\.\d+)?/g)!.map(Number).map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (foreground: string, background: string) => {
      const a = relativeLuminance(foreground);
      const b = relativeLuminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const accent = card.querySelector('[data-advertise-max-accent]')!;
    const body = card.querySelector('[data-advertise-max-body]')!;
    const cta = card.querySelector('[data-advertise-max-cta]')!;
    return {
      accent: contrast(getComputedStyle(accent).color, getComputedStyle(card).backgroundColor),
      body: contrast(getComputedStyle(body).color, getComputedStyle(card).backgroundColor),
      cta: contrast(getComputedStyle(cta).color, getComputedStyle(cta).backgroundColor),
    };
  });
  expect(values.accent).toBeGreaterThanOrEqual(4.5);
  expect(values.body).toBeGreaterThanOrEqual(4.5);
  expect(values.cta).toBeGreaterThanOrEqual(4.5);
});

test('placement cards default to 30 days and display each placement record', async ({ page }) => {
  await stubPricingApi(page);
  await page.goto('/advertise');

  const expected = [
    ['homepage', 'Homepage Feature', 'Feature your business on the community homepage.', '$100', 'plan-1'],
    ['footer', 'Footer Partners', 'Show your business in the partner strip on every page.', '$60', 'plan-4'],
    ['events', 'Events Page', 'Reach people exploring local events.', '$80', 'plan-7'],
    ['browse', 'Browse Page', 'Reach people browsing community listings.', '$80', 'plan-10'],
  ] as const;
  for (const [placement, title, description, price, planId] of expected) {
    const card = page.locator(`[data-pricing-card="${placement}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(card.getByText(description, { exact: true })).toBeVisible();
    await expect(card.getByText(price, { exact: true })).toBeVisible();
    await expect(card.getByRole('combobox')).toHaveValue(planId);
    await expect(card.getByRole('combobox')).toHaveAccessibleName(`${title} duration`);
    await card.getByRole('combobox').focus();
    await expect(card.getByRole('combobox')).toHaveCSS('outline-style', 'solid');
    await expect(card.locator('[data-pricing-price]')).toHaveAttribute('aria-live', 'polite');
  }

  const homepage = page.locator('[data-pricing-card="homepage"]');
  await homepage.getByRole('combobox').selectOption('plan-3');
  await expect(homepage.getByText('$240', { exact: true })).toBeVisible();
  await expect(homepage.getByText('Feature your business on the community homepage.', { exact: true })).toBeVisible();
  await expect(homepage.getByRole('combobox')).toHaveValue('plan-3');
  await expect(homepage.getByRole('combobox')).toHaveAccessibleName('Homepage Feature duration');
});

test('placement cards meet responsive layout, control size, and light/dark contrast contracts', async ({ page }) => {
  await stubPricingApi(page);
  const contrast = async (locator: ReturnType<Page['locator']>) => locator.evaluate((element) => {
    const rgb = getComputedStyle(element).color.match(/\d+(?:\.\d+)?/g)!.map(Number).map((channel) => channel / 255);
    const style = getComputedStyle(element);
    const backgroundColor = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(element.closest('[data-pricing-card]') || element).backgroundColor : style.backgroundColor;
    const bg = backgroundColor.match(/\d+(?:\.\d+)?/g)!.map(Number).map((channel) => channel / 255);
    const lum = (values: number[]) => values.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    return (Math.max(lum(rgb), lum(bg)) + 0.05) / (Math.min(lum(rgb), lum(bg)) + 0.05);
  });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 800 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/advertise');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cards = page.locator('[data-pricing-card]');
    const widths = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
    if (viewport.width === 1280) expect(widths.every((width) => width > 400)).toBe(true);
    else expect(widths.every((width) => width <= 320)).toBe(true);
    for (const card of await cards.all()) {
      await expect(card.getByRole('combobox')).toHaveCSS('min-height', '44px');
      await expect(card.getByRole('button', { name: 'Select', exact: true })).toHaveCSS('min-height', '44px');
      expect(await contrast(card.locator('[data-pricing-description]'))).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(card.locator('[data-pricing-price]'))).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(card.getByRole('combobox'))).toBeGreaterThanOrEqual(4.5);
      expect(await contrast(card.getByRole('button', { name: 'Select', exact: true }))).toBeGreaterThanOrEqual(4.5);
    }
  }
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/advertise');
  const darkCard = page.locator('[data-pricing-card]').first();
  expect(await contrast(darkCard.locator('[data-pricing-description]'))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(darkCard.locator('[data-pricing-price]'))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(darkCard.getByRole('combobox'))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(darkCard.getByRole('button', { name: 'Select', exact: true }))).toBeGreaterThanOrEqual(4.5);
});

test('checkout submits the selected pricing record ID', async ({ page }) => {
  await stubPricingApi(page);
  let checkoutBody: Record<string, unknown> | undefined;
  await page.route('**/api/v1/advertising/checkout', async (route) => {
    checkoutBody = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: {} }) });
  });
  await page.goto('/advertise');
  const card = page.locator('[data-pricing-card="events"]');
  await card.getByRole('combobox').selectOption('plan-9');
  await card.getByRole('button', { name: 'Select', exact: true }).click();
  await page.getByPlaceholder('Jane Smith').fill('Jane Smith');
  await page.getByPlaceholder('jane@example.com').fill('jane@example.com');
  await page.getByPlaceholder('My Business Name').fill('Jane Business');
  await page.getByRole('button', { name: 'Proceed to Payment', exact: true }).click();
  await expect.poll(() => checkoutBody).toMatchObject({ pricing_id: 'plan-9', name: 'Jane Business' });
});

test('placement without a 30-day record defaults to its earliest duration', async ({ page }) => {
  await page.route('**/api/v1/tenant/current', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend — Westmoreland', primary_color: 'hsl(160,25%,24%)' }) });
  });
  await page.route('**/api/v1/advertising/pricing', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [
      { id: 'homepage-60', name: 'Homepage Feature', description: '60-day homepage sponsorship', placement: 'homepage', duration_days: 60, price_cents: 18000 },
      { id: 'homepage-90', name: 'Homepage Feature', description: '90-day homepage sponsorship', placement: 'homepage', duration_days: 90, price_cents: 24000 },
    ] }) });
  });
  await page.route('**/api/v1/**', async (route) => {
    if (route.request().url().includes('/tenant/current') || route.request().url().includes('/advertising/pricing')) return route.fallback();
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/advertise');
  const card = page.locator('[data-pricing-card]');
  await expect(card.getByRole('combobox')).toHaveValue('homepage-60');
  await expect(card.getByRole('combobox').locator('option')).toHaveText(['60 days', '90 days']);
  await expect(card.getByText('$180', { exact: true })).toBeVisible();
});

test('advertising example features ProLine instead of Provoke', async ({ page }) => {
  await stubPricingApi(page);
  await page.goto('/advertise');

  await expect(page.getByRole('heading', { name: 'ProLine Group' })).toBeVisible();
  await expect(page.getByText('Provoke', { exact: true })).toHaveCount(0);
});

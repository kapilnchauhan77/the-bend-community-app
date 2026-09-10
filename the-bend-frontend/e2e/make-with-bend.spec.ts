import { test, expect } from '@playwright/test';

const tenant = {
  slug: 'westmoreland',
  display_name: 'The Bend — Westmoreland',
  tagline: 'Find opportunity within your neighborhood',
  about_text: null,
  hero_image_url: '/images/the-bend-hero.jpg',
  logo_url: null,
  primary_color: 'hsl(160,25%,24%)',
  footer_text: 'Preserving community, one connection at a time',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'GET' && pathname === '/api/v1/tenant/current') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(tenant) });
    }
    if (request.method() === 'GET' && pathname === '/api/v1/sponsors') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
    }
    throw new Error(`Unexpected Bend API request: ${request.method()} ${request.url()}`);
  });
});

async function loadPortfolioImages(page: import('@playwright/test').Page) {
  const images = page.locator('img[src^="/images/max-portfolio/"]');
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((el) => [el.naturalWidth, el.naturalHeight])).toEqual([1280, 720]);
  }
}

test('renders the offering and approved portfolio', async ({ page }) => {
  await page.goto('/make-with-bend');
  await expect(page.getByRole('heading', { name: 'Make with BEND', exact: true })).toBeVisible();
  await expect(page.getByText('Custom pricing', { exact: true })).toBeVisible();
  const offerExplanation = page.getByRole('heading', { name: 'A lasting product, quoted separately', exact: true });
  await expect(offerExplanation).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What we can build', exact: true })).toBeVisible();
  const sectionHeadings = page.locator('main h2');
  await expect(sectionHeadings).toHaveText(['A lasting product, quoted separately', 'What we can build', 'Selected work', 'How it works', 'Have an idea?']);

  for (const name of [
    'Restaurant reservations', 'Marina and park live cameras', 'Service price calculators',
    'Live gas station prices', 'Newspaper feeds', 'Video review creator',
  ]) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  await expect(page.getByText(/does not expire like an ad placement/i)).toBeVisible();
  await expect(page.getByText(/hosting, maintenance, support, third-party/i)).toBeVisible();
  await expect(page.getByText(/work with the creators of The Bend/i)).toBeVisible();

  const groups = page.locator('[data-portfolio-group]');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('Community and hospitality');
  await expect(groups.nth(0)).toContainText('The Bend');
  await expect(groups.nth(0)).toContainText('Authentica');
  await expect(groups.nth(0)).toContainText('Aroma');
  await expect(groups.nth(1)).toContainText('Platforms and applied AI');
  await expect(groups.nth(1)).toContainText('Provoke');
  await expect(groups.nth(1)).toContainText('Law study platform');

  const publishedProjects = [
    ['The Bend', '/images/max-portfolio/bend-community.jpg'],
    ['Provoke', '/images/max-portfolio/provoke-space.jpg'],
    ['Authentica', '/images/max-portfolio/authentica.jpg'],
    ['Aroma', '/images/max-portfolio/aroma.jpg'],
    ['Law study platform', '/images/max-portfolio/acil-law.jpg'],
  ] as const;
  for (const [name, src] of publishedProjects) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    const image = page.locator(`img[src="${src}"]`);
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('width', '1280');
    await expect(image).toHaveAttribute('height', '720');
    await expect(image).toHaveAttribute('alt', /.+/);
    await expect.poll(() => image.evaluate((el) => [el.naturalWidth, el.naturalHeight])).toEqual([1280, 720]);
  }
  for (const name of ['Taco Mexicana', 'Procys Identity Verification', 'Inperio AMIE', 'Arogya Health']) {
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
  }
});

test('provides compose links without POST requests', async ({ page }) => {
  const postRequests: string[] = [];
  page.on('request', (request) => { if (request.method() === 'POST') postRequests.push(request.url()); });
  await page.goto('/make-with-bend');

  const recipients = ['Jd.darr@proline-online.com', 'kapilnchauhan77@gmail.com'];
  const gmailLink = page.getByRole('link', { name: 'Tell us your idea', exact: true });
  const gmail = new URL(await gmailLink.getAttribute('href') ?? '');
  expect(gmail.origin).toBe('https://mail.google.com');
  expect(gmail.pathname).toBe('/mail/');
  expect(gmail.searchParams.get('view')).toBe('cm');
  expect(gmail.searchParams.get('fs')).toBe('1');
  expect(gmail.searchParams.get('to')?.split(',')).toEqual(recipients);
  expect(gmail.searchParams.get('su')).toBe('Make with BEND: My idea');
  await expect(gmailLink).toHaveAttribute('target', '_blank');
  await expect(gmailLink).toHaveAttribute('rel', /noopener/);
  await expect(gmailLink).toHaveAttribute('rel', /noreferrer/);

  const fallback = new URL(await page.getByRole('link', { name: 'Use another email app', exact: true }).getAttribute('href') ?? 'mailto:');
  expect(fallback.protocol).toBe('mailto:');
  expect(fallback.pathname.split(',')).toEqual(recipients);
  expect(fallback.searchParams.get('subject')).toBe('Make with BEND: My idea');
  await gmailLink.focus();
  await page.getByRole('link', { name: 'Use another email app', exact: true }).focus();
  expect(postRequests).toEqual([]);
});

for (const [name, colorScheme, width, height] of [
  ['desktop light', 'light', 1440, 900], ['mobile light', 'light', 390, 844], ['mobile dark', 'dark', 390, 844],
] as const) {
  test(`${name} stays contained and keyboard accessible`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme });
    if (colorScheme === 'dark') await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/make-with-bend');
    if (colorScheme === 'dark') await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('main').getByRole('img', { name: 'The Bend Community', exact: true })).toBeVisible();
    const heading = page.getByRole('heading', { name: 'Make with BEND', exact: true });
    const cta = page.getByRole('link', { name: 'Tell us your idea', exact: true });
    await expect(heading).toBeVisible();
    await expect(cta).toBeVisible();
    await cta.focus();
    await expect(cta).toHaveCSS('outline-style', 'solid');
    await loadPortfolioImages(page);
    await page.screenshot({ path: `../.superpowers/sdd/2026-09-10-max-make-with-bend/${name.replaceAll(' ', '-')}.png`, fullPage: true });
  });
}

for (const [name, osScheme, appScheme, expectedColor] of [
  ['OS dark, app light', 'dark', 'light', 'rgb(46, 77, 66)'],
  ['OS light, app dark', 'light', 'dark', 'rgb(229, 226, 220)'],
] as const) {
  test(`${name} keeps heading contrast`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: osScheme });
    await page.addInitScript((theme) => localStorage.setItem('theme', theme), appScheme);
    await page.goto('/make-with-bend');
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(appScheme === 'dark');
    await expect(page.getByRole('heading', { name: 'What we can build', exact: true })).toHaveCSS('color', expectedColor);
  });
}

test('theme toggle updates app dark mode and restores light mode', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/make-with-bend');
  const heading = page.getByRole('heading', { name: 'What we can build', exact: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
  await expect(heading).toHaveCSS('color', 'rgb(46, 77, 66)');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  await expect(heading).toHaveCSS('color', 'rgb(229, 226, 220)');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(false);
  await expect(heading).toHaveCSS('color', 'rgb(46, 77, 66)');
});

test('new light-mode text and CTA colors meet WCAG AA contrast', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'));
  await page.goto('/make-with-bend');
  const ratios = await page.evaluate(() => {
    const relativeLuminance = (value: string) => {
      const [r, g, b] = value.match(/\d+(?:\.\d+)?/g)!.map(Number).map((channel) => channel / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (foreground: string, background: string) => {
      const foregroundLuminance = relativeLuminance(foreground);
      const backgroundLuminance = relativeLuminance(background);
      return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
    };
    const css = (selector: string) => getComputedStyle(document.querySelector(selector)!).color;
    const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
    return {
      pageAccent: contrast(css('[data-max-accent]'), 'rgb(255, 255, 255)'),
      dependency: contrast(css('[data-max-dependency]'), 'rgb(251, 250, 248)'),
      offerBody: contrast(css('[data-max-offer-body]'), 'rgb(255, 255, 255)'),
      cta: contrast(css('[data-max-cta]'), background('[data-max-cta]')),
    };
  });
  expect(ratios.pageAccent).toBeGreaterThanOrEqual(4.5);
  expect(ratios.dependency).toBeGreaterThanOrEqual(4.5);
  expect(ratios.offerBody).toBeGreaterThanOrEqual(4.5);
  expect(ratios.cta).toBeGreaterThanOrEqual(4.5);
});

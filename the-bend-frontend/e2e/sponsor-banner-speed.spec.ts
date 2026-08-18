import { expect, test, type Page } from '@playwright/test';

async function stubHomeApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const requestUrl = route.request().url();

    if (requestUrl.includes('/tenant/current')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'westmoreland',
          display_name: 'The Bend — Westmoreland',
          tagline: 'Find opportunity within your neighborhood',
          primary_color: 'hsl(160,25%,24%)',
          footer_text: 'Preserving community, one connection at a time',
        }),
      });
      return;
    }

    if (requestUrl.includes('/sponsors')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'sponsor-1',
              name: 'Partner One',
              description: 'First community partner',
              logo_url:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              website_url: 'https://partner-one.example',
              placement: 'homepage',
            },
            {
              id: 'sponsor-2',
              name: 'Partner Two',
              description: 'Second community partner',
              website_url: 'https://partner-two.example',
              placement: 'homepage',
            },
          ],
        }),
      });
      return;
    }

    if (requestUrl.includes('/stats')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          active_shops: 0,
          active_listings: 0,
          items_shared: 0,
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

test('horizontal sponsor banner completes a two-partner loop in six seconds', async ({ page }) => {
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveCSS('animation-duration', '6s');

  const partnerLogo = marquee.getByRole('img', { name: 'Partner One' }).first();
  await expect(partnerLogo).toBeVisible();
  await expect.poll(() => partnerLogo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test('horizontal sponsor banner is static when reduced motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveCSS('animation-name', 'none');
});

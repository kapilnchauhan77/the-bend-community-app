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
              name: 'Printify',
              description: 'Partner immediately before ProLine',
              website_url: 'https://printify.example',
              placement: 'homepage',
            },
            {
              id: 'sponsor-3',
              name: 'ProLine Group',
              description: 'Featured community partner',
              website_url: 'https://proline.example',
              placement: 'homepage',
            },
            {
              id: 'sponsor-4',
              name: 'Last Partner',
              description: 'Final partner before the reel repeats',
              website_url: 'https://last-partner.example',
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

test('horizontal sponsor banner uses three seconds per partner', async ({ page }) => {
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveCSS('animation-duration', '12s');

  const partnerLogo = marquee.getByRole('img', { name: 'Partner One' }).first();
  await expect(partnerLogo).toBeVisible();
  await expect.poll(() => partnerLogo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test('horizontal sponsor reel traverses every partner before repeating', async ({ page }) => {
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  const groups = marquee.locator(':scope > .sponsor-marquee-group');
  await expect(groups).toHaveCount(2);

  const sponsorNames = async (groupIndex: number) => groups.nth(groupIndex).locator('a').evaluateAll(
    links => links.map(link => link.querySelector('p')?.textContent?.trim()),
  );
  const expectedOrder = ['Partner One', 'Printify', 'ProLine Group', 'Last Partner'];
  expect(await sponsorNames(0)).toEqual(expectedOrder);
  expect(await sponsorNames(1)).toEqual(expectedOrder);
  await expect(groups.nth(1)).toHaveAttribute('aria-hidden', 'true');

  const travel = await marquee.evaluate((element) => {
    const group = element.querySelector<HTMLElement>('.sponsor-marquee-group');
    const animation = element.getAnimations()[0];
    if (!group || !animation) throw new Error('Sponsor reel is missing its group or animation');

    animation.pause();
    const duration = Number(animation.effect?.getTiming().duration);
    animation.currentTime = duration * 0.999;

    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    const gap = Number.parseFloat(getComputedStyle(element).columnGap);
    return {
      actual: Math.abs(transform.m41),
      expected: group.getBoundingClientRect().width + gap,
      contentWidth: element.scrollWidth,
      trackWidth: element.getBoundingClientRect().width,
    };
  });

  expect(travel.trackWidth).toBeGreaterThan(1000);
  expect(Math.abs(travel.trackWidth - travel.contentWidth)).toBeLessThan(1);
  expect(Math.abs(travel.actual - travel.expected)).toBeLessThan(5);
});

test('horizontal sponsor reel keeps moving while the pointer is over it', async ({ page }) => {
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  const point = await marquee.evaluate((element) => {
    const viewport = element.parentElement;
    if (!viewport) throw new Error('Sponsor reel is missing its viewport');
    viewport.scrollIntoView({ block: 'center' });
    const rect = viewport.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(point.x, point.y);

  await expect.poll(() => marquee.evaluate(element => element.matches(':hover'))).toBe(true);
  await expect(marquee).toHaveCSS('animation-play-state', 'running');
});

test('horizontal sponsor reel pauses while a keyboard user selects a partner', async ({ page }) => {
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  await marquee.locator('.sponsor-marquee-group').first().getByRole('link').first().focus();

  await expect(marquee).toHaveCSS('animation-play-state', 'paused');
});

test('horizontal sponsor banner is static when reduced motion is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubHomeApi(page);
  await page.goto('/');

  const marquee = page.locator('.sponsor-marquee');
  await expect(marquee).toBeVisible();
  await expect(marquee).toHaveCSS('animation-name', 'none');
});

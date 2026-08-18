import { expect, test, type Page } from '@playwright/test';

const prestigeEmail = 'prestigedesignstudio85@gmail.com';
const viewports = [
  { name: 'desktop', width: 1024, height: 768 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function stubAdminApi(page: Page) {
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

    if (requestUrl.includes('/admin/shops')) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 'shop-1',
              name: 'Prestige Design Studio',
              business_type: 'professional_services',
              admin_name: 'NaTasha Ashton',
              admin_email: prestigeEmail,
              status: 'active',
              listing_count: 1,
              created_at: '2026-08-17T10:00:00Z',
              address: '1104 Kinsale Rd',
            },
          ],
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

for (const viewport of viewports) {
  test(`business details keeps the full email inside its dialog field on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: 'admin-1',
          name: 'Community Admin',
          email: 'admin@example.com',
          role: 'community_admin',
        }),
      );
    });
    await stubAdminApi(page);

    await page.goto('/admin/shops');
    await page.getByRole('button', { name: 'View' }).click();

    const dialog = page.getByRole('dialog');
    const email = dialog.getByText(prestigeEmail, { exact: true });
    await expect(email).toBeVisible();

    const textFitsField = await email.evaluate((element) => {
      const containingField = element.parentElement;
      const containingDialog = element.closest('[role="dialog"]');
      if (!containingField || !containingDialog) return false;

      const textRange = document.createRange();
      textRange.selectNodeContents(element);
      const textBounds = textRange.getBoundingClientRect();
      const fieldBounds = containingField.getBoundingClientRect();
      const dialogBounds = containingDialog.getBoundingClientRect();

      return (
        textBounds.left >= fieldBounds.left &&
        textBounds.right <= fieldBounds.right &&
        fieldBounds.right <= dialogBounds.right &&
        containingDialog.scrollWidth <= containingDialog.clientWidth
      );
    });

    expect(textFitsField).toBe(true);
  });
}

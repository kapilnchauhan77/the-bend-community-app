import { expect, test } from '@playwright/test';

const standardSkills = [
  'Event support', 'Gardening', 'Administrative help', 'Home repairs',
  'Cooking and baking', 'Customer service', 'Driving and moving',
  'Tutoring and childcare', 'Cleaning and organizing',
];

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test(`volunteer dialog works at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const requests: unknown[] = [];
    let created: Record<string, unknown> | null = null;
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/tenant/current')) {
        await route.fulfill({ json: { display_name: 'The Bend - Westmoreland', slug: 'westmoreland' } });
        return;
      }
      if (url.pathname.endsWith('/volunteers') && route.request().method() === 'GET') {
        await route.fulfill({ json: { items: created ? [created] : [], next_cursor: null, has_more: false } });
        return;
      }
      if (url.pathname.endsWith('/volunteers') && route.request().method() === 'POST') {
        created = { id: 'vol-1', name: 'Alex', skills: 'Gardening, custom help', about_me: 'Local helper', available_time: 'Weekends' };
        requests.push(route.request().postDataJSON());
        await route.fulfill({ json: created });
        return;
      }
      await route.fulfill({ json: {} });
    });
    await page.setViewportSize(viewport);
    await page.goto('/volunteers');
    await page.getByRole('button', { name: 'Sign Up' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    for (const skill of standardSkills) await expect(dialog.getByLabel(skill)).toBeVisible();
    await dialog.getByLabel('Gardening').check();
    await dialog.getByLabel('Name').fill('Alex');
    await dialog.getByLabel('Phone').fill('555-0100');
    await dialog.getByLabel('Available Time').fill('Weekends');
    await dialog.getByPlaceholder('Other skills or a sentence about what you can help with').fill('custom help');
    await dialog.getByLabel('About me').fill('Local helper');
    await expect(dialog.getByText('12/2000')).toBeVisible();
    await dialog.getByRole('button', { name: 'Sign Up', exact: true }).click();
    await expect.poll(() => requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ skills: 'Gardening, custom help', about_me: 'Local helper' });
    await expect(page.getByText('Local helper')).toBeVisible();
  });
}

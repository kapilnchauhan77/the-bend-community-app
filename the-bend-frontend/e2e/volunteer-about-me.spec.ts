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
    const panel = page.getByTestId('volunteer-modal-panel');
    const body = page.getByTestId('volunteer-modal-body');
    await expect(dialog).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Sign Up' }).click();
    if (viewport.width === 390) {
      const zIndexes = await page.evaluate(() => ({
        modal: getComputedStyle(document.querySelector('[role="dialog"]')!).zIndex,
        nav: getComputedStyle(document.querySelector('nav[class*="bottom-0"]')!).zIndex,
      }));
      expect(Number(zIndexes.modal)).toBeGreaterThan(Number(zIndexes.nav));
    }
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

test('authenticated volunteer edit preserves legacy skills and About me', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'owner-1', name: 'Alex', role: 'individual' }));
  });
  const updates: unknown[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('/tenant/current')) return route.fulfill({ json: { display_name: 'The Bend - Westmoreland' } });
    if (url.pathname.endsWith('/volunteers') && route.request().method() === 'GET') {
      return route.fulfill({ json: { items: [{ id: 'vol-1', name: 'Alex', user_id: 'owner-1', skills: 'Gardening, Long legacy sentence that used to become a giant badge', about_me: 'Old about me', available_time: 'Weekends' }], has_more: false } });
    }
    if (url.pathname.endsWith('/volunteers/vol-1') && route.request().method() === 'PUT') {
      updates.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: 'vol-1', name: 'Alex', user_id: 'owner-1', skills: 'Gardening, Long legacy sentence that used to become a giant badge', about_me: 'New about me', available_time: 'Weekends' } });
    }
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/volunteers');
  await page.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Gardening')).toBeChecked();
  await expect(dialog.locator('#vol-custom-skills')).toHaveValue('Long legacy sentence that used to become a giant badge');
  await dialog.getByLabel('About me').fill('New about me');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(() => updates).toHaveLength(1);
  expect(updates[0]).toMatchObject({ skills: 'Gardening, Long legacy sentence that used to become a giant badge', about_me: 'New about me' });
  await expect(page.getByText('Long legacy sentence that used to become a giant badge')).toBeVisible();
  expect(await page.getByText('Long legacy sentence that used to become a giant badge').evaluate((el) => el.className)).toContain('break-words');
  expect(await page.getByText('Long legacy sentence that used to become a giant badge').evaluate((el) => el.className)).not.toContain('rounded-full');
});

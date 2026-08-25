import { expect, test, type Page } from '@playwright/test';

const submittedEvent = {
  id: 'submitted-event-1',
  title: 'Free Winter Coat & Clothing Event',
  description: 'Free winter clothing, shoes, and essentials while supplies last.',
  start_date: '2026-10-17T10:00:00',
  end_date: '2026-10-17T15:00:00',
  location: '8044 Leedstown Rd. Colonial Beach, VA 22443',
  category: 'community',
  image_url: null,
  source: 'submission',
  source_url: null,
  is_featured: false,
  status: 'active',
  created_at: '2026-08-24T10:00:00',
};

const externalEvent = {
  ...submittedEvent,
  id: 'external-event-1',
  title: 'County Park Open House',
  source: 'connector',
  source_url: 'https://events.example.test/open-house',
};

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function stubTenant(page: Page) {
  await page.route('**/api/v1/tenant/current', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }),
  }));
}

test('submitted event cards open an internal details dialog', async ({ page }) => {
  await stubTenant(page);
  await page.route('**/api/v1/events?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [submittedEvent, externalEvent], next_cursor: null, has_more: false }),
  }));
  await page.route('**/api/v1/sponsors?**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: [] }),
  }));

  await page.goto('/events');
  await page.getByRole('heading', { name: submittedEvent.title, exact: true }).click();

  const dialog = page.getByRole('dialog', { name: submittedEvent.title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(submittedEvent.description)).toBeVisible();
  await expect(dialog.getByText(submittedEvent.location)).toBeVisible();
  await expect(dialog.getByText('Sat, Oct 17 · 10:00 AM – 3:00 PM')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByRole('link', { name: 'Details →', exact: true })).toHaveAttribute('href', externalEvent.source_url);
});

test('admin Photo URL renders a preview and saves the verified image URL', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' }));
  });
  await stubTenant(page);

  const imageUrl = 'https://images.example.test/coat-drive.png';
  let savedPayload: Record<string, unknown> | undefined;
  await page.route(imageUrl, route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }));
  await page.route('**/api/v1/admin/events**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      const items = url.searchParams.get('status') === 'pending' ? [] : [submittedEvent];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items }) });
      return;
    }
    if (route.request().method() === 'PUT') {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'updated' }) });
      return;
    }
    await route.fulfill({ status: 404 });
  });

  await page.goto('/admin/events');
  await page.getByRole('row', { name: new RegExp(submittedEvent.title) }).getByRole('button', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Event' });
  await dialog.getByLabel('Photo URL').fill(imageUrl);
  const preview = dialog.getByRole('img', { name: 'Photo preview' });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', imageUrl);
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => savedPayload?.image_url).toBe(imageUrl);
});

test('admin rejects a webpage URL and offers image upload instead', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' }));
  });
  await stubTenant(page);

  let savedPayload: Record<string, unknown> | undefined;
  await page.route('https://www.facebook.com/share/example/', route => route.fulfill({
    contentType: 'text/html',
    body: '<html><body>Facebook page</body></html>',
  }));
  await page.route('**/api/v1/upload/photo', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ photo_url: '/uploads/event-photo.png' }),
  }));
  await page.route('**/uploads/event-photo.png', route => route.fulfill({ body: onePixelPng, contentType: 'image/png' }));
  await page.route('**/api/v1/admin/events**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET') {
      const items = url.searchParams.get('status') === 'pending' ? [] : [{
        ...submittedEvent,
        image_url: 'https://www.facebook.com/share/example/',
      }];
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items }) });
      return;
    }
    if (route.request().method() === 'PUT') {
      savedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'updated' }) });
      return;
    }
    await route.fulfill({ status: 404 });
  });

  await page.goto('/admin/events');
  await page.getByRole('row', { name: new RegExp(submittedEvent.title) }).getByRole('button', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Event' });
  await expect(dialog.getByText('This link is a webpage, not a displayable photo.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog.getByText('Upload the photo or use a direct image URL before saving.')).toBeVisible();
  expect(savedPayload).toBeUndefined();

  await dialog.locator('input[type=file]').setInputFiles({
    name: 'coat-drive.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  });
  const uploadedPreview = dialog.getByRole('img', { name: 'Photo preview' });
  await expect(uploadedPreview).toBeVisible();
  await expect.poll(() => uploadedPreview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => savedPayload?.image_url).toBe('/uploads/event-photo.png');

  savedPayload = undefined;
  await page.getByRole('row', { name: new RegExp(submittedEvent.title) }).getByRole('button', { name: 'Edit' }).click();
  const reopenedDialog = page.getByRole('dialog', { name: 'Edit Event' });
  await reopenedDialog.getByRole('button', { name: 'Remove photo' }).click();
  await reopenedDialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect.poll(() => savedPayload?.image_url).toBeNull();
});

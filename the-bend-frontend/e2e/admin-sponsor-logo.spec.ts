import { expect, test, type Page } from '@playwright/test';

const CURRENT_LOGO_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const UPLOADED_LOGO_URL = '/uploads/images/replacement-logo.png';
const LOGO_FILE = {
  name: 'replacement-logo.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

const sponsor = {
  id: 'sponsor-1',
  name: 'Inn at Montross',
  description: 'Historic bed and breakfast',
  logo_url: CURRENT_LOGO_URL,
  banner_url: null,
  website_url: 'https://www.montrossinn.com',
  placement: 'homepage',
  is_active: true,
  sort_order: 0,
  paid: true,
  approved: true,
  contact_name: 'Inn at Montross',
  contact_email: 'info@montrossinn.com',
  starts_at: '2026-08-01T00:00:00Z',
  expires_at: null,
  stripe_session_id: null,
  created_at: '2026-08-01T00:00:00Z',
};

type JsonPayload = Record<string, unknown>;

interface SponsorApiCapture {
  uploadRequests: number;
  uploadContentType?: string;
  uploadBody?: string;
  updatePayload?: JsonPayload;
  createPayload?: JsonPayload;
}

interface SponsorApiOptions {
  failUpload?: boolean;
  uploadDelayMs?: number;
  uploadErrorDetail?: string;
  uploadErrorStatus?: number;
}

async function authenticateAdmin(page: Page) {
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
}

async function stubSponsorApi(
  page: Page,
  options: SponsorApiOptions = {},
): Promise<SponsorApiCapture> {
  const capture: SponsorApiCapture = { uploadRequests: 0 };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname.endsWith('/tenant/current')) {
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

    if (url.pathname.endsWith('/upload/sponsor-logo')) {
      capture.uploadRequests += 1;
      capture.uploadContentType = request.headers()['content-type'];
      capture.uploadBody = request.postDataBuffer()?.toString('utf8');
      if (options.uploadDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.uploadDelayMs));
      }
      if (options.failUpload) {
        await route.fulfill({
          status: options.uploadErrorStatus ?? 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: options.uploadErrorDetail ?? 'Upload failed' }),
        });
      } else {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ logo_url: UPLOADED_LOGO_URL }),
        });
      }
      return;
    }

    if (url.pathname.endsWith('/admin/sponsors/sponsor-1') && method === 'PUT') {
      capture.updatePayload = request.postDataJSON() as JsonPayload;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: sponsor.id, status: 'updated' }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin/sponsors') && method === 'POST') {
      capture.createPayload = request.postDataJSON() as JsonPayload;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: 'sponsor-2', name: capture.createPayload.name }),
      });
      return;
    }

    if (url.pathname.endsWith('/admin/sponsors') && method === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [sponsor] }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  return capture;
}

async function openEditDialog(page: Page) {
  await page.goto('/admin/sponsors');
  await page.getByRole('button', { name: 'Edit' }).click();
  return page.getByRole('dialog', { name: 'Edit Sponsor' });
}

test('edit sponsor previews a replacement and uploads it only when Save Changes is used', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page, { uploadDelayMs: 400 });
  const dialog = await openEditDialog(page);

  const logoUrlFallback = dialog.getByLabel('Logo URL');
  await expect(logoUrlFallback).toHaveValue(CURRENT_LOGO_URL);
  const preview = dialog.getByRole('img', { name: 'Inn at Montross logo preview' });
  await expect(preview).toHaveAttribute('src', CURRENT_LOGO_URL);
  await expect(dialog.getByRole('button', { name: 'Replace logo' })).toBeVisible();

  await dialog.getByLabel('Sponsor Logo').setInputFiles(LOGO_FILE);

  await expect(preview).toHaveAttribute('src', /^blob:/);
  expect(capture.uploadRequests).toBe(0);

  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog.getByText('Uploading logo…', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await expect.poll(() => capture.uploadRequests).toBe(1);
  await expect.poll(() => capture.updatePayload?.logo_url).toBe(UPLOADED_LOGO_URL);

  expect(capture.uploadContentType).toContain('multipart/form-data');
  expect(capture.uploadBody).toContain('name="file"');
  expect(capture.uploadBody).toContain(LOGO_FILE.name);
  await expect(dialog).toBeHidden();
});

test('removing an existing sponsor logo saves logo_url as null without uploading', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page);
  const dialog = await openEditDialog(page);

  await dialog.getByRole('button', { name: 'Remove logo' }).click();

  await expect(dialog.getByRole('img', { name: 'Inn at Montross logo preview' })).toHaveCount(0);
  await expect(dialog.getByLabel('Logo URL')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();

  await expect.poll(() => capture.updatePayload?.logo_url).toBe(null);
  expect(capture.uploadRequests).toBe(0);
  await expect(dialog).toBeHidden();
});

test('new sponsor keeps the Logo URL fallback and saves the uploaded logo URL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page);
  await page.goto('/admin/sponsors');
  await page.getByRole('button', { name: 'New Sponsor' }).click();

  const dialog = page.getByRole('dialog', { name: 'New Sponsor' });
  await expect(dialog.getByLabel('Logo URL')).toBeVisible();
  await dialog.getByLabel('Name *').fill('New Community Partner');
  await dialog.getByLabel('Sponsor Logo').setInputFiles(LOGO_FILE);

  const preview = dialog.getByRole('img', { name: 'New Community Partner logo preview' });
  await expect(preview).toHaveAttribute('src', /^blob:/);
  await expect(dialog.getByRole('button', { name: 'Replace logo' })).toBeVisible();
  expect(capture.uploadRequests).toBe(0);

  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(667);
  await expect(dialog).toHaveCSS('overflow-y', 'auto');

  await dialog.getByRole('button', { name: 'Create Sponsor' }).click();
  await expect.poll(() => capture.createPayload?.logo_url).toBe(UPLOADED_LOGO_URL);
  expect(capture.uploadRequests).toBe(1);
  await expect(dialog).toBeHidden();
});

test('edit sponsor uses a manually entered Logo URL instead of a previously selected file', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page);
  const dialog = await openEditDialog(page);

  await dialog.getByLabel('Sponsor Logo').setInputFiles(LOGO_FILE);
  await expect(dialog.getByRole('img', { name: 'Inn at Montross logo preview' })).toHaveAttribute('src', /^blob:/);

  await dialog.getByLabel('Logo URL').fill(CURRENT_LOGO_URL);
  await expect(dialog.getByRole('img', { name: 'Inn at Montross logo preview' })).toHaveAttribute(
    'src',
    CURRENT_LOGO_URL,
  );
  await dialog.getByRole('button', { name: 'Save Changes' }).click();

  await expect.poll(() => capture.updatePayload?.logo_url).toBe(CURRENT_LOGO_URL);
  expect(capture.uploadRequests).toBe(0);
});

test('new sponsor uses a manually entered Logo URL instead of a previously selected file', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page);
  await page.goto('/admin/sponsors');
  await page.getByRole('button', { name: 'New Sponsor' }).click();

  const dialog = page.getByRole('dialog', { name: 'New Sponsor' });
  await dialog.getByLabel('Name *').fill('URL Community Partner');
  await dialog.getByLabel('Sponsor Logo').setInputFiles(LOGO_FILE);
  await dialog.getByLabel('Logo URL').fill(CURRENT_LOGO_URL);

  await expect(dialog.getByRole('img', { name: 'URL Community Partner logo preview' })).toHaveAttribute(
    'src',
    CURRENT_LOGO_URL,
  );
  await dialog.getByRole('button', { name: 'Create Sponsor' }).click();

  await expect.poll(() => capture.createPayload?.logo_url).toBe(CURRENT_LOGO_URL);
  expect(capture.uploadRequests).toBe(0);
});

test('new sponsor saves a Logo URL without selecting a file', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page);
  await page.goto('/admin/sponsors');
  await page.getByRole('button', { name: 'New Sponsor' }).click();

  const dialog = page.getByRole('dialog', { name: 'New Sponsor' });
  await dialog.getByLabel('Name *').fill('URL-only Community Partner');
  await dialog.getByLabel('Logo URL').fill(CURRENT_LOGO_URL);
  await dialog.getByRole('button', { name: 'Create Sponsor' }).click();

  await expect.poll(() => capture.createPayload?.logo_url).toBe(CURRENT_LOGO_URL);
  expect(capture.uploadRequests).toBe(0);
});

test('a sponsor logo upload failure keeps the edit dialog open and skips the update', async ({ page }) => {
  await authenticateAdmin(page);
  const capture = await stubSponsorApi(page, {
    failUpload: true,
    uploadErrorStatus: 413,
    uploadErrorDetail: 'Sponsor logo must be 5 MB or less',
  });
  const dialog = await openEditDialog(page);
  await dialog.getByLabel('Sponsor Logo').setInputFiles(LOGO_FILE);

  await dialog.getByRole('button', { name: 'Save Changes' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Sponsor logo must be 5 MB or less');
  await expect(dialog).toBeVisible();
  expect(capture.uploadRequests).toBe(1);
  expect(capture.updatePayload).toBeUndefined();
});

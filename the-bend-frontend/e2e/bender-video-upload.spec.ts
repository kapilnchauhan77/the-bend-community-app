import { expect, test, type Page } from '@playwright/test';

const videoFile = {
  name: 'bender-test.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('synthetic file covered by the mocked metadata seam'),
};

const uploadDetail = 'Video must be 60 seconds or less';

async function openComposer(page: Page, uploadStatus = 200) {
  const requests = { uploads: 0, posts: 0, postPayload: null as Record<string, unknown> | null };
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'u1', name: 'Alex', role: 'individual' }));
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/tenant/current') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
      return;
    }
    if (url.pathname === '/api/v1/bender/posts' && request.method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
      return;
    }
    if (url.pathname === '/api/v1/upload/media' && request.method() === 'POST') {
      requests.uploads += 1;
      if (uploadStatus !== 200) {
        await route.fulfill({ status: uploadStatus, contentType: 'application/json', body: JSON.stringify({ detail: uploadDetail }) });
      } else {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ url: '/uploads/videos/test.mp4', thumbnail_url: '/uploads/videos/test_poster.jpg', type: 'video', duration_ms: 45000 }) });
      }
      return;
    }
    if (url.pathname === '/api/v1/bender/posts' && request.method() === 'POST') {
      requests.posts += 1;
      requests.postPayload = request.postDataJSON() as Record<string, unknown>;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'post-1', author: { id: 'u1', name: 'Alex', shop_name: null, avatar_url: null, shop_id: null }, caption: 'A video', media_url: '/uploads/videos/test.mp4', media_thumbnail_url: '/uploads/videos/test_poster.jpg', media_type: 'video', like_count: 0, comment_count: 0, viewer_has_liked: false, created_at: '2026-09-10T00:00:00Z' }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, has_more: false }) });
  });
  await page.goto('/bender');
  await page.getByRole('button', { name: 'New post' }).click();
  return requests;
}

async function setVideoDuration(page: Page, duration: number) {
  await page.evaluate((value) => {
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => value });
    HTMLMediaElement.prototype.load = function () {
      queueMicrotask(() => this.dispatchEvent(new Event('loadedmetadata')));
    };
  }, duration);
}

async function hangVideoMetadata(page: Page) {
  await page.evaluate(() => {
    HTMLMediaElement.prototype.load = function () {};
  });
}

test('library picker accepts an MP4 and shows a pending video preview', async ({ page }) => {
  await openComposer(page);
  await setVideoDuration(page, 45);
  await page.getByRole('button', { name: 'Pick from library' }).click();
  await page.locator('input[type="file"]').setInputFiles(videoFile);
  await expect(page.locator('img[src*="/uploads/videos/test_poster.jpg"]')).toBeVisible();
});

test('client preflight rejects video over 60 seconds before upload', async ({ page }) => {
  const overDuration = await openComposer(page);
  await setVideoDuration(page, 60.001);
  await page.locator('input[type="file"]').setInputFiles(videoFile);
  await expect(page.getByRole('alert')).toContainText('60 seconds');
  expect(overDuration.uploads).toBe(0);
});

test('client preflight rejects video over 25 MB before upload', async ({ page }) => {
  const oversizedRequests = await openComposer(page);
  const oversized = { ...videoFile, name: 'oversized.mp4', buffer: Buffer.alloc(25 * 1024 * 1024 + 1) };
  await page.locator('input[type="file"]').setInputFiles(oversized);
  await expect(page.getByRole('alert')).toContainText('25 MB');
  expect(oversizedRequests.uploads).toBe(0);
});

test('server upload detail is shown and posting remains unavailable after failure', async ({ page }) => {
  const requests = await openComposer(page, 422);
  await setVideoDuration(page, 45);
  await page.locator('input[type="file"]').setInputFiles(videoFile);
  await expect(page.getByRole('alert')).toContainText(uploadDetail);
  await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();
  expect(requests.uploads).toBe(1);
  expect(requests.posts).toBe(0);
});

test('successful video upload can be posted with its pending media', async ({ page }) => {
  const requests = await openComposer(page);
  await setVideoDuration(page, 45);
  await page.locator('textarea').fill('A video');
  await page.locator('input[type="file"]').setInputFiles(videoFile);
  await expect(page.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect.poll(() => requests.posts).toBe(1);
  expect(requests.postPayload).toMatchObject({ media_url: '/uploads/videos/test.mp4', media_type: 'video' });
});

test('camera upload shows the server detail and keeps retry controls after failure', async ({ page }) => {
  await openComposer(page, 422);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await setVideoDuration(page, 45);
  const camera = page.getByRole('dialog').last();
  await camera.locator('input[type="file"]').setInputFiles(videoFile);
  await camera.getByRole('button', { name: 'Use this' }).click();
  await expect(camera.getByRole('alert')).toContainText(uploadDetail);
  await expect(camera.getByRole('button', { name: 'Retake' })).toBeVisible();
  await expect(camera.getByRole('button', { name: 'Use this' })).toBeVisible();
});

test('hung video metadata shows a bounded preflight error without uploading', async ({ page }) => {
  const requests = await openComposer(page);
  await hangVideoMetadata(page);
  await page.locator('input[type="file"]').setInputFiles(videoFile);
  await expect(page.getByRole('alert')).toContainText('browser-playable');
  expect(requests.uploads).toBe(0);
});

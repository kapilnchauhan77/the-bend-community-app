import { expect, test } from '@playwright/test';

const notifications = [
  {
    id: 'event-1',
    type: 'event_submitted',
    title: 'New event pending review',
    body: 'Community concert needs your review.',
    data: { event_id: 'event-1' },
    is_read: true,
    created_at: '2026-09-04T10:00:00Z',
  },
  {
    id: 'registration-1',
    type: 'registration_submitted',
    title: 'New registration pending review',
    body: 'A business registration needs your review.',
    data: { shop_id: 'shop-1' },
    is_read: true,
    created_at: '2026-09-04T09:00:00Z',
  },
  {
    id: 'sponsor-1',
    type: 'registration_submitted',
    title: 'New sponsor pending review',
    body: 'A sponsor registration needs your review.',
    data: { sponsor_id: 'sponsor-1' },
    is_read: true,
    created_at: '2026-09-04T08:00:00Z',
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', name: 'Admin', role: 'community_admin' }));
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/tenant/current') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    }
    if (url.pathname === '/api/v1/notifications') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: notifications, next_cursor: null, has_more: false }) });
    }
    if (url.pathname === '/api/v1/admin/events' || url.pathname === '/api/v1/admin/registrations' || url.pathname === '/api/v1/admin/sponsors') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
});

test('routes pending event review notifications to events with a calendar icon', async ({ page }) => {
  await page.goto('/notifications');
  const eventNotification = page.getByText('New event pending review');
  const eventCard = eventNotification.locator('xpath=ancestor::div[contains(@class, "cursor-pointer")]');
  await expect(eventCard).toHaveCount(1);
  await expect(eventCard.locator('svg.lucide-calendar')).toHaveCount(1);
  await eventNotification.click();
  await expect(page).toHaveURL('/admin/events');
});

test('keeps registration review notifications on their existing destinations', async ({ page }) => {
  await page.goto('/notifications');
  await page.getByText('New registration pending review').click();
  await expect(page).toHaveURL('/admin/registrations');

  await page.goto('/notifications');
  await page.getByText('New sponsor pending review').click();
  await expect(page).toHaveURL('/admin/sponsors');
});

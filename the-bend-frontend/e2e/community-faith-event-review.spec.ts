import { expect, test, type Page } from '@playwright/test';

const event = {
  id: 'event-1', title: 'Existing Event', description: 'Existing', start_date: '2026-09-01T18:00:00Z',
  end_date: null, location: 'Town Hall', category: 'community', image_url: null, source: 'manual',
  source_url: null, is_featured: false, status: 'active', created_at: '2026-08-24T10:00:00Z',
};

async function stubPublic(page: Page, submit: (payload: Record<string, unknown>) => void, uploadSucceeds = false) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
      return;
    }
    if (url.pathname.endsWith('/events') && route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [event] }) });
      return;
    }
    if (url.pathname.endsWith('/events/submit') && route.request().method() === 'POST') {
      submit(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ free: true }) });
      return;
    }
    if (url.pathname.endsWith('/upload/photo')) {
      await route.fulfill(uploadSucceeds ? { contentType: 'application/json', body: JSON.stringify({ photo_url: '/uploads/proof.pdf' }) } : { status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Upload service unavailable' }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
}

async function openPost(page: Page, tier: string) {
  await page.goto('/events');
  await page.getByRole('button', { name: 'Post Event' }).click();
  await page.getByRole('button', { name: new RegExp(tier) }).click();
}

async function fillRequired(page: Page) {
  await page.getByPlaceholder('Jane Smith').fill('Jane Smith');
  await page.getByPlaceholder('jane@example.com').fill('jane@example.com');
  await page.getByPlaceholder('Spring Community Fair').fill('Community Fair');
  await page.locator('input[type=datetime-local]').first().fill('2026-09-03T18:00');
}

test('offers all tiers and community guidance without nonprofit upload', async ({ page }) => {
  await stubPublic(page, () => undefined);
  await page.goto('/events');
  await page.getByRole('button', { name: 'Post Event' }).click();
  await expect(page.getByRole('button', { name: /Community or Faith Organization/ })).toContainText('Free');
  await page.getByRole('button', { name: /Community or Faith Organization/ }).click();
  await expect(page.getByText(/community-issued event code/i)).toBeVisible();
  await expect(page.getByText(/Not-for-Profit Documentation/i)).toHaveCount(0);
  await expect(page.getByText(/Stripe/i)).toHaveCount(0);
});

test('community submission requires coupon and sends exact free payload', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await stubPublic(page, (value) => { payload = value; });
  await openPost(page, 'Community or Faith Organization');
  await fillRequired(page);
  await page.getByRole('button', { name: /Submit/ }).click();
  await expect(page.getByText(/community-issued event code is required/i)).toBeVisible();
  await page.getByPlaceholder('e.g. SUMMER250').fill('  COMMUNITY100 ');
  await page.getByRole('button', { name: /Submit/ }).click();
  await expect.poll(() => payload).toEqual({ title: 'Community Fair', description: '', start_date: '2026-09-03T18:00', end_date: '', location: '', category: 'community', submitted_by_name: 'Jane Smith', submitted_by_email: 'jane@example.com', is_nonprofit: false, organization_type: 'community_faith', coupon_code: 'COMMUNITY100' });
  await expect(page.getByText(/Payment received|Stripe/i)).toHaveCount(0);
  await expect(page.getByText(/free event was submitted/i)).toBeVisible();
});

test('invalid community coupon detail remains visible', async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/events') && route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [event] }) });
    if (url.pathname.endsWith('/events/submit')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ detail: 'Coupon is invalid or expired.' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await openPost(page, 'Community or Faith Organization');
  await fillRequired(page);
  await page.getByPlaceholder('e.g. SUMMER250').fill('BADCODE');
  await page.getByRole('button', { name: /Submit/ }).click();
  await expect(page.getByText('Coupon is invalid or expired.')).toBeVisible();
});

test('nonprofit upload failures are visible and payload keeps nonprofit contract', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await stubPublic(page, (value) => { payload = value; });
  await openPost(page, 'Not-for-Profit Organization');
  const file = page.locator('input[type=file]');
  await file.setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('proof') });
  await expect(page.getByText(/Upload service unavailable|upload failed/i)).toBeVisible();
  await fillRequired(page);
  await page.getByRole('button', { name: /Submit/ }).click();
  await expect(page.getByText(/Please upload documentation/i)).toBeVisible();
  expect(payload).toBeUndefined();
});

test('verified nonprofit submission sends exact payload after document upload', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await stubPublic(page, (value) => { payload = value; }, true);
  await openPost(page, 'Not-for-Profit Organization');
  await page.locator('input[type=file]').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('proof') });
  await expect(page.getByText('Document uploaded')).toBeVisible();
  await fillRequired(page);
  await page.getByRole('button', { name: /Submit/ }).click();
  await expect.poll(() => payload).toEqual({ title: 'Community Fair', description: '', start_date: '2026-09-03T18:00', end_date: '', location: '', category: 'community', submitted_by_name: 'Jane Smith', submitted_by_email: 'jane@example.com', is_nonprofit: true, organization_type: 'verified_nonprofit', nonprofit_doc_url: '/uploads/proof.pdf' });
});

test('for-profit submission sends exact payload and retains optional coupon', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await stubPublic(page, (value) => { payload = value; });
  await openPost(page, 'For-Profit Business');
  await fillRequired(page);
  await page.getByPlaceholder('e.g. SUMMER250').fill('PROMO20');
  await page.getByRole('button', { name: /Pay \$19\.99/ }).click();
  await expect.poll(() => payload).toEqual({ title: 'Community Fair', description: '', start_date: '2026-09-03T18:00', end_date: '', location: '', category: 'community', submitted_by_name: 'Jane Smith', submitted_by_email: 'jane@example.com', is_nonprofit: false, organization_type: 'for_profit', coupon_code: 'PROMO20' });
});

test('switching tiers clears private fields and omits stale document and coupon', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await stubPublic(page, (value) => { payload = value; }, true);
  await openPost(page, 'Not-for-Profit Organization');
  await page.locator('input[type=file]').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('proof') });
  await expect(page.getByText('Document uploaded')).toBeVisible();
  await page.getByPlaceholder('e.g. SUMMER250').fill('NONPROFIT100');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: /Community or Faith Organization/ }).click();
  await fillRequired(page);
  await page.getByPlaceholder('e.g. SUMMER250').fill('COMMUNITY100');
  await page.getByRole('button', { name: /Submit/ }).click();
  await expect.poll(() => payload).toEqual({ title: 'Community Fair', description: '', start_date: '2026-09-03T18:00', end_date: '', location: '', category: 'community', submitted_by_name: 'Jane Smith', submitted_by_email: 'jane@example.com', is_nonprofit: false, organization_type: 'community_faith', coupon_code: 'COMMUNITY100' });
});

test('admin pending reviews expose private details and approve refreshes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', name: 'Admin', email: 'admin@example.com', role: 'community_admin' }));
  });
  let pending = true;
  const calls: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && route.request().method() === 'GET') {
      const isPending = url.searchParams.get('status') === 'pending';
      if (isPending) expect(url.searchParams.get('limit')).toBe('50');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: isPending && pending ? [{ ...event, status: 'pending', submitted_by_name: 'Jane Smith', submitted_by_email: 'jane@example.com', organization_type: 'community_faith', nonprofit_doc_url: '/uploads/proof.pdf', paid: false, coupon_code_id: 'coupon-1' }] : [event] }) });
    }
    if (url.pathname.endsWith('/approve')) { calls.push(url.pathname); pending = false; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'active' }) }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  await expect(page.getByText('Jane Smith')).toBeVisible();
  await expect(page.getByText('jane@example.com')).toBeVisible();
  await expect(page.getByText('community_faith')).toBeVisible();
  await expect(page.getByRole('link', { name: 'View nonprofit document' })).toHaveAttribute('href', /proof\.pdf/);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.getByText('Jane Smith')).toHaveCount(0);
});

test('admin reject uses exact endpoint and refreshes pending reviews', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  let pending = true;
  let rejected = false;
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && route.request().method() === 'GET') {
      if (url.searchParams.get('status') === 'pending') expect(url.searchParams.get('limit')).toBe('50');
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: url.searchParams.get('status') === 'pending' && pending ? [{ ...event, status: 'pending', submitted_by_name: 'Jane Smith', submitted_by_email: 'jane@example.com', organization_type: 'community_faith' }] : [event] }) });
    }
    if (url.pathname.endsWith('/reject')) { rejected = true; pending = false; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'rejected' }) }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect.poll(() => rejected).toBe(true);
  await expect(page.getByText('Jane Smith')).toHaveCount(0);
});

test('review action failures stay visible and keep the pending card', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: url.searchParams.get('status') === 'pending' ? [{ ...event, status: 'pending', submitted_by_name: 'Jane Smith', organization_type: 'community_faith' }] : [event] }) });
    if (url.pathname.endsWith('/approve') || url.pathname.endsWith('/reject')) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Review service unavailable' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Failed to approve event/i)).toBeVisible();
  await expect(page.getByText('Jane Smith')).toBeVisible();
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText(/Failed to reject event/i)).toBeVisible();
});

test('admin status table labels pending and rejected accurately', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: url.searchParams.get('status') === 'pending' ? [] : [{ ...event, id: 'pending-1', title: 'Pending Table Event', status: 'pending' }, { ...event, id: 'rejected-1', title: 'Rejected Table Event', status: 'rejected' }] }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
});

test('unsafe document URLs are not rendered as clickable links', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && route.request().method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: url.searchParams.get('status') === 'pending' ? [{ ...event, id: 'unsafe-js', status: 'pending', nonprofit_doc_url: 'javascript:alert(1)' }, { ...event, id: 'unsafe-data', status: 'pending', nonprofit_doc_url: 'data:text/html,<script>alert(1)</script>' }] : [] }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  await expect(page.getByRole('link', { name: 'View nonprofit document' })).toHaveCount(0);
  await expect(page.getByText(/document unavailable/i)).toHaveCount(2);
});

test('public modal stays contained at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await stubPublic(page, () => undefined);
  await openPost(page, 'Community or Faith Organization');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('pending review stays contained at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && url.searchParams.get('status') === 'pending') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ ...event, status: 'pending', submitted_by_name: 'Jane Smith', submitted_by_email: 'very-long-email-address@example.com', organization_type: 'community_faith' }] }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('pending fetch failure is visibly distinct from an empty queue', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && url.searchParams.get('status') === 'pending') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Unavailable' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  await expect(page.getByText(/Pending reviews could not be loaded/i)).toBeVisible();
});

test('public event form remains contained at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubPublic(page, () => undefined);
  await openPost(page, 'Community or Faith Organization');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('pending review stays contained at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem('access_token', 'test-token'); localStorage.setItem('user', JSON.stringify({ id: 'admin-1', role: 'community_admin' })); });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/tenant/current')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ slug: 'westmoreland', display_name: 'The Bend' }) });
    if (url.pathname.endsWith('/admin/events') && url.searchParams.get('status') === 'pending') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ ...event, status: 'pending', submitted_by_name: 'Jane Smith', submitted_by_email: 'very-long-email-address@example.com', organization_type: 'community_faith' }] }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  });
  await page.goto('/admin/events');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

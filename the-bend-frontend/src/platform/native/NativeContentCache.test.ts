import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { NativeContentCache, normalizePublicContent } from './NativeContentCache'

const filesystem = vi.hoisted(() => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  deleteFile: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('@capacitor/filesystem', () => ({ Directory: { Data: 'DATA' }, Encoding: { UTF8: 'utf8' }, Filesystem: filesystem }))

const MB = 1024 * 1024

describe('NativeContentCache', () => {
  beforeEach(() => {
    NativeContentCache.resetForTests()
    vi.useRealTimers()
    vi.clearAllMocks()
    filesystem.mkdir.mockResolvedValue(undefined)
    filesystem.writeFile.mockResolvedValue(undefined)
    filesystem.rename.mockResolvedValue(undefined)
    filesystem.deleteFile.mockResolvedValue(undefined)
    filesystem.stat.mockResolvedValue({ size: 0 })
  })

  afterEach(() => vi.useRealTimers())

  it('evicts least recently used entries until both limits pass', async () => {
    const cache = new NativeContentCache({ storage: 'memory' })
    for (let i = 0; i < 51; i++) {
      await cache.put({ key: `listing:${i}`, kind: 'listing', entityId: String(i), cachedAt: new Date().toISOString(), payload: { title: String(i) }, imagePath: null, sizeBytes: MB })
    }
    const stats = await cache.stats()
    expect(stats.items).toBeLessThanOrEqual(50)
    expect(stats.bytes).toBeLessThanOrEqual(50 * MB)
    expect(await cache.get('listing:0')).toBeNull()
  })

  it.each(['message', 'account', 'checkout'])('rejects private cache kind %s', async (kind) => {
    const cache = new NativeContentCache({ storage: 'memory' })
    await expect(cache.put({ key: `${kind}:1`, kind, entityId: '1', cachedAt: new Date().toISOString(), payload: {}, imagePath: null, sizeBytes: 1 } as never)).rejects.toThrow('PUBLIC_CONTENT_ONLY')
  })

  it('rejects mismatched and traversing keys', async () => {
    const cache = new NativeContentCache({ storage: 'memory' })
    const base = { kind: 'listing' as const, entityId: '42', cachedAt: new Date().toISOString(), payload: { title: 'safe' }, imagePath: null, sizeBytes: 1 }
    await expect(cache.put({ ...base, key: 'business:42' })).rejects.toThrow('INVALID_CACHE_KEY')
    await expect(cache.put({ ...base, key: 'listing:../secret', entityId: '../secret' })).rejects.toThrow('INVALID_CACHE_KEY')
  })

  it('does not trust a caller supplied byte count', async () => {
    const cache = new NativeContentCache({ storage: 'memory' })
    await cache.put({ key: 'listing:large', kind: 'listing', entityId: 'large', cachedAt: new Date().toISOString(), payload: { body: 'x'.repeat(100) }, imagePath: null, sizeBytes: 0 })
    expect((await cache.get('listing:large'))?.sizeBytes).toBeGreaterThan(0)
  })

  it('projects nested public content and strips private viewer fields', () => {
    const result = normalizePublicContent('listing', { id: '1', title: 'Public', viewer_has_saved: true, access_token: 'secret', shop: { id: 's', name: 'Shop', email: 'private', stripe_account_id: 'secret' }, images: [{ url: '/a.jpg' }, { url: '/b.jpg' }] }) as Record<string, unknown>
    expect(result).toEqual({ id: '1', title: 'Public', shop: { id: 's', name: 'Shop' }, images: [{ url: '/a.jpg' }] })
  })

  it('preserves feed arrays while recursively projecting every entity', () => {
    const result = normalizePublicContent('event', [{ id: 'e1', title: 'Event', viewer_has_saved: true }, { id: 'e2', title: 'Second', access_token: 'x' }])
    expect(result).toEqual([{ id: 'e1', title: 'Event' }, { id: 'e2', title: 'Second' }])
    const business = normalizePublicContent('business', { id: 'b', name: 'Shop', listings: [{ id: 'l', title: 'Listing', viewer_has_interest: true, posted_by: { id: 'u', name: 'Public', email: 'secret' } }] })
    expect(business).toEqual({ id: 'b', name: 'Shop', listings: [{ id: 'l', title: 'Listing', posted_by: { id: 'u', name: 'Public' } }] })
  })

  it('uses explicit render-safe projections for every public kind and nested entity', () => {
    expect(normalizePublicContent('listing', {
      id: 'l1', title: 'Desk', description: 'Oak', type: 'offer', category: 'equipment', urgency: 'normal',
      is_free: false, pricing_type: 'fixed', price: 25, status: 'active', interest_count: 3, views_count: 9,
      created_at: '2026-08-18T00:00:00Z', viewer_has_saved: true,
      shop: { id: 's1', name: 'Workshop', business_type: 'maker', avatar_url: '/shop.jpg', address: '1 Main', contact_phone: '123', whatsapp: '456', email: 'private' },
      posted_by: { id: 'u1', name: 'Alex', avatar_url: '/user.jpg', email: 'private' },
      images: [{ url: '/desk.jpg', thumbnail_url: '/thumb.jpg', signed_url: 'private' }],
    })).toEqual({
      id: 'l1', title: 'Desk', description: 'Oak', type: 'offer', category: 'equipment', urgency: 'normal',
      is_free: false, pricing_type: 'fixed', price: 25, status: 'active', interest_count: 3, views_count: 9,
      created_at: '2026-08-18T00:00:00Z',
      shop: { id: 's1', name: 'Workshop', business_type: 'maker', avatar_url: '/shop.jpg', address: '1 Main', contact_phone: '123', whatsapp: '456' },
      posted_by: { id: 'u1', name: 'Alex', avatar_url: '/user.jpg' },
      images: [{ url: '/desk.jpg', thumbnail_url: '/thumb.jpg' }],
    })

    expect(normalizePublicContent('business', {
      id: 's1', name: 'Workshop', business_type: 'maker', address: '1 Main', contact_phone: '123', whatsapp: '456',
      status: 'active', active_listings_count: 1, total_fulfilled: 2, endorsement_count: 4, member_since: '2025-01-01',
      avatar_url: '/shop.jpg', viewer_has_endorsed: true, email: 'private',
    })).toEqual({
      id: 's1', name: 'Workshop', business_type: 'maker', address: '1 Main', contact_phone: '123', whatsapp: '456',
      status: 'active', active_listings_count: 1, total_fulfilled: 2, endorsement_count: 4, member_since: '2025-01-01', avatar_url: '/shop.jpg',
    })

    expect(normalizePublicContent('event', { id: 'e1', title: 'Fair', start_date: '2026-08-18', image_url: '/fair.jpg', status: 'active', admin_notes: 'private' }))
      .toEqual({ id: 'e1', title: 'Fair', start_date: '2026-08-18', image_url: '/fair.jpg', status: 'active' })
    expect(normalizePublicContent('bender', { id: 'p1', caption: 'Hello', viewer_has_liked: true, author: { id: 'u1', name: 'Alex', avatar_url: '/a.jpg', shop_id: 's1', shop_name: 'Workshop', email: 'private' } }))
      .toEqual({ id: 'p1', caption: 'Hello', author: { id: 'u1', name: 'Alex', avatar_url: '/a.jpg', shop_id: 's1', shop_name: 'Workshop' } })
  })

  it('never persists precise business coordinates while retaining public rendering fields', () => {
    expect(normalizePublicContent('business', {
      id: 's1',
      name: 'Workshop',
      business_type: 'maker',
      address: '1 Main',
      city: 'Westmoreland',
      state: 'VA',
      zip_code: '22520',
      latitude: 38.123456,
      longitude: -76.654321,
      location: { latitude: 38.123456, longitude: -76.654321 },
      coordinates: { lat: 38.123456, lng: -76.654321 },
      geo: { point: { latitude: 38.123456, longitude: -76.654321 } },
      listings: [{
        id: 'l1',
        title: 'Desk',
        shop: { id: 's1', name: 'Workshop', latitude: 38.123456, longitude: -76.654321 },
        posted_by: { id: 'u1', name: 'Alex', location: { latitude: 38.123456, longitude: -76.654321 } },
      }],
    })).toEqual({
      id: 's1',
      name: 'Workshop',
      business_type: 'maker',
      address: '1 Main',
      city: 'Westmoreland',
      state: 'VA',
      zip_code: '22520',
      listings: [{
        id: 'l1',
        title: 'Desk',
        shop: { id: 's1', name: 'Workshop' },
        posted_by: { id: 'u1', name: 'Alex' },
      }],
    })

    expect(normalizePublicContent('listing', {
      id: 'l2', title: 'Chair', latitude: 38.1, longitude: -76.6,
      shop: { id: 's2', name: 'Carpenter', location: { latitude: 38.1, longitude: -76.6 } },
    })).toEqual({ id: 'l2', title: 'Chair', shop: { id: 's2', name: 'Carpenter' } })
    expect(normalizePublicContent('event', {
      id: 'e1', title: 'Market', location: 'Town square', latitude: 38.1, longitude: -76.6,
      coordinates: { latitude: 38.1, longitude: -76.6 },
    })).toEqual({ id: 'e1', title: 'Market', location: 'Town square' })
    expect(normalizePublicContent('bender', {
      id: 'p1', caption: 'Hello', latitude: 38.1, longitude: -76.6,
      author: { id: 'u1', name: 'Alex', geo: { latitude: 38.1, longitude: -76.6 } },
    })).toEqual({ id: 'p1', caption: 'Hello', author: { id: 'u1', name: 'Alex' } })
  })

  it('projects paginated payloads without leaking private fields at any depth', () => {
    expect(normalizePublicContent('bender', {
      items: [{ id: 'p1', caption: 'Hello', viewer_has_liked: true, author: { id: 'u1', name: 'Alex', email: 'private', profile: { access_token: 'secret' } } }],
      next_cursor: 'cursor-2', has_more: true, access_token: 'private',
    })).toEqual({
      items: [{ id: 'p1', caption: 'Hello', author: { id: 'u1', name: 'Alex' } }],
      next_cursor: 'cursor-2', has_more: true,
    })
  })

  it('deletes an image and persists when get expires an already-loaded entry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-18T00:00:00Z'))
    const cachedAt = '2026-08-12T00:00:00Z'
    filesystem.readFile.mockResolvedValue({ data: JSON.stringify([{ key: 'listing:1', kind: 'listing', entityId: '1', cachedAt, lastAccessedAt: cachedAt, payload: { id: '1', title: 'Desk' }, imagePath: 'bend-public-cache/images/shared.jpg', sizeBytes: 10 }]) })
    const cache = new NativeContentCache({ storage: 'filesystem' })
    expect((await cache.stats()).items).toBe(1)

    vi.setSystemTime(new Date('2026-08-20T00:00:00Z'))
    await expect(cache.get('listing:1')).resolves.toBeNull()
    expect(filesystem.deleteFile).toHaveBeenCalledWith({ path: 'bend-public-cache/images/shared.jpg', directory: 'DATA' })
    expect(filesystem.rename).toHaveBeenCalled()
  })

  it('does not delete an image still referenced by a valid entry during load cleanup', async () => {
    const now = new Date().toISOString()
    filesystem.readFile.mockResolvedValue({ data: JSON.stringify([
      { key: 'listing:valid', kind: 'listing', entityId: 'valid', cachedAt: now, lastAccessedAt: now, payload: { id: 'valid', title: 'Desk' }, imagePath: 'bend-public-cache/images/shared.jpg', sizeBytes: 10 },
      { key: 'listing:expired', kind: 'listing', entityId: 'expired', cachedAt: '2020-01-01T00:00:00Z', lastAccessedAt: now, payload: { id: 'expired', title: 'Old' }, imagePath: 'bend-public-cache/images/shared.jpg', sizeBytes: 10 },
    ]) })
    const cache = new NativeContentCache({ storage: 'filesystem' })
    expect((await cache.stats()).items).toBe(1)
    expect(filesystem.deleteFile).not.toHaveBeenCalled()
  })

  it('persists structural sanitization for duplicate keys and changed content', async () => {
    const now = new Date().toISOString()
    filesystem.readFile.mockResolvedValue({ data: JSON.stringify([
      { key: 'listing:1', kind: 'listing', entityId: '1', cachedAt: now, lastAccessedAt: now, payload: { id: '1', title: 'Old', viewer_has_saved: true }, imagePath: null, sizeBytes: 10 },
      { key: 'listing:1', kind: 'listing', entityId: '1', cachedAt: now, lastAccessedAt: now, payload: { id: '1', title: 'Current', access_token: 'private' }, imagePath: null, sizeBytes: 10 },
    ]) })
    const cache = new NativeContentCache({ storage: 'filesystem' })
    expect((await cache.get('listing:1'))?.payload).toEqual({ id: '1', title: 'Current' })
    const persisted = JSON.parse(String(filesystem.writeFile.mock.calls.at(-1)?.[0]?.data))
    expect(persisted).toHaveLength(1)
    expect(persisted[0].payload).toEqual({ id: '1', title: 'Current' })
  })
})

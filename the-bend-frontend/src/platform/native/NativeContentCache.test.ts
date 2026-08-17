import { describe, expect, it, beforeEach } from 'vitest'
import { NativeContentCache, normalizePublicContent } from './NativeContentCache'

const MB = 1024 * 1024

describe('NativeContentCache', () => {
  beforeEach(() => NativeContentCache.resetForTests())

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
})

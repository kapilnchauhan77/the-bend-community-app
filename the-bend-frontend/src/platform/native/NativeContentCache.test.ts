import { describe, expect, it, beforeEach } from 'vitest'
import { NativeContentCache } from './NativeContentCache'

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
})

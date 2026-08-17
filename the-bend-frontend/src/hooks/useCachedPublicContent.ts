import { useCallback, useEffect, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'
import { useNativeLifecycle } from './useNativeLifecycle'
import type { CachedContent } from '@/platform/contracts'

export function useCachedPublicContent<T>(key: string, fetcher: () => Promise<T>) {
  const { cache, network } = usePlatformServices()
  const [data, setData] = useState<T | null>(null)
  const [source, setSource] = useState<'network' | 'cache' | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    const online = await network.getStatus() === 'online'
    if (online) {
      try {
        const fresh = await fetcher(); setData(fresh); setSource('network')
        const value = fresh as CachedContent
        const [prefix, ...rest] = key.split(':')
        const kind = (value && typeof value === 'object' && 'kind' in value ? value.kind : prefix) as CachedContent['kind']
        const entityId = value && typeof value === 'object' && 'entityId' in value ? String(value.entityId) : rest.join(':') || key
        if (['listing', 'business', 'event', 'bender'].includes(kind)) await cache.put({ key, kind, entityId, cachedAt: new Date().toISOString(), payload: value, imagePath: null, sizeBytes: JSON.stringify(value).length })
        return
      } catch { /* use cache below */ }
    }
    const stored = await cache.get(key)
    if (stored) { setData(stored.payload as T); setSource('cache'); setCachedAt(stored.cachedAt) }
  }, [cache, fetcher, key, network])
  useEffect(() => { const task = queueMicrotask(() => { void refresh() }); void task; const listener = network.addListener((status) => { if (status === 'online') void refresh() }); return () => { listener.then((l) => l.remove()) } }, [network, refresh])
  useNativeLifecycle(refresh)
  return { data, source, cachedAt, refresh }
}

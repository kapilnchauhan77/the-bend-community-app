import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'
import { useNativeLifecycle } from './useNativeLifecycle'
import type { CachedContent } from '@/platform/contracts'

export function useCachedPublicContent<T>(key: string, fetcher: () => Promise<T>) {
  const { cache, network } = usePlatformServices()
  const [data, setData] = useState<T | null>(null)
  const [source, setSource] = useState<'network' | 'cache' | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const inFlight = useRef<{ key: string; request: Promise<void> } | null>(null)
  const activeKey = useRef(key)
  useEffect(() => { activeKey.current = key; setData(null); setSource(null); setCachedAt(null) }, [key])
  const refresh = useCallback(async () => {
    if (inFlight.current?.key === key) return inFlight.current.request
    const requestKey = key
    const request = (async () => {
      const online = await network.getStatus() === 'online'
      if (online) {
        try {
          const fresh = await fetcher()
          if (activeKey.current !== requestKey) return
          setData(fresh); setSource('network'); setCachedAt(null)
          const value = fresh as CachedContent
          const [prefix, ...rest] = key.split(':')
          const kind = (value && typeof value === 'object' && 'kind' in value ? value.kind : prefix) as CachedContent['kind']
          const entityId = value && typeof value === 'object' && 'entityId' in value ? String(value.entityId) : rest.join(':') || key
          if (['listing', 'business', 'event', 'bender'].includes(kind)) {
            // A cache failure must never turn a successful network read into an error.
            await cache.put({ key, kind, entityId, cachedAt: new Date().toISOString(), payload: value, imagePath: null, sizeBytes: JSON.stringify(value).length }).catch(() => undefined)
          }
          return
        } catch { /* use cache below */ }
      }
      const stored = await cache.get(key)
      if (stored && activeKey.current === requestKey) { setData(stored.payload as T); setSource('cache'); setCachedAt(stored.cachedAt) }
    })()
    inFlight.current = { key: requestKey, request }
    try { await request } finally { if (inFlight.current?.request === request) inFlight.current = null }
  }, [cache, fetcher, key, network])
  useEffect(() => { queueMicrotask(() => { void refresh() }); const listener = network.addListener((status) => { if (status === 'online') void refresh() }); return () => { void listener.then((l) => l.remove()) } }, [network, refresh])
  useNativeLifecycle(refresh)
  return { data, source, cachedAt, refresh }
}

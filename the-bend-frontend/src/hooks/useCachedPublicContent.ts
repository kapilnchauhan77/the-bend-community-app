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
  const mounted = useRef(false)
  activeKey.current = key
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (mounted.current) { setData(null); setSource(null); setCachedAt(null) } }, [key])
  const refresh = useCallback(async () => {
    if (inFlight.current?.key === key) return inFlight.current.request
    const requestKey = key
    const request = (async () => {
      const online = await network.getStatus() === 'online'
      if (online) {
        try {
          const fresh = await fetcher()
          const value = fresh as CachedContent
          const [prefix, ...rest] = requestKey.split(':')
          const kind = (value && typeof value === 'object' && 'kind' in value ? value.kind : prefix) as CachedContent['kind']
          const entityId = value && typeof value === 'object' && 'entityId' in value ? String(value.entityId) : rest.join(':') || requestKey
          if (['listing', 'business', 'event', 'bender'].includes(kind)) {
            // A cache failure must never turn a successful network read into an error.
            const write = cache.put({ key: requestKey, kind, entityId, cachedAt: new Date().toISOString(), payload: value, imagePath: null, sizeBytes: JSON.stringify(value).length }).catch(() => undefined)
            if (mounted.current && activeKey.current === requestKey) { setData(fresh); setSource('network'); setCachedAt(null) }
            await write
          } else if (mounted.current && activeKey.current === requestKey) {
            setData(fresh); setSource('network'); setCachedAt(null)
          }
          return
        } catch { /* use cache below */ }
      }
      const stored = await cache.get(requestKey)
      if (stored && mounted.current && activeKey.current === requestKey) { setData(stored.payload as T); setSource('cache'); setCachedAt(stored.cachedAt) }
    })()
    inFlight.current = { key: requestKey, request }
    try { await request } finally { if (inFlight.current?.request === request) inFlight.current = null }
  }, [cache, fetcher, key, network])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void refresh() })
    const listener = Promise.resolve()
      .then(() => network.addListener((status) => { if (active && status === 'online') void refresh() }))
      .catch(() => null)
    return () => { active = false; void listener.then((registered) => registered?.remove()) }
  }, [network, refresh])
  useNativeLifecycle(refresh)
  return { data, source, cachedAt, refresh }
}

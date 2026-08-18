import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlatformServices } from '@/platform/createPlatformServices'
import { useNativeLifecycle } from './useNativeLifecycle'
import type { CachedContent } from '@/platform/contracts'
import type { CachedPublicContentOptions } from '@/native/discovery/types'

type Status = 'loading' | 'success' | 'empty' | 'error'
const defaultEmpty = (value: unknown) => value == null || (Array.isArray(value) && value.length === 0) || (!!value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items) && (value as { items: unknown[] }).items.length === 0)

export function useCachedPublicContent<T>(key: string, fetcher: () => Promise<T>, options: CachedPublicContentOptions<T> = {}) {
  const { cache, network } = usePlatformServices()
  const enabled = options.enabled !== false
  const cachePolicy = options.cachePolicy ?? 'public'
  const isEmpty = options.isEmpty ?? defaultEmpty
  const [data, setData] = useState<T | null>(null)
  const [source, setSource] = useState<'network' | 'cache' | null>(null)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<Error | null>(null)
  const inFlight = useRef<{ key: string; request: Promise<void> } | null>(null)
  const activeKey = useRef(key)
  const mounted = useRef(false)
  const generation = useRef(0)
  activeKey.current = key
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1 } }, [])
  useEffect(() => { if (mounted.current) { generation.current += 1; setData(null); setSource(null); setCachedAt(null); setStatus('loading'); setError(null) } }, [key])
  const refresh = useCallback(async () => {
    if (!enabled || !mounted.current) return
    if (inFlight.current?.key === key) return inFlight.current.request
    const requestKey = key
    const requestGeneration = ++generation.current
    setStatus('loading'); setError(null)
    const visible = () => mounted.current && activeKey.current === requestKey && generation.current === requestGeneration
    const request = (async () => {
      const online = await network.getStatus() === 'online'
      let fetchError: Error | null = null
      if (online) {
        try {
          const fresh = await fetcher()
          const value = fresh as CachedContent
          const [prefix, ...rest] = requestKey.split(':')
          const kind = (value && typeof value === 'object' && 'kind' in value ? value.kind : prefix) as CachedContent['kind']
          const entityId = value && typeof value === 'object' && 'entityId' in value ? String(value.entityId) : rest.join(':') || requestKey
          if (['listing', 'business', 'event', 'bender'].includes(kind) && cachePolicy === 'public') {
            // A cache failure must never turn a successful network read into an error.
            const write = cache.put({ key: requestKey, kind, entityId, cachedAt: new Date().toISOString(), payload: value, imagePath: null, sizeBytes: JSON.stringify(value).length }).catch(() => undefined)
            if (visible()) { setData(fresh); setSource('network'); setCachedAt(null); setStatus(isEmpty(fresh) ? 'empty' : 'success') }
            await write
          } else if (visible()) {
            setData(fresh); setSource('network'); setCachedAt(null); setStatus(isEmpty(fresh) ? 'empty' : 'success')
          }
          return
        } catch (cause) {
          if (cachePolicy === 'none' && visible()) { setError(cause instanceof Error ? cause : new Error(String(cause))); setStatus('error'); return }
          fetchError = cause instanceof Error ? cause : new Error(String(cause))
          // Fall through to a public cache read.
        }
      } else {
        fetchError = null
      }
      if (cachePolicy === 'none') { if (visible()) { setError(fetchError ?? new Error('OFFLINE_NO_CACHE')); setStatus('error') }; return }
      let stored = null
      try { stored = await cache.get(requestKey) } catch { stored = null }
      if (stored && visible()) { const value = stored.payload as T; setData(value); setSource('cache'); setCachedAt(stored.cachedAt); setStatus(isEmpty(value) ? 'empty' : 'success'); setError(null) }
      else if (visible()) { setError(fetchError ?? new Error('OFFLINE_NO_CACHE')); setStatus('error') }
    })()
    inFlight.current = { key: requestKey, request }
    try { await request } finally { if (inFlight.current?.request === request) inFlight.current = null }
  }, [cache, cachePolicy, enabled, fetcher, isEmpty, key, network])
  useEffect(() => {
    if (!enabled) return
    let active = true
    queueMicrotask(() => { if (active) void refresh() })
    const listener = Promise.resolve()
      .then(() => network.addListener((status) => { if (active && status === 'online') void refresh() }))
      .catch(() => null)
    return () => { active = false; void listener.then((registered) => registered?.remove()) }
  }, [enabled, network, refresh])
  const lifecycleRefresh = useCallback(async () => {
    if (!mounted.current) return
    await refresh()
  }, [refresh])
  useNativeLifecycle(lifecycleRefresh)
  return { data, source, cachedAt, refresh, status, error }
}

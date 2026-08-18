import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listingApi } from '@/services/listingApi'
import { shopApi } from '@/services/shopApi'
import { eventApi } from '@/services/eventApi'
import { adaptBusiness, adaptEvent, adaptListing, adaptOpportunity } from '@/native/discovery/adapters'
import { toBusinessParams, toEventParams, toListingParams, toOpportunityParams } from '@/native/discovery/queries'
import type { NativeDiscoveryCardModel, NativeDiscoveryKind, NativeExploreQuery, NativeSectionState, NativeLocationState, NativeMapBusiness } from '@/native/discovery/types'
import { usePlatformServices } from '@/platform/createPlatformServices'
import { useCachedPublicContent } from './useCachedPublicContent'

export interface NativeExploreGroup { kind: NativeDiscoveryKind; heading: string; state: NativeSectionState<NativeDiscoveryCardModel[]> }
export interface NativeTypedResults { state: NativeSectionState<NativeDiscoveryCardModel[]>; hasMore: boolean; loadingMore: boolean; loadMoreError: Error | null; refineMessage: string | null; loadMore(): Promise<void> }
export interface NativeExploreViewModel { groups: NativeExploreGroup[]; typed: NativeTypedResults | null; mapBusinesses: NativeMapBusiness[]; userCoordinates: { latitude: number; longitude: number } | null; online: boolean | null; location: NativeLocationState; requestLocation(): Promise<NativeLocationState>; refreshAll(): Promise<void> }
const headings: Record<NativeDiscoveryKind, string> = { listing: 'Listings', business: 'Businesses', event: 'Events', volunteer: 'Volunteer' }
const items = <T,>(response: { data?: { items?: T[] } | T[] }): T[] => Array.isArray(response.data) ? response.data : response.data?.items ?? []
const empty = <T,>(value: T | null): T[] => Array.isArray(value) ? value as T[] : []
const cancelled = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'ERR_CANCELED')

export function useNativeExplore(query: NativeExploreQuery): NativeExploreViewModel {
  const services = usePlatformServices()
  const [location, setLocation] = useState<NativeLocationState>({ status: 'idle' })
  const [userCoordinates, setUserCoordinates] = useState<{ latitude: number; longitude: number } | null>(null)
  const [online, setOnline] = useState<boolean | null>(null)
  const [hydrated, setHydrated] = useState<Record<string, { latitude: number; longitude: number }>>({})
  const hydrationGeneration = useRef(0)
  const networkEventVersion = useRef(0)
  const hydrationScheduler = useRef<{ retry(): void } | null>(null)
  const hydrationPool = useRef({ active: 0, queue: [] as Array<{ generation: number; start: () => void }> })
  const drainHydrationPool = useCallback(() => { while (hydrationPool.current.active < 4 && hydrationPool.current.queue.length) hydrationPool.current.queue.shift()!.start() }, [])
  const sharedHydrationRequests = useRef(new Map<string, { promise: Promise<{ latitude: number; longitude: number } | null>; controller: AbortController; epoch: number }>())
  const networkEpoch = useRef(0)
  const hydrateShop = useCallback((id: string) => {
    const existing = sharedHydrationRequests.current.get(id)
    if (existing && existing.epoch === networkEpoch.current) return existing.promise
    existing?.controller.abort()
    sharedHydrationRequests.current.delete(id)
    const controller = new AbortController()
    const epoch = networkEpoch.current
    const request = shopApi.getShop(id, { signal: controller.signal }).then((response) => {
      const { latitude, longitude } = response.data
      if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
      return { latitude, longitude }
    }).catch(() => null)
    const entry = { promise: request, controller, epoch }
    sharedHydrationRequests.current.set(id, entry)
    void request.finally(() => { if (sharedHydrationRequests.current.get(id) === entry) sharedHydrationRequests.current.delete(id) })
    return request
  }, [])
  const locationInFlight = useRef<Promise<NativeLocationState> | null>(null)
  const queryKey = JSON.stringify(query); const { q, type, category, urgency, sort, mode, near } = query; const all = type === 'all'; const isDefault = !q && !category && !urgency && !sort && mode === 'list' && !near
  const requestQuery = useMemo(() => ({ q, type, category, urgency, sort, mode, near }), [q, type, category, urgency, sort, mode, near])
  const key = (kind: string, fallback: string) => isDefault ? fallback : `${kind}:native-explore:${queryKey}`; const options = { enabled: all, cachePolicy: isDefault ? 'public' as const : 'none' as const }
  const listing = useCachedPublicContent(key('listing', 'listing:native-explore-default'), useCallback(async () => items(await listingApi.browse(toListingParams({ ...requestQuery, type: 'all' }))), [requestQuery]), options)
  const business = useCachedPublicContent(key('business', 'business:native-explore-default'), useCallback(async () => items(await shopApi.directory(toBusinessParams({ ...requestQuery, type: 'all' }))), [requestQuery]), options)
  const event = useCachedPublicContent(key('event', 'event:native-explore-default'), useCallback(async () => items(await eventApi.list(toEventParams({ ...requestQuery, type: 'all' }))), [requestQuery]), options)
  const volunteer = useCachedPublicContent(key('listing', 'listing:native-explore-volunteer-default'), useCallback(async () => items(await listingApi.getOpportunities(toOpportunityParams({ ...requestQuery, type: 'all' }))), [requestQuery]), options)
  const refreshBusiness = useCallback(async () => { hydrationScheduler.current?.retry(); await business.refresh() }, [business.refresh])
  const groups: NativeExploreGroup[] = [
    { kind: 'listing', heading: headings.listing, state: { status: listing.status, data: empty(listing.data).slice(0, 5).map(adaptListing), source: listing.source, cachedAt: listing.cachedAt, error: listing.error, retry: listing.refresh } },
    { kind: 'business', heading: headings.business, state: { status: business.status, data: empty(business.data).slice(0, 5).map(adaptBusiness), source: business.source, cachedAt: business.cachedAt, error: business.error, retry: refreshBusiness } },
    { kind: 'event', heading: headings.event, state: { status: event.status, data: empty(event.data).slice(0, 5).map((item) => adaptEvent(item)), source: event.source, cachedAt: event.cachedAt, error: event.error, retry: event.refresh } },
    { kind: 'volunteer', heading: headings.volunteer, state: { status: volunteer.status, data: empty(volunteer.data).slice(0, 5).map(adaptOpportunity), source: volunteer.source, cachedAt: volunteer.cachedAt, error: volunteer.error, retry: volunteer.refresh } },
  ]
  const typedModel = useTyped(requestQuery, !all)
  const typedRetry = useCallback(async () => { hydrationScheduler.current?.retry(); await typedModel?.state.retry() }, [typedModel?.state.retry])
  const visibleBusinesses = all ? groups.find((group) => group.kind === 'business')?.state.data ?? [] : typedModel?.state.data ?? []
  useEffect(() => { let active = true; setOnline(null); networkEventVersion.current = 0; const listener = services.network.addListener((status) => { if (!active) return; networkEventVersion.current += 1; setOnline(status === 'online'); if (status === 'offline') { networkEpoch.current += 1; sharedHydrationRequests.current.forEach((entry) => entry.controller.abort()); sharedHydrationRequests.current.clear(); hydrationPool.current.queue = []; hydrationGeneration.current += 1; } }).catch(() => null); const initialVersion = networkEventVersion.current; void services.network.getStatus().then((status) => { if (active && networkEventVersion.current === initialVersion) setOnline(status === 'online') }).catch(() => { if (active && networkEventVersion.current === initialVersion) setOnline(false) }); return () => { active = false; void listener.then((value) => value?.remove()).catch(() => undefined) } }, [services.network])
  useEffect(() => () => { networkEpoch.current += 1; sharedHydrationRequests.current.forEach((entry) => entry.controller.abort()); sharedHydrationRequests.current.clear() }, [])
  useEffect(() => {
    if (online !== true) { hydrationScheduler.current = null; return }
    const generation = ++hydrationGeneration.current
    const candidates = visibleBusinesses.filter((item): item is NativeDiscoveryCardModel & { kind: 'business' } => item.kind === 'business').slice(0, all ? 5 : 20)
    const byId = new Map(candidates.map((item) => [item.id, item]))
    const queue: string[] = []
    const queued = new Set<string>()
    const inFlight = new Set<string>()
    const retryQueued = new Set<string>()
    const completed = new Set(candidates.filter((item) => item.coordinates || hydrated[item.id]).map((item) => item.id))
    let disposed = false
    const enqueue = (id: string) => { if (!queued.has(id) && !inFlight.has(id) && !completed.has(id)) { queued.add(id); queue.push(id) } }
    const pump = () => {
      while (queue.length && !disposed && hydrationGeneration.current === generation) {
        const id = queue.shift()!
        queued.delete(id)
        const item = byId.get(id)
        if (!item) continue
        hydrationPool.current.queue.push({ generation, start: () => {
          if (disposed || hydrationGeneration.current !== generation) { pump(); return }
          hydrationPool.current.active += 1
          inFlight.add(id)
          void hydrateShop(id).then((coordinates) => {
            const current = !disposed && hydrationGeneration.current === generation && online === true
            if (current && coordinates) { completed.add(id); setHydrated((previous) => ({ ...previous, [id]: coordinates })) }
          }).catch(() => undefined).finally(() => {
            hydrationPool.current.active -= 1
            inFlight.delete(id)
            if (retryQueued.delete(id) && !completed.has(id)) enqueue(id)
            pump()
            drainHydrationPool()
          })
        } })
      }
      drainHydrationPool()
    }
    const retry = () => { candidates.forEach((item) => { if (inFlight.has(item.id)) retryQueued.add(item.id); else if (!completed.has(item.id)) enqueue(item.id) }); pump() }
    hydrationScheduler.current = { retry }
    candidates.filter((item) => !item.coordinates && !hydrated[item.id]).forEach((item) => enqueue(item.id))
    pump()
    return () => { disposed = true; hydrationGeneration.current += 1; queue.length = 0; hydrationPool.current.queue = hydrationPool.current.queue.filter((job) => job.generation !== generation); if (hydrationScheduler.current?.retry === retry) hydrationScheduler.current = null; drainHydrationPool() }
  }, [all, online, visibleBusinesses.map((item) => item.id).join('|')])
  const mapBusinesses = visibleBusinesses.filter((item): item is NativeDiscoveryCardModel & { kind: 'business' } => item.kind === 'business').map((item) => ({ ...item, coordinates: item.coordinates ?? hydrated[item.id] ?? null })).filter((item): item is NativeMapBusiness => item.coordinates !== null).map((item) => ({ ...item, distanceMiles: userCoordinates ? haversine(userCoordinates.latitude, userCoordinates.longitude, item.coordinates.latitude, item.coordinates.longitude) : null }))
  const sortedTyped = typedModel && query.near && query.type === 'businesses' && userCoordinates ? { ...typedModel, state: { ...typedModel.state, data: [...typedModel.state.data].map((item) => { const coordinates = item.coordinates ?? hydrated[item.id]; return { item, distance: coordinates ? haversine(userCoordinates.latitude, userCoordinates.longitude, coordinates.latitude, coordinates.longitude) : null } }).sort((left, right) => (left.distance === null ? 1 : right.distance === null ? -1 : left.distance - right.distance)).map(({ item }) => item) } } : typedModel
  const requestLocation = useCallback(async () => { if (locationInFlight.current) return locationInFlight.current; setUserCoordinates(null); setLocation({ status: 'requesting' }); const request = (async () => { try { const position = await services.location.getForegroundPosition(); if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || position.latitude < -90 || position.latitude > 90 || position.longitude < -180 || position.longitude > 180) throw Object.assign(new Error('invalid coordinates'), { code: 'INVALID_COORDINATES' }); const coordinates = { latitude: position.latitude, longitude: position.longitude }; setUserCoordinates(coordinates); const granted = { status: 'granted' as const, ...coordinates }; setLocation(granted); return granted } catch (error) { setUserCoordinates(null); const value = error as { code?: string; message?: string }; const code = value?.code ?? ''; if (code === 'ERR_CANCELED' || code === 'CANCELLED' || /cancel/i.test(value?.message ?? '')) { setLocation({ status: 'idle' }); return { status: 'idle' as const } } const message = value?.message ?? 'Location is unavailable'; const denied = ['PERMISSION_DENIED', 'DENIED', 'RESTRICTED'].includes(code) || /denied|restricted|permission/i.test(message); const failure = denied ? { status: 'denied' as const, message } : { status: 'unavailable' as const, message }; setLocation(failure); return failure } })(); locationInFlight.current = request; void request.finally(() => { if (locationInFlight.current === request) locationInFlight.current = null }); return request }, [services.location])
  const refreshAll = useCallback(async () => { hydrationScheduler.current?.retry(); await Promise.allSettled([listing.refresh(), business.refresh(), event.refresh(), volunteer.refresh()]) }, [business.refresh, event.refresh, listing.refresh, volunteer.refresh]); const typed = all || !sortedTyped ? null : { ...sortedTyped, state: { ...sortedTyped.state, retry: typedRetry } }; return { groups, typed, mapBusinesses, userCoordinates, online, location, requestLocation, refreshAll }
}

function haversine(latitude1: number, longitude1: number, latitude2: number, longitude2: number) { const radians = (value: number) => value * Math.PI / 180; const dLat = radians(latitude2 - latitude1); const dLon = radians(longitude2 - longitude1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude1)) * Math.cos(radians(latitude2)) * Math.sin(dLon / 2) ** 2; return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) }

function useTyped(query: NativeExploreQuery, enabled: boolean): NativeTypedResults {
  const queryKey = JSON.stringify(query); const stateRef = useRef<NativeSectionState<NativeDiscoveryCardModel[]>>({ status: 'loading', data: [], source: null, cachedAt: null, error: null, retry: async () => undefined }); const [state, setState] = useState(stateRef.current); stateRef.current = state; const [hasMore, setHasMore] = useState(false); const [nextCursor, setNextCursor] = useState<string | null>(null); const [loadingMore, setLoadingMore] = useState(false); const [loadMoreError, setLoadMoreError] = useState<Error | null>(null); const [refineMessage, setRefineMessage] = useState<string | null>(null); const generation = useRef(0); const controller = useRef<AbortController | null>(null)
  const request = useCallback(async (cursor?: string) => { if (!enabled) return; const more = Boolean(cursor); const current = generation.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort; if (more) { setLoadingMore(true); setLoadMoreError(null) } else setState((previous) => ({ ...previous, status: 'loading', error: null })); try { const params = query.type === 'listings' ? toListingParams(query) : query.type === 'businesses' ? toBusinessParams(query) : query.type === 'events' ? toEventParams(query) : toOpportunityParams(query); if (cursor) params.cursor = cursor; const response = query.type === 'listings' ? await listingApi.browse(params, { signal: abort.signal }) : query.type === 'businesses' ? await shopApi.directory(params, { signal: abort.signal }) : query.type === 'events' ? await eventApi.list(params, { signal: abort.signal }) : await listingApi.getOpportunities(params, { signal: abort.signal }); if (current !== generation.current || abort.signal.aborted) return; const mapped = items(response).map((item) => query.type === 'listings' ? adaptListing(item) : query.type === 'businesses' ? adaptBusiness(item) : query.type === 'events' ? adaptEvent(item) : adaptOpportunity(item)); const data = more ? [...stateRef.current.data, ...mapped].filter((item, index, list) => list.findIndex((candidate) => `${candidate.kind}:${candidate.id}` === `${item.kind}:${item.id}`) === index) : mapped; const page = response.data as { has_more?: boolean; next_cursor?: string | null }; const validCursor = Boolean(page.has_more && page.next_cursor); setRefineMessage(query.type === 'businesses' && page.has_more && !page.next_cursor ? 'Refine your search to narrow businesses' : null); setState({ status: data.length ? 'success' : 'empty', data, source: 'network', cachedAt: null, error: null, retry: () => request() }); setHasMore(validCursor); setNextCursor(validCursor ? page.next_cursor! : null) } catch (error) { if (abort.signal.aborted || cancelled(error) || current !== generation.current) return; const issue = error instanceof Error ? error : new Error(String(error)); if (more) setLoadMoreError(issue); else setState((previous) => ({ ...previous, status: 'error', error: issue, retry: () => request() })) } finally { if (more) setLoadingMore(false) } }, [enabled, query])
  useEffect(() => {
    if (!enabled) return
    generation.current += 1
    controller.current?.abort()
    setState((previous) => ({ ...previous, status: 'loading', data: [], error: null, retry: async () => undefined }))
    setHasMore(false)
    setNextCursor(null)
    setLoadMoreError(null)
    setRefineMessage(null)
    void request()
    return () => controller.current?.abort()
  }, [enabled, queryKey, request])
  const loadMore = useCallback(async () => { if (enabled && !loadingMore && hasMore && nextCursor) await request(nextCursor) }, [enabled, loadingMore, hasMore, nextCursor, request]); return { state, hasMore, loadingMore, loadMoreError, refineMessage, loadMore }
}

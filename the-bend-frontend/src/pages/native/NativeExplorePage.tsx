import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NativeSearchBar } from '@/components/native/ui/NativeSearchBar'
import { NativeResultGroup } from '@/components/native/ui/NativeResultGroup'
import { NativeDiscoveryCard } from '@/components/native/ui/NativeDiscoveryCard'
import { NativeFilterSheet } from '@/components/native/ui/NativeFilterSheet'
import { NativeFilterChip } from '@/components/native/ui/NativeFilterChip'
import { PermissionPrimer } from '@/components/native/PermissionPrimer'
import { CachedContentNotice } from '@/components/native/CachedContentNotice'
import { NativeExploreTypeTabs, NATIVE_EXPLORE_TYPES } from '@/components/native/ui/NativeExploreTypeTabs'
import { NativeViewModeSwitch } from '@/components/native/ui/NativeViewModeSwitch'
import { useNativeExplore } from '@/hooks/useNativeExplore'
import { parseNativeExploreQuery, serializeNativeExploreQuery } from '@/native/discovery/queries'
import type { NativeDiscoveryCardModel } from '@/native/discovery/types'
import { getNativeMapAvailability } from '@/native/discovery/mapAvailability'

const NativeExploreMap = lazy(() => import('@/components/native/NativeExploreMap'))

const listingCategories = ['staff', 'materials', 'equipment']; const eventCategories = ['community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education']; const sorts = ['urgency_desc', 'created_desc', 'expiry_asc']

export function NativeExplorePage() {
  const [params, setParams] = useSearchParams(); const query = parseNativeExploreQuery(params); const requestedMapMode = params.get('mode') === 'map'; const queryRef = useRef(query); const canonicalKey = serializeNativeExploreQuery(query).toString(); const [text, setText] = useState(query.q); const [sheet, setSheet] = useState(false); const [selectedMapId, setSelectedMapId] = useState<string | null>(null); const trigger = useRef<HTMLButtonElement>(null); const timer = useRef<number | null>(null); const navigate = useNavigate(); const model = useNativeExplore(query)
  useEffect(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const sync = window.setTimeout(() => setText(query.q), 0)
    return () => window.clearTimeout(sync)
  }, [canonicalKey, query.q])
  useEffect(() => { queryRef.current = query }, [canonicalKey, query])
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const change = useCallback((next: Partial<typeof query>, replace = false) => setParams(serializeNativeExploreQuery({ ...queryRef.current, ...next }), { replace }), [queryRef, setParams])
  const submit = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; change({ q: text.trim() }) }
  const businessTypes = useMemo(() => Array.from(new Set((query.type === 'businesses' ? model.typed?.state.data ?? [] : model.groups.find((group) => group.kind === 'business')?.state.data ?? []).map((item) => item.label).filter(Boolean))), [model.groups, model.typed, query.type])
  const filterChoices = query.type === 'events' ? eventCategories : query.type === 'listings' ? listingCategories : query.type === 'businesses' ? businessTypes : query.type === 'all' ? [...listingCategories, ...eventCategories, ...businessTypes] : []
  const card = (item: NativeDiscoveryCardModel) => <NativeDiscoveryCard key={`${item.kind}:${item.id}`} item={item} onOpen={(path) => navigate(path)} />
  const filtersAllowed = query.type !== 'bender'
  const mapBusinesses = model.mapBusinesses ?? []
  const businessState = query.type === 'businesses' ? model.typed?.state : model.groups.find((group) => group.kind === 'business')?.state
  const mapAvailability = getNativeMapAvailability({ type: query.type, resultStatus: businessState?.status ?? 'loading', coordinateCount: mapBusinesses.length })
  const mapSelected = mapBusinesses.some((item) => item.id === selectedMapId) ? selectedMapId : null
  const requestCurrentLocation = async (forNear = false) => { const result = await model.requestLocation(); if (forNear) change({ near: result.status === 'granted' }) }
  useEffect(() => {
    if (query.type === 'businesses' && query.near && model.location.status !== 'granted') change({ near: false }, true)
  }, [change, model.location.status, query.near, query.type])
  useEffect(() => {
    if (!requestedMapMode) return
    if (mapAvailability.status === 'unsupported' || mapAvailability.status === 'empty') change({ mode: 'list' }, true)
  }, [change, mapAvailability.status, requestedMapMode])
  return <div className="native-explore-scroll" role="region" aria-label="Explore content">
    <h1 className="native-explore-title native-safe-area">Explore</h1>
    <NativeSearchBar value={text} label="Search Westmoreland" placeholder="Search Westmoreland" onChange={(value) => { setText(value); if (timer.current !== null) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { timer.current = null; change({ q: value }, true) }, 300) }} onSubmit={submit} onClear={() => { setText(''); if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; change({ q: '' }) }} />
    <NativeExploreTypeTabs value={query.type} panelId="native-explore-results" onChange={(type) => change({ type, category: null, urgency: null, sort: null, near: false })} />
    <div className="native-explore-controls">{mapAvailability.status === 'available' && <NativeViewModeSwitch value={query.mode} onChange={(mode) => change({ mode })} />}{query.type === 'businesses' && <button type="button" onClick={() => { if (!query.near) void requestCurrentLocation(true); else change({ near: false }) }}>{query.near ? 'Near me on' : 'Near me'}</button>}{filtersAllowed && <button ref={trigger} type="button" onClick={() => setSheet(true)}>Filters</button>}</div>
    {query.category && <NativeFilterChip label={query.category} removable onRemove={() => change({ category: null })} />}{query.urgency && <NativeFilterChip label={query.urgency} removable onRemove={() => change({ urgency: null })} />}{query.sort && <NativeFilterChip label={query.sort} removable onRemove={() => change({ sort: null })} />}{query.near && query.type === 'businesses' && <NativeFilterChip label="Near me" removable onRemove={() => change({ near: false })} />}
    {model.location && (model.location.status === 'denied' || model.location.status === 'unavailable') && query.type === 'businesses' && <PermissionPrimer title="Use your location for Near me" description={model.location.message} confirmLabel="Retry" onConfirm={() => void requestCurrentLocation(true)}><button type="button" onClick={() => change({ near: false })}>Continue across Westmoreland</button></PermissionPrimer>}
    <div id="native-explore-results" role="tabpanel" aria-labelledby={`native-explore-tab-${query.type}`}>
    {query.near && query.type === 'businesses' && <><h2>Near you within Westmoreland</h2>{(!model.userCoordinates || (model.typed?.state.data.some((item) => item.kind === 'business') && model.mapBusinesses.length < model.typed.state.data.filter((item) => item.kind === 'business').length)) && <p role="status">{model.mapBusinesses.length === 0 ? 'Distance unavailable for businesses; showing the current server order.' : 'Distance unavailable for some businesses; they remain in stable server order after distance-sorted businesses.'}</p>}</>}{query.mode === 'map' && mapAvailability.status === 'available' ? <section role="status"><h2>Business map</h2><Suspense fallback={<p>Loading map…</p>}><NativeExploreMap businesses={mapBusinesses} userCoordinates={model.userCoordinates ?? null} selectedId={mapSelected} onSelect={setSelectedMapId} onOpen={(path) => navigate(path)} /></Suspense>{query.type === 'all' && <p>Map scope: businesses only in Westmoreland.</p>}<button type="button" onClick={() => void requestCurrentLocation()}>Use my location</button></section> : query.type === 'all' ? model.groups.map((group) => <NativeResultGroup key={group.kind} heading={group.heading} status={group.state.status} onRetry={group.state.retry} onSeeAll={() => change({ type: group.kind === 'listing' ? 'listings' : group.kind === 'business' ? 'businesses' : group.kind === 'event' ? 'events' : group.kind === 'bender' ? 'bender' : 'volunteer' })}><CachedContentNotice cachedAt={group.state.cachedAt} />{group.state.data.map(card)}</NativeResultGroup>) : model.typed && <NativeResultGroup heading={NATIVE_EXPLORE_TYPES.find(([, type]) => type === query.type)?.[0] ?? 'Results'} status={model.typed.state.status} onRetry={model.typed.state.retry}>{model.typed.state.data.map(card)}{model.typed.hasMore && <button type="button" onClick={() => void model.typed?.loadMore()} disabled={model.typed.loadingMore}>Load more</button>}{model.typed.refineMessage && <p>{model.typed.refineMessage}</p>}{model.typed.loadMoreError && <p role="alert">Unable to load more results.</p>}</NativeResultGroup>}
    </div>
    {filtersAllowed && <NativeFilterSheet open={sheet} onClose={() => setSheet(false)} returnFocusRef={trigger}><h3>Filter options</h3>{filterChoices.map((value) => <button key={value} type="button" onClick={() => { change({ category: value }); setSheet(false) }}>{value}</button>)}{(query.type === 'listings' || query.type === 'volunteer') && <><button type="button" onClick={() => { change({ urgency: 'urgent' }); setSheet(false) }}>urgent</button><button type="button" onClick={() => { change({ urgency: 'normal' }); setSheet(false) }}>normal</button></>}{(query.type === 'listings' || query.type === 'volunteer') && sorts.map((value) => <button key={value} type="button" onClick={() => { change({ sort: value }); setSheet(false) }}>{value}</button>)}<button type="button" onClick={() => { change({ category: null, urgency: null, sort: null }); setSheet(false) }}>Clear filters</button></NativeFilterSheet>}
  </div>
}
export default NativeExplorePage

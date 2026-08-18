import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NativeSearchBar } from '@/components/native/ui/NativeSearchBar'
import { NativeResultGroup } from '@/components/native/ui/NativeResultGroup'
import { NativeDiscoveryCard } from '@/components/native/ui/NativeDiscoveryCard'
import { NativeFilterSheet } from '@/components/native/ui/NativeFilterSheet'
import { NativeFilterChip } from '@/components/native/ui/NativeFilterChip'
import { useNativeExplore } from '@/hooks/useNativeExplore'
import { parseNativeExploreQuery, serializeNativeExploreQuery } from '@/native/discovery/queries'
import type { NativeDiscoveryCardModel, NativeExploreType } from '@/native/discovery/types'

const chips: Array<[string, NativeExploreType]> = [['All', 'all'], ['Listings', 'listings'], ['Businesses', 'businesses'], ['Events', 'events'], ['Volunteer', 'volunteer']]
const listingCategories = ['staff', 'materials', 'equipment']; const eventCategories = ['community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education']; const sorts = ['urgency_desc', 'created_desc', 'expiry_asc']

export function NativeExplorePage() {
  const [params, setParams] = useSearchParams(); const query = parseNativeExploreQuery(params); const [text, setText] = useState(query.q); const [sheet, setSheet] = useState(false); const trigger = useRef<HTMLButtonElement>(null); const timer = useRef<number | null>(null); const navigate = useNavigate(); const model = useNativeExplore(query)
  useEffect(() => { const sync = window.setTimeout(() => { if (!timer.current) setText(query.q) }, 0); return () => window.clearTimeout(sync) }, [query.q])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const change = (next: Partial<typeof query>, replace = false) => setParams(serializeNativeExploreQuery({ ...query, ...next }), { replace })
  const submit = () => { if (timer.current) window.clearTimeout(timer.current); timer.current = null; change({ q: text.trim() }) }
  const businessTypes = useMemo(() => Array.from(new Set(model.groups.flatMap((group) => group.kind === 'business' ? group.state.data.map((item) => item.label).filter(Boolean) : []))), [model.groups])
  const filterChoices = query.type === 'events' ? eventCategories : query.type === 'listings' ? listingCategories : query.type === 'businesses' ? businessTypes : query.type === 'all' ? [...listingCategories, ...eventCategories, ...businessTypes] : []
  const card = (item: NativeDiscoveryCardModel) => <NativeDiscoveryCard key={`${item.kind}:${item.id}`} item={item} onOpen={(path) => navigate(path)} />
  return <div className="native-explore-scroll" role="region" aria-label="Explore content">
    <h1>Explore</h1>
    <NativeSearchBar value={text} label="Search Westmoreland" placeholder="Search Westmoreland" onChange={(value) => { setText(value); if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { timer.current = null; change({ q: value }, true) }, 300) }} onSubmit={submit} onClear={() => { setText(''); if (timer.current) window.clearTimeout(timer.current); timer.current = null; change({ q: '' }) }} />
    <div role="tablist" aria-label="Explore types">{chips.map(([label, type]) => <button key={type} type="button" role="tab" aria-selected={query.type === type} onClick={() => change({ type, category: null, urgency: null, sort: null })}>{label}</button>)}</div>
    <div className="native-explore-controls"><button type="button" onClick={() => change({ mode: query.mode === 'list' ? 'map' : 'list' })}>{query.mode === 'list' ? 'Map' : 'List'}</button><button type="button" onClick={() => change({ near: !query.near })}>{query.near ? 'Near me on' : 'Near me'}</button><button ref={trigger} type="button" onClick={() => setSheet(true)}>Filters</button></div>
    {query.category && <NativeFilterChip label={query.category} removable onRemove={() => change({ category: null })} />}{query.urgency && <NativeFilterChip label={query.urgency} removable onRemove={() => change({ urgency: null })} />}{query.sort && <NativeFilterChip label={query.sort} removable onRemove={() => change({ sort: null })} />}{query.mode === 'map' && <NativeFilterChip label="Map" removable onRemove={() => change({ mode: 'list' })} />}{query.near && <NativeFilterChip label="Near me" removable onRemove={() => change({ near: false })} />}
    {query.mode === 'map' ? <section role="status"><h2>Map view</h2><p>Map preview will be available when location support is enabled.</p></section> : query.type === 'all' ? model.groups.map((group) => <NativeResultGroup key={group.kind} heading={group.heading} status={group.state.status} onRetry={group.state.retry} onSeeAll={() => change({ type: group.kind === 'listing' ? 'listings' : group.kind === 'business' ? 'businesses' : group.kind === 'event' ? 'events' : 'volunteer' })}>{group.state.data.map(card)}</NativeResultGroup>) : model.typed && <NativeResultGroup heading={chips.find(([, type]) => type === query.type)?.[0] ?? 'Results'} status={model.typed.state.status} onRetry={model.typed.state.retry}>{model.typed.state.data.map(card)}{model.typed.hasMore && <button type="button" onClick={() => void model.typed?.loadMore()} disabled={model.typed.loadingMore}>Load more</button>}{model.typed.refineMessage && <p>{model.typed.refineMessage}</p>}{model.typed.loadMoreError && <p role="alert">Unable to load more results.</p>}</NativeResultGroup>}
    <NativeFilterSheet open={sheet} onClose={() => setSheet(false)} returnFocusRef={trigger}><h3>Filter options</h3>{filterChoices.map((value) => <button key={value} type="button" onClick={() => { change({ category: value }); setSheet(false) }}>{value}</button>)}{query.type !== 'businesses' && <><button type="button" onClick={() => { change({ urgency: 'urgent' }); setSheet(false) }}>urgent</button><button type="button" onClick={() => { change({ urgency: 'normal' }); setSheet(false) }}>normal</button></>}{(query.type === 'listings' || query.type === 'volunteer') && sorts.map((value) => <button key={value} type="button" onClick={() => { change({ sort: value }); setSheet(false) }}>{value}</button>)}<button type="button" onClick={() => { change({ category: null, urgency: null, sort: null }); setSheet(false) }}>Clear filters</button></NativeFilterSheet>
  </div>
}
export default NativeExplorePage

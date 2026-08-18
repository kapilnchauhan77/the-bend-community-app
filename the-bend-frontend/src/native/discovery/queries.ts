import type { NativeExploreQuery, NativeExploreType } from './types'

const types: NativeExploreType[] = ['all', 'listings', 'businesses', 'events', 'volunteer']
const categories = ['staff', 'materials', 'equipment', 'volunteer', 'community', 'music', 'art', 'food', 'market', 'historic', 'outdoor', 'education']
const sorts = ['newest', 'relevance', 'soonest']
export function parseNativeExploreQuery(params: URLSearchParams): NativeExploreQuery {
  const type = types.includes(params.get('type') as NativeExploreType) ? params.get('type') as NativeExploreType : 'all'
  const urgency = params.get('urgency') === 'urgent' || params.get('urgency') === 'normal' ? params.get('urgency') as NativeExploreQuery['urgency'] : null
  const category = params.get('category')
  const sort = params.get('sort')
  return { q: params.get('q')?.trim() ?? '', type, category: category && categories.includes(category) ? category : null, urgency, sort: sort && sorts.includes(sort) ? sort : null, mode: params.get('mode') === 'map' ? 'map' : 'list', near: params.get('near') === 'true' }
}

export function serializeNativeExploreQuery(query: NativeExploreQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.q.trim()) params.set('q', query.q.trim())
  if (query.type !== 'all') params.set('type', query.type)
  if (query.category) params.set('category', query.category)
  if (query.urgency) params.set('urgency', query.urgency)
  if (query.sort) params.set('sort', query.sort)
  if (query.mode !== 'list') params.set('mode', query.mode)
  if (query.near) params.set('near', 'true')
  return params
}

type Params = Record<string, string | number | boolean | undefined>
function shared(query: NativeExploreQuery): Params { return { search: query.q || undefined, category: query.category || undefined, sort: query.sort || undefined } }
function allLimit(query: NativeExploreQuery): Params { return query.type === 'all' ? { limit: 5 } : {} }

export function toListingParams(query: NativeExploreQuery): Params { return { ...shared(query), urgency: query.urgency || undefined, ...allLimit(query) } }
export function toBusinessParams(query: NativeExploreQuery): Params { return { ...shared(query), ...allLimit(query) } }
export function toEventParams(query: NativeExploreQuery): Params { return { ...shared(query), ...allLimit(query) } }
export function toOpportunityParams(query: NativeExploreQuery): Params { return { ...shared(query), urgency: query.urgency || undefined, ...allLimit(query) } }

export type NativeDiscoveryKind = 'listing' | 'business' | 'event' | 'volunteer'
export type NativeExploreType = 'all' | 'listings' | 'businesses' | 'events' | 'volunteer'
export type NativeSectionStatus = 'loading' | 'success' | 'empty' | 'error'

export interface NativeSectionState<T> {
  status: NativeSectionStatus
  data: T
  source: 'network' | 'cache' | null
  cachedAt: string | null
  error: Error | null
  retry(): Promise<void>
}

export interface NativeExploreQuery {
  q: string
  type: NativeExploreType
  category: string | null
  urgency: 'normal' | 'urgent' | null
  sort: string | null
  mode: 'list' | 'map'
  near: boolean
}

export interface NativeDiscoveryCardModel {
  id: string
  kind: NativeDiscoveryKind
  label: string
  title: string
  supportingText: string
  thumbnailUrl: string | null
  targetPath: string
  coordinates: { latitude: number; longitude: number } | null
  urgent: boolean
}

export interface ItemsResponse<T> { items: T[] }
export interface CachedPublicContentOptions<T> {
  isEmpty?(value: T): boolean
  enabled?: boolean
  cachePolicy?: 'public' | 'none'
}

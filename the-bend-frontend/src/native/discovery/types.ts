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

export interface NativeMapBusiness extends NativeDiscoveryCardModel {
  kind: 'business'
  coordinates: { latitude: number; longitude: number }
  distanceMiles: number | null
}

export type NativeLocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied'; message: string }
  | { status: 'unavailable'; message: string }

export interface NativeExploreMapProps {
  businesses: NativeMapBusiness[]
  userCoordinates: { latitude: number; longitude: number } | null
  selectedId: string | null
  onSelect(id: string): void
  onOpen(path: string): void
}

export interface ItemsResponse<T> { items: T[] }
export interface CachedPublicContentOptions<T> {
  isEmpty?(value: T): boolean
  enabled?: boolean
  cachePolicy?: 'public' | 'none'
}

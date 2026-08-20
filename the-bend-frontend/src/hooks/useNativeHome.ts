import { useCallback, useMemo } from 'react'
import { listingApi } from '@/services/listingApi'
import { eventApi } from '@/services/eventApi'
import { sponsorApi } from '@/services/sponsorApi'
import { benderApi } from '@/services/benderApi'
import { useCachedPublicContent } from './useCachedPublicContent'
import { adaptEvent, adaptListing, adaptOpportunity } from '@/native/discovery/adapters'
import type { SuccessStory, Sponsor, Listing, CommunityEvent, BenderPost } from '@/types'
import type { NativeDiscoveryCardModel, NativeSectionState } from '@/native/discovery/types'

const items = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) return (value as { items: T[] }).items
  throw new Error('Malformed public content response')
}
const section = <T>(state: ReturnType<typeof useCachedPublicContent<T>>): NativeSectionState<T[]> => ({ status: state.status, data: state.data ?? [], source: state.source, cachedAt: state.cachedAt, error: state.error, retry: state.refresh })

export function useNativeHome(now?: Date) {
  const effectiveNow = useMemo(() => now ?? new Date(), [now])
  const urgentFetcher = useCallback(async () => items<Listing>((await listingApi.browse({ urgency: 'urgent', limit: 3 })).data).map((value) => adaptListing(value)), [])
  const upcomingFetcher = useCallback(async () => items<CommunityEvent>((await eventApi.getUpcoming(3)).data).map((value) => adaptEvent(value, 'en-US', effectiveNow)), [effectiveNow])
  const opportunitiesFetcher = useCallback(async () => items<Listing>((await listingApi.getOpportunities({ limit: 5 })).data).map((value) => adaptOpportunity(value)), [])
  const benderFetcher = useCallback(async () => items<BenderPost>((await benderApi.listPosts(undefined, 2)).data).slice(0, 2), [])
  const highlightsFetcher = useCallback(async () => items<SuccessStory>((await listingApi.getStories({ featured: 'true', limit: '3' })).data), [])
  const partnersFetcher = useCallback(async () => items<Sponsor>((await sponsorApi.list('homepage')).data), [])
  const urgent = useCachedPublicContent('listing:native-home-urgent', urgentFetcher)
  const upcoming = useCachedPublicContent('event:native-home-upcoming', upcomingFetcher)
  const opportunities = useCachedPublicContent('listing:native-home-opportunities', opportunitiesFetcher)
  const bender = useCachedPublicContent('bender:native-home-preview', benderFetcher, { cachePolicy: 'none' })
  const highlights = useCachedPublicContent('listing:native-home-highlights', highlightsFetcher, { cachePolicy: 'none' })
  const partners = useCachedPublicContent('listing:native-home-partners', partnersFetcher, { cachePolicy: 'none' })
  return useMemo(() => ({ urgent: section(urgent), upcoming: section(upcoming), opportunities: section(opportunities), bender: section(bender), highlights: section(highlights), partners: section(partners) }), [urgent, upcoming, opportunities, bender, highlights, partners])
}

export type { NativeDiscoveryCardModel }

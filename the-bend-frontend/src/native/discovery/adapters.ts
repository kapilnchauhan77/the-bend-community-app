import type { CommunityEvent, Listing, Shop } from '@/types'
import type { NativeDiscoveryCardModel } from './types'

function publicCoordinates(shop: Shop) {
  const { latitude, longitude } = shop
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function adaptListing(listing: Listing, _locale = 'en-US'): NativeDiscoveryCardModel {
  void _locale
  return { id: listing.id, kind: 'listing', label: listing.shop?.business_type ?? listing.category, title: listing.title, supportingText: listing.shop?.name ?? listing.posted_by?.name ?? '', thumbnailUrl: listing.images[0]?.thumbnail_url ?? listing.images[0]?.url ?? null, targetPath: `/listing/${listing.id}`, coordinates: null, urgent: listing.urgency === 'urgent' }
}

export function adaptOpportunity(listing: Listing, locale = 'en-US'): NativeDiscoveryCardModel {
  return { ...adaptListing(listing, locale), kind: 'volunteer' }
}

export function adaptBusiness(shop: Shop, _locale = 'en-US'): NativeDiscoveryCardModel {
  void _locale
  return { id: shop.id, kind: 'business', label: shop.business_type, title: shop.name, supportingText: shop.address ?? '', thumbnailUrl: shop.avatar_url ?? null, targetPath: `/business/${shop.id}`, coordinates: publicCoordinates(shop), urgent: false }
}

export function adaptEvent(event: CommunityEvent, locale = 'en-US', now = new Date()): NativeDiscoveryCardModel {
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(event.start_date))
  const isPast = new Date(event.start_date).getTime() < now.getTime()
  return { id: event.id, kind: 'event', label: event.category, title: event.title, supportingText: `${date} · ${event.location ?? (isPast ? 'Past event' : 'Community event')}`, thumbnailUrl: event.image_url ?? null, targetPath: `/events/${event.id}`, coordinates: null, urgent: false }
}

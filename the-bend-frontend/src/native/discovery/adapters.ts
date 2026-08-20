import type { BenderPost, CommunityEvent, Listing, Shop } from '@/types'
import { isVideoUrl } from '@/lib/utils'
import { getSafeBenderPreview } from './benderPresentation'
import type { NativeDiscoveryCardModel } from './types'
import { benderPostPath } from '@/routes/benderRoutes'

function publicCoordinates(shop: Shop) {
  const { latitude, longitude } = shop
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function humanizeLabel(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!normalized) return normalized
  if (!/[_-]/.test(value)) return normalized.length === normalized.toLowerCase().length && !normalized.includes(' ') ? `${normalized[0]!.toUpperCase()}${normalized.slice(1)}` : normalized
  return normalized.split(' ').map((word) => {
    if (!word) return word
    if (/[a-z][A-Z]/.test(word)) return word
    const machineWord = word === word.toUpperCase() ? word.toLowerCase() : word
    return machineWord[0]!.toUpperCase() + machineWord.slice(1)
  }).join(' ')
}

export function adaptListing(listing: Listing, _locale = 'en-US'): NativeDiscoveryCardModel {
  void _locale
  return { id: listing.id, kind: 'listing', label: humanizeLabel(listing.shop?.business_type ?? listing.category), title: listing.title, supportingText: listing.shop?.name ?? listing.posted_by?.name ?? '', thumbnailUrl: listing.images[0]?.thumbnail_url ?? listing.images[0]?.url ?? null, mediaFit: 'cover', targetPath: `/listing/${listing.id}`, coordinates: null, urgent: listing.urgency === 'urgent' }
}

export function adaptOpportunity(listing: Listing, locale = 'en-US'): NativeDiscoveryCardModel {
  return { ...adaptListing(listing, locale), kind: 'volunteer' }
}

export function adaptBusiness(shop: Shop, _locale = 'en-US'): NativeDiscoveryCardModel {
  void _locale
  return { id: shop.id, kind: 'business', label: humanizeLabel(shop.business_type), title: shop.name, supportingText: shop.address ?? '', thumbnailUrl: shop.avatar_url ?? null, mediaFit: 'contain', targetPath: `/business/${shop.id}`, coordinates: publicCoordinates(shop), urgent: false }
}

export function adaptEvent(event: CommunityEvent, locale = 'en-US', now = new Date()): NativeDiscoveryCardModel {
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(event.start_date))
  const isPast = new Date(event.start_date).getTime() < now.getTime()
  return { id: event.id, kind: 'event', label: humanizeLabel(event.category), title: event.title, supportingText: `${date} · ${event.location ?? (isPast ? 'Past event' : 'Community event')}`, thumbnailUrl: event.image_url ?? null, mediaFit: 'cover', targetPath: `/events/${event.id}`, coordinates: null, urgent: false }
}

export function adaptBender(post: BenderPost): NativeDiscoveryCardModel {
  const author = post.author.shop_name?.trim() || post.author.name.trim() || 'Community member'
  const caption = post.caption?.trim()
  const { previewUrl } = getSafeBenderPreview(post)
  const avatarUrl = post.author.avatar_url && !isVideoUrl(post.author.avatar_url) ? post.author.avatar_url : null
  const thumbnailUrl = previewUrl || avatarUrl
  return { id: post.id, kind: 'bender', label: 'Bender', title: caption || `Post from ${author}`, supportingText: author, thumbnailUrl, mediaFit: 'cover', targetPath: benderPostPath(post.id), coordinates: null, urgent: false }
}

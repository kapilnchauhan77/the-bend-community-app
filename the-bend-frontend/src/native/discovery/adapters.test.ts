import { describe, expect, it } from 'vitest'
import type { BenderPost, CommunityEvent, Listing, Shop } from '@/types'
import { adaptBender, adaptBusiness, adaptEvent, adaptListing, adaptOpportunity, humanizeLabel } from './adapters'

const listing: Listing = {
  id: 'listing-1', shop: { id: 'shop-1', name: 'Westmoreland Works', business_type: 'Generator Repair', avatar_url: '/owner.png' },
  posted_by: { id: 'user-1', name: 'Pat Owner', avatar_url: '/owner.png' }, type: 'offer', category: 'equipment',
  title: 'Portable generator', description: 'Ready to share', is_free: true, urgency: 'urgent', status: 'active',
  interest_count: 0, images: [{ url: '/full.jpg', thumbnail_url: '/thumb.jpg' }], created_at: '2026-08-18T00:00:00Z',
}

const shop: Shop = {
  id: 'shop-1', name: 'Westmoreland Works', business_type: 'Repair', address: '1 Main St', latitude: 40.1, longitude: -79.5, status: 'active', avatar_url: '/avatar.png',
}

const event: CommunityEvent = {
  id: 'event-1', title: 'Market day', description: 'Gathering', start_date: '2026-08-20T12:00:00Z', location: 'Main street', category: 'market', image_url: '/event.jpg', source: 'public', is_featured: false, status: 'active', created_at: '2026-08-18T00:00:00Z',
}

const benderPost: BenderPost = {
  id: 'post-1', author: { id: 'author-1', name: 'Pat Owner', shop_id: 'shop-1', shop_name: 'Westmoreland Works', avatar_url: '/author.jpg' },
  caption: 'Fresh produce this weekend', media_url: '/uploads/bender/post.mp4', media_thumbnail_url: '/uploads/bender/post-thumb.jpg', media_type: 'video',
  like_count: 3, comment_count: 2, viewer_has_liked: false, created_at: '2026-08-18T00:00:00Z',
}

describe('native discovery adapters', () => {
  it.each([
    ['staff', 'Staff'], ['generator-repair', 'Generator Repair'], ['  Already Human  ', 'Already Human'], ['community_events', 'Community Events'],
  ])('humanizes %s labels as %s', (value, expected) => { expect(humanizeLabel(value)).toBe(expected) })
  it.each([
    ['iPhone repair', 'iPhone repair'],
    ['eBay services', 'eBay services'],
    ['Westmoreland works', 'Westmoreland works'],
    ['PUBLIC_SERVICES_UTILITIES', 'Public Services Utilities'],
    ['iPhone_repair', 'iPhone Repair'],
    ['eBay_services', 'eBay Services'],
    ['Already Human Title', 'Already Human Title'],
  ])('preserves human casing for %s', (value, expected) => { expect(humanizeLabel(value)).toBe(expected) })
  it('maps a listing to its public card and direct path', () => {
    expect(adaptListing(listing, 'en-US')).toMatchObject({ id: 'listing-1', kind: 'listing', title: 'Portable generator', label: 'Generator Repair', thumbnailUrl: '/thumb.jpg', targetPath: '/listing/listing-1', urgent: true, coordinates: null })
  })

  it('normalizes an opportunity as volunteer and never exposes coordinates', () => {
    expect(adaptOpportunity({ ...listing, category: 'volunteer' }, 'en-US')).toMatchObject({ kind: 'volunteer', targetPath: '/listing/listing-1', coordinates: null })
  })

  it('maps public business fields and valid coordinates', () => {
    expect(adaptBusiness(shop, 'en-US')).toMatchObject({ kind: 'business', supportingText: '1 Main St', thumbnailUrl: '/avatar.png', targetPath: '/business/shop-1', coordinates: { latitude: 40.1, longitude: -79.5 } })
  })

  it.each([
    { latitude: Number.NaN, longitude: -79.5 }, { latitude: 91, longitude: -79.5 }, { latitude: 40.1, longitude: 181 },
  ])('rejects invalid business coordinates', (coordinates) => {
    expect(adaptBusiness({ ...shop, ...coordinates }, 'en-US').coordinates).toBeNull()
  })

  it('maps an event date and location and keeps coordinates private', () => {
    expect(adaptEvent(event, 'en-US', new Date('2026-08-18T00:00:00Z'))).toMatchObject({ kind: 'event', supportingText: expect.stringContaining('Main street'), thumbnailUrl: '/event.jpg', targetPath: '/events/event-1', coordinates: null })
  })

  it('maps a Bender post to a focused native card without exposing social viewer state', () => {
    expect(adaptBender(benderPost)).toEqual({
      id: 'post-1', kind: 'bender', label: 'Bender', title: 'Fresh produce this weekend', supportingText: 'Westmoreland Works',
      thumbnailUrl: '/uploads/bender/post-thumb.jpg', targetPath: '/bender?post=post-1', coordinates: null, urgent: false,
    })
  })

  it('never renders a video asset as a discovery image when its thumbnail is missing', () => {
    expect(adaptBender({ ...benderPost, caption: null, media_thumbnail_url: null }).thumbnailUrl).toBe('/author.jpg')
    expect(adaptBender({ ...benderPost, caption: null, media_thumbnail_url: null }).title).toBe('Post from Westmoreland Works')
    expect(adaptBender({ ...benderPost, media_type: 'image', media_url: '/uploads/mislabeled.mp4', media_thumbnail_url: null, author: { ...benderPost.author, avatar_url: null } }).thumbnailUrl).toBeNull()
    expect(adaptBender({ ...benderPost, media_type: 'image', media_url: '/uploads/full.jpg', media_thumbnail_url: '/uploads/not-a-thumbnail.mp4' }).thumbnailUrl).toBe('/uploads/full.jpg')
  })
})

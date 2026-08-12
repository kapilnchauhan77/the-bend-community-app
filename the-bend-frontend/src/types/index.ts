// Enums
export type UserRole = 'super_admin' | 'community_admin' | 'shop_admin' | 'shop_employee' | 'individual';
export type ShopStatus = 'pending' | 'active' | 'suspended';
export type ListingType = 'offer' | 'request';
export type ListingCategory = 'staff' | 'materials' | 'equipment' | 'volunteer';
export type UrgencyLevel = 'normal' | 'urgent';
export type ListingStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';
export type PricingType = 'free' | 'fixed' | 'hourly' | 'range' | 'custom';

// Models
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  shop_id?: string;
  avatar_url?: string;
}

export interface Shop {
  id: string;
  name: string;
  business_type: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  contact_phone?: string;
  whatsapp?: string;
  status: ShopStatus;
  active_listings_count?: number;
  total_fulfilled?: number;
  endorsement_count?: number;
  member_since?: string;
  avatar_url?: string;
}

export interface ListingImage {
  url: string;
  thumbnail_url?: string;
}

export interface Listing {
  id: string;
  shop: {
    id: string;
    name: string;
    business_type: string;
    avatar_url?: string;
  } | null;
  posted_by: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  type: ListingType;
  category: ListingCategory;
  title: string;
  description: string;
  quantity?: string;
  unit?: string;
  expiry_date?: string;
  pricing_type?: PricingType;
  price?: number;
  price_max?: number;
  price_unit?: string;
  price_text?: string;
  is_free: boolean;
  urgency: UrgencyLevel;
  status: ListingStatus;
  interest_count: number;
  images: ListingImage[];
  created_at: string;
}

export interface ListingDetail extends Listing {
  shop:
    | (NonNullable<Listing['shop']> & {
        contact_phone: string;
        whatsapp?: string;
        address?: string;
      })
    | null;
  viewer_has_interest: boolean;
  viewer_has_saved: boolean;
  views_count: number;
}

export interface MessageThread {
  id: string;
  listing?: {
    id: string;
    title: string;
    urgency: UrgencyLevel;
  };
  other_party: {
    id: string;
    name: string;
    shop_name: string;
    avatar_url?: string;
  };
  last_message?: {
    content: string;
    sender_id: string;
    created_at: string;
    attachment_url?: string | null;
    attachment_type?: 'image' | 'video' | 'audio' | null;
    attachment_thumbnail_url?: string | null;
  };
  unread_count: number;
  last_message_at: string;
}

export interface ReferenceCard {
  type: 'listing' | 'shop' | 'bender' | 'user';
  id: string;
  title?: string;
  subtitle?: string;
  image_url?: string | null;
  url?: string | null;
  unavailable?: boolean;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  read_at?: string;
  created_at: string;
  // Phase 2 + 3: optional photo, 9 s video, or 9 s voice note on the message.
  attachment_url?: string | null;
  attachment_type?: 'image' | 'video' | 'audio' | null;
  attachment_thumbnail_url?: string | null;
  // Phase 4: optional entity reference card (listing/shop/bender/user) attached to the message.
  reference?: ReferenceCard | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  next_cursor?: string;
  has_more: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
  shop?: Shop;
}

export interface Volunteer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  skills: string;
  available_time: string;
  photo_url?: string;
  user_id?: string | null;
  created_at: string;
}

export interface Talent {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  category: 'freelancer' | 'musician' | 'artist';
  skills: string;
  available_time: string;
  rate: number;
  rate_unit: 'hr' | 'gig' | 'day';
  photo_url?: string;
  user_id?: string | null;
  created_at: string;
}

export type EventCategory = 'community' | 'music' | 'art' | 'food' | 'market' | 'historic' | 'outdoor' | 'education';
export type ConnectorType = 'ics' | 'rss' | 'html';

export interface CommunityEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  location?: string;
  category: EventCategory;
  image_url?: string;
  source: string;
  source_url?: string;
  is_featured: boolean;
  status: string;
  created_at: string;
}

export interface EventConnector {
  id: string;
  name: string;
  type: ConnectorType;
  url: string;
  category: EventCategory;
  is_active: boolean;
  config?: Record<string, string>;
  last_synced_at?: string;
  last_sync_count?: number;
  last_sync_error?: string;
  created_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  banner_url?: string;
  website_url?: string;
  placement: string;
}

export interface AdPricing {
  id: string;
  name: string;
  description?: string;
  placement: string;
  duration_days: number;
  price_cents: number;
}

export interface Tenant {
  slug: string;
  display_name: string;
  tagline?: string;
  about_text?: string;
  hero_image_url?: string;
  logo_url?: string;
  primary_color: string;
  footer_text?: string;
  sponsor_strip_label?: string;
}

export interface TenantAdmin {
  id: string;
  slug: string;
  subdomain: string;
  display_name: string;
  tagline?: string;
  about_text?: string;
  hero_image_url?: string;
  logo_url?: string;
  primary_color: string;
  footer_text?: string;
  sponsor_strip_label?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ReferralStatus = 'pending' | 'contacted' | 'demo_scheduled' | 'launched' | 'expired';

export interface TenantReferral {
  id: string;
  referrer_tenant_id: string;
  referrer_tenant_name?: string;
  referrer_user_id?: string;
  referrer_user_name?: string;
  referred_email: string;
  referred_name: string;
  referred_county_name: string;
  referred_message?: string;
  status: ReferralStatus;
  reward_type: 'free_months' | 'credit' | 'revshare';
  reward_amount?: number;
  reward_granted_at?: string;
  resulting_tenant_id?: string;
  super_admin_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ReferralSummary {
  total_referrals: number;
  launched: number;
  free_months_earned: number;
}

export interface SuccessStory {
  id: string;
  listing_id: string;
  listing_title: string;
  listing_category: string;
  shop_name: string;
  shop_id?: string;
  author_name: string;
  quote: string;
  is_featured: boolean;
  created_at: string;
}

// Bender — Instagram-style community feed.
// Author may be an individual OR a shop-affiliated user — when shop_id/shop_name
// are present the UI shows the shop name as the headline, the personal name is the fallback.
export interface BenderAuthor {
  id: string;
  name: string;
  avatar_url?: string | null;
  shop_id?: string | null;
  shop_name?: string | null;
}

export interface BenderPost {
  id: string;
  author: BenderAuthor;
  caption: string | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  media_type: 'image' | 'video' | null;
  like_count: number;
  comment_count: number;
  viewer_has_liked: boolean;
  created_at: string;
}

export interface BenderComment {
  id: string;
  author: BenderAuthor;
  content: string;
  created_at: string;
}

// Discount codes — either personally owned (community member) or shop-owned.
// `discount_value` is a percentage (1-100) when discount_type === 'percentage',
// and a flat amount in CENTS when discount_type === 'flat'.
export interface DiscountCode {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  discount_type: 'percentage' | 'flat';
  discount_value: number;
  expiry_date?: string | null;
  max_uses?: number | null;
  usage_count: number;
  is_active: boolean;
  owner_shop_id?: string | null;
  owner_user_id?: string | null;
  coupon_type?: 'shop_promo' | 'sponsor' | 'event';
  created_at: string;
}

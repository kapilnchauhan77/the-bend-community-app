// Enums
export type UserRole = 'super_admin' | 'community_admin' | 'shop_admin' | 'shop_employee';
export type ShopStatus = 'pending' | 'active' | 'suspended';
export type ListingType = 'offer' | 'request';
export type ListingCategory = 'staff' | 'materials' | 'equipment';
export type UrgencyLevel = 'normal' | 'urgent';
export type ListingStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';

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
  };
  type: ListingType;
  category: ListingCategory;
  title: string;
  description: string;
  quantity?: string;
  unit?: string;
  expiry_date?: string;
  price?: number;
  is_free: boolean;
  urgency: UrgencyLevel;
  status: ListingStatus;
  interest_count: number;
  images: ListingImage[];
  created_at: string;
}

export interface ListingDetail extends Listing {
  shop: Listing['shop'] & {
    contact_phone: string;
    whatsapp?: string;
    address?: string;
  };
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
  };
  unread_count: number;
  last_message_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  sender_id: string;
  content: string;
  read_at?: string;
  created_at: string;
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
  phone: string;
  email?: string;
  skills: string;
  available_time: string;
  photo_url?: string;
  created_at: string;
}

export interface Talent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  category: 'freelancer' | 'musician' | 'artist';
  skills: string;
  available_time: string;
  rate: number;
  rate_unit: 'hr' | 'gig' | 'day';
  photo_url?: string;
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

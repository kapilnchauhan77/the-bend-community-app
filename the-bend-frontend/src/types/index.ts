// Enums
export type UserRole = 'community_admin' | 'shop_admin' | 'shop_employee';
export type ShopStatus = 'pending' | 'active' | 'suspended';
export type ListingType = 'offer' | 'request';
export type ListingCategory = 'staff' | 'materials' | 'equipment';
export type UrgencyLevel = 'normal' | 'urgent' | 'critical';
export type ListingStatus = 'active' | 'fulfilled' | 'expired' | 'deleted';

// Models
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  shop_id?: string;
}

export interface Shop {
  id: string;
  name: string;
  business_type: string;
  address?: string;
  contact_phone: string;
  whatsapp?: string;
  status: ShopStatus;
  active_listings_count?: number;
  total_fulfilled?: number;
  member_since?: string;
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

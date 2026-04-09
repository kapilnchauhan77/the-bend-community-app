export const URGENCY_LEVELS = ['normal', 'urgent', 'critical'] as const;
export const LISTING_CATEGORIES = ['staff', 'materials', 'equipment'] as const;
export const LISTING_TYPES = ['offer', 'request'] as const;

export const URGENCY_COLORS = {
  normal: 'bg-muted text-muted-foreground',
  urgent: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-600',
} as const;

export const CATEGORY_LABELS = {
  staff: 'Staff',
  materials: 'Raw Materials',
  equipment: 'Equipment',
} as const;

export const BUSINESS_TYPES = [
  'restaurant',
  'cafe',
  'retail',
  'service',
  'hardware',
  'deli',
  'bakery',
  'other',
] as const;

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Backend root URL for serving uploads/static files
export const BACKEND_URL = API_BASE_URL.replace('/api/v1', '');

/**
 * Resolve an asset URL — if it starts with /uploads/, prepend the backend URL.
 * Otherwise return as-is (external URLs, data URIs, etc.)
 */
export function resolveAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/uploads/')) return `${BACKEND_URL}${url}`;
  return url;
}

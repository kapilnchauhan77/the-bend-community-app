export const URGENCY_LEVELS = ['normal', 'urgent'] as const;
export const LISTING_CATEGORIES = ['staff', 'materials', 'equipment'] as const;
export const LISTING_TYPES = ['offer', 'request'] as const;

export const URGENCY_COLORS = {
  normal: 'bg-muted text-muted-foreground',
  urgent: 'bg-amber-100 text-amber-700',
} as const;

export const CATEGORY_LABELS = {
  staff: 'Gigs',
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

/**
 * Extract tenant slug from subdomain or env var.
 * e.g. montross.thebend.app → "montross"
 * Falls back to VITE_TENANT_SLUG env var, then "montross".
 */
export function getTenantSlug(): string {
  const envSlug = import.meta.env.VITE_TENANT_SLUG;
  if (envSlug) return envSlug;

  const hostname = window.location.hostname;
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'thebend.app';

  if (hostname.endsWith(`.${baseDomain}`)) {
    return hostname.replace(`.${baseDomain}`, '');
  }

  return 'westmoreland';
}

/**
 * Detect whether the current hostname is the root domain (no subdomain).
 * e.g. bend.community → true, montross.bend.community → false
 * Returns false during SSR or if window is unavailable.
 */
export function isRootDomain(): boolean {
  if (typeof window === 'undefined') return false;

  const envSlug = import.meta.env.VITE_TENANT_SLUG;
  if (envSlug) return false; // Explicit slug override means we're in a tenant

  const hostname = window.location.hostname;
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'thebend.app';

  // Exact match: "bend.community" or "www.bend.community"
  return hostname === baseDomain || hostname === `www.${baseDomain}`;
}

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

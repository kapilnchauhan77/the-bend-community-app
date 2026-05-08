import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a datetime string from the backend.
 * The API serializes naive UTC datetimes (no tz suffix), so we append 'Z'
 * to force UTC parsing — otherwise the browser interprets them as local time
 * and timestamps appear shifted by the user's UTC offset.
 */
export function parseServerDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  // If the string already has a tz indicator (Z, +HH:MM, -HH:MM after the time
  // portion), trust it. Otherwise treat as UTC.
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTz ? value : value + 'Z');
}

/**
 * Format a listing's pricing for display, given any pricing_type.
 *  - free   → "FREE"
 *  - fixed  → "$25"
 *  - hourly → "$22/hr"
 *  - range  → "$15–$25/hr" (or "$15–$25" if no unit)
 *  - custom → the freeform text (e.g. "Negotiable", "DOE")
 *
 * Falls back to legacy is_free + price when pricing_type is unset
 * (older listings created before the pricing options upgrade).
 */
export function formatPrice(l: {
  pricing_type?: 'free' | 'fixed' | 'hourly' | 'range' | 'custom' | null;
  price?: number | null;
  price_max?: number | null;
  price_unit?: string | null;
  price_text?: string | null;
  is_free?: boolean | null;
}): string {
  const fmt = (n: number) => {
    if (n === Math.floor(n)) return `$${n}`;
    return `$${n.toFixed(2)}`;
  };
  const pt = l.pricing_type;
  // Legacy fallback when pricing_type isn't set
  if (!pt) {
    if (l.is_free) return 'FREE';
    if (l.price != null) return fmt(l.price);
    return '';
  }
  if (pt === 'free') return 'FREE';
  if (pt === 'custom') return (l.price_text || '').trim() || 'Negotiable';
  if (pt === 'fixed') return l.price != null ? fmt(l.price) : '';
  if (pt === 'hourly') {
    const base = l.price != null ? fmt(l.price) : '';
    return l.price_unit ? `${base}/${l.price_unit}` : base;
  }
  if (pt === 'range') {
    const lo = l.price != null ? fmt(l.price) : '';
    const hi = l.price_max != null ? fmt(l.price_max) : '';
    const span = lo && hi ? `${lo}–${hi}` : lo || hi;
    return l.price_unit ? `${span}/${l.price_unit}` : span;
  }
  return '';
}

/**
 * Human-readable "time ago" using parseServerDate so cross-timezone clients
 * see correct relative timestamps.
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - parseServerDate(dateStr).getTime();
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

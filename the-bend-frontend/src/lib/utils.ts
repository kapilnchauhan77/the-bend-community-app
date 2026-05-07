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

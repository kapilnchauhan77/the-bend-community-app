import type { NativeCreateAction, NativePendingIntent } from '@/platform/contracts'
export type { NativeCreateAction, NativePendingIntent } from '@/platform/contracts'
const KEY = 'native_pending_post_path'
const ACTION_KEY = 'native_pending_create_action'
const CREATE_PAIRS: Record<NativeCreateAction, string> = {
  'offer-listing': '/create?type=offer',
  'request-listing': '/create?type=request',
  'bender-post': '/bender',
}

const ALLOWED = [
  /^\/$/, /^\/(explore|browse|events|bender|volunteers|talent|messages|notifications|you|settings|create)(\/[^/?#]+)?$/,
  /^\/(listing|business)\/[A-Za-z0-9_-]+$/,
]

export function isAllowedPendingDestination(path: string): boolean {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return false
  let parsed: URL
  try { parsed = new URL(path, 'https://bend.local') } catch { return false }
  if (parsed.origin !== 'https://bend.local' || parsed.pathname.startsWith('/admin') || parsed.pathname.startsWith('/super-admin')) return false
  return ALLOWED.some((pattern) => pattern.test(parsed.pathname))
}

export function setPendingDestination(path: string): void {
  const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
  if (storage && typeof storage.setItem === 'function' && isAllowedPendingDestination(path)) storage.setItem(KEY, path)
}

export function getPendingDestination(): string | null {
  const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
  const value = storage && typeof storage.getItem === 'function' ? storage.getItem(KEY) : null
  return value && isAllowedPendingDestination(value) ? value : null
}

export function clearPendingDestination(): void {
  const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
  if (storage && typeof storage.removeItem === 'function') {
    storage.removeItem(KEY)
    storage.removeItem(ACTION_KEY)
  }
}

export function setPendingIntent(intent: NativePendingIntent): void {
  if (CREATE_PAIRS[intent.action] !== intent.destination) return
  setPendingDestination(intent.destination)
  const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
  if (storage && typeof storage.setItem === 'function') storage.setItem(ACTION_KEY, intent.action)
}

export function getPendingIntent(): NativePendingIntent | null {
  const destination = getPendingDestination()
  const storage = typeof globalThis !== 'undefined' ? (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage : undefined
  const action = storage && typeof storage.getItem === 'function' ? storage.getItem(ACTION_KEY) as NativeCreateAction | null : null
  return destination && action && CREATE_PAIRS[action] === destination ? { destination, action } : null
}

export function consumePendingIntent(): NativePendingIntent | null {
  const value = getPendingIntent()
  clearPendingDestination()
  return value
}

export function consumePendingDestination(): string | null {
  const value = getPendingDestination()
  clearPendingDestination()
  return value
}

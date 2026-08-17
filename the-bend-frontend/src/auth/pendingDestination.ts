const KEY = 'native_pending_post_path'

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
  if (storage && typeof storage.removeItem === 'function') storage.removeItem(KEY)
}

export function consumePendingDestination(): string | null {
  const value = getPendingDestination()
  clearPendingDestination()
  return value
}

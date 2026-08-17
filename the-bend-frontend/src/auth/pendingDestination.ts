const KEY = 'native_pending_destination'

const ALLOWED = [
  /^\/$/, /^\/(explore|browse|events|bender|volunteers|talent|messages|notifications|you|settings|create)(\/[^/?#]+)?$/,
  /^\/(listing|business)\/[A-Za-z0-9_-]+$/,
]

export function isAllowedPendingDestination(path: string): boolean {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) return false
  const parsed = new URL(path, 'https://bend.local')
  if (parsed.origin !== 'https://bend.local' || parsed.pathname.startsWith('/admin') || parsed.pathname.startsWith('/super-admin')) return false
  return ALLOWED.some((pattern) => pattern.test(parsed.pathname))
}

export function setPendingDestination(path: string): void {
  if (isAllowedPendingDestination(path)) localStorage.setItem(KEY, path)
}

export function getPendingDestination(): string | null {
  const value = localStorage.getItem(KEY)
  return value && isAllowedPendingDestination(value) ? value : null
}

export function clearPendingDestination(): void { localStorage.removeItem(KEY) }

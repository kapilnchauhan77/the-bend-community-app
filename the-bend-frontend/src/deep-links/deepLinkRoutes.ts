import type { DeepLinkTarget } from '@/platform/contracts'
import { consumePendingDestination as consumeStoredDestination, setPendingDestination } from '@/auth/pendingDestination'

const HOST = 'westmoreland.bend.community'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const ROUTES: Array<{ pattern: RegExp; requiresAuth: boolean }> = [
  { pattern: /^\/$/, requiresAuth: false },
  { pattern: new RegExp(`^/listing/${UUID}$`, 'i'), requiresAuth: false },
  { pattern: new RegExp(`^/business/${UUID}$`, 'i'), requiresAuth: false },
  { pattern: new RegExp(`^/events(?:/${UUID})?$`, 'i'), requiresAuth: false },
  { pattern: new RegExp(`^/bender(?:/${UUID})?$`, 'i'), requiresAuth: false },
  { pattern: new RegExp(`^/messages/${UUID}$`, 'i'), requiresAuth: true },
  { pattern: /^\/notifications$/, requiresAuth: true },
]

export function parseCanonicalUuid(value: string): string | null {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return null
  const [first, second, third, fourth, fifth] = value.split('-')
  return first && second && third && fourth && fifth && `${first}-${second}-${third}-${fourth}-${fifth}` === value ? value : null
}

export function parseDeepLink(url: string): DeepLinkTarget | null {
  if (typeof url !== 'string' || !url || url.startsWith('//') || !/^https:\/\/westmoreland\.bend\.community(?:\/|$)/.test(url) || [...url].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.hostname !== HOST || parsed.port || parsed.username || parsed.password) return null
  if (parsed.search || parsed.hash || parsed.pathname.includes('%') || [...parsed.pathname].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null
  const route = ROUTES.find(({ pattern }) => pattern.test(parsed.pathname))
  const identifier = parsed.pathname.match(/^\/(?:listing|business|messages)\/([^/]+)$/)?.[1] ?? parsed.pathname.match(/^\/(?:events|bender)\/([^/]+)$/)?.[1]
  if (identifier && !parseCanonicalUuid(identifier)) return null
  return route ? { path: parsed.pathname, requiresAuth: route.requiresAuth } : null
}

export function savePendingDestination(target: DeepLinkTarget): void {
  if (target.requiresAuth) setPendingDestination(target.path)
}

export function consumePendingDestination(): string | null {
  return consumeStoredDestination()
}

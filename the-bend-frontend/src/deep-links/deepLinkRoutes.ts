import type { DeepLinkTarget } from '@/platform/contracts'
import { consumePendingDestination as consumeStoredDestination, setPendingDestination } from '@/auth/pendingDestination'
import { GUIDELINE_SECTION_IDS } from '@/routes/guidelineSections'

const HOST = 'westmoreland.bend.community'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_PATTERN = new RegExp(`^${UUID}$`, 'i')
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
  if (!UUID_PATTERN.test(value)) return null
  const [first, second, third, fourth, fifth] = value.split('-')
  return first && second && third && fourth && fifth && `${first}-${second}-${third}-${fourth}-${fifth}` === value ? value : null
}

function parseLegacyBenderId(search: string, hash: string): string | null {
  const queryMatch = search.match(new RegExp(`^\\?post=(${UUID})$`, 'i'))
  const hashMatch = hash.match(new RegExp(`^#post-(${UUID})$`, 'i'))
  if ((search && !queryMatch) || (hash && !hashMatch)) return null
  const queryId = queryMatch ? parseCanonicalUuid(queryMatch[1]) : null
  const hashId = hashMatch ? parseCanonicalUuid(hashMatch[1]) : null
  if ((queryMatch && !queryId) || (hashMatch && !hashId)) return null
  if (queryId && hashId && queryId.toLowerCase() !== hashId.toLowerCase()) return null
  return queryId ?? hashId
}

export function parseDeepLink(url: string): DeepLinkTarget | null {
  if (typeof url !== 'string' || !url || url.startsWith('//') || !/^https:\/\/westmoreland\.bend\.community(?:\/|$)/.test(url) || url.includes('\\') || /(?:^|\/)\.{1,2}(?:\/|[?#]|$)/.test(url.slice('https://westmoreland.bend.community'.length)) || [...url].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.hostname !== HOST || parsed.port || parsed.username || parsed.password) return null
  if (parsed.pathname.includes('%') || [...parsed.pathname].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null
  if (parsed.pathname === '/bender' && (parsed.search || parsed.hash)) {
    const postId = parseLegacyBenderId(parsed.search, parsed.hash)
    return postId ? { path: `/bender/${postId}`, requiresAuth: false } : null
  }
  if (parsed.pathname === '/guidelines') {
    if (parsed.search) return null
    if (!parsed.hash) return { path: '/guidelines', requiresAuth: false }
    const sectionId = parsed.hash.slice(1)
    return GUIDELINE_SECTION_IDS.has(sectionId) ? { path: `/guidelines#${sectionId}`, requiresAuth: false } : null
  }
  if (parsed.search || parsed.hash) return null
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

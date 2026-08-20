import { parseCanonicalUuid } from '@/deep-links/deepLinkRoutes'

export function benderPostPath(postId: string): string {
  const canonical = parseCanonicalUuid(postId)
  if (!canonical) throw new TypeError('Expected a canonical Bender post UUID')
  return `/bender/${encodeURIComponent(canonical)}`
}

export function getLegacyBenderPostId(search: string, hash: string): string | null {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  const queryMatch = search.match(new RegExp(`^\\??post=(${uuid})$`, 'i'))
  const hashMatch = hash.match(new RegExp(`^#post-(${uuid})$`, 'i'))
  if ((search && !queryMatch) || (hash && !hashMatch)) return null
  const queryId = queryMatch ? parseCanonicalUuid(queryMatch[1]) : null
  const hashId = hashMatch ? parseCanonicalUuid(hashMatch[1]) : null
  if ((queryMatch && !queryId) || (hashMatch && !hashId)) return null
  if (queryId && hashId && queryId.toLowerCase() !== hashId.toLowerCase()) return null
  return queryId ?? hashId
}

export function getLegacyBenderPostPath(search: string, hash: string): string | null {
  const postId = getLegacyBenderPostId(search, hash)
  return postId ? benderPostPath(postId) : null
}

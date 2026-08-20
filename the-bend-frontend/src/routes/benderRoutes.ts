import { parseCanonicalUuid } from '@/deep-links/deepLinkRoutes'

export function benderPostPath(postId: string): string {
  const canonical = parseCanonicalUuid(postId)
  if (!canonical) throw new TypeError('Expected a canonical Bender post UUID')
  return `/bender/${encodeURIComponent(canonical)}`
}

function canonicalLegacyId(value: string | null): string | null {
  if (!value) return null
  try {
    return parseCanonicalUuid(decodeURIComponent(value))
  } catch {
    return null
  }
}

export function getLegacyBenderPostId(search: string, hash: string): string | null {
  let queryId: string | null = null
  try {
    queryId = new URLSearchParams(search).get('post')
  } catch {
    queryId = null
  }
  const hashId = hash.match(/^#post-(.+)$/)?.[1] ?? null
  return queryId !== null ? canonicalLegacyId(queryId) : canonicalLegacyId(hashId)
}

export function getLegacyBenderPostPath(search: string, hash: string): string | null {
  const postId = getLegacyBenderPostId(search, hash)
  return postId ? benderPostPath(postId) : null
}

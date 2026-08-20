import { describe, expect, it } from 'vitest'
import { benderPostPath, getLegacyBenderPostId, getLegacyBenderPostPath } from './benderRoutes'

const id = '00000000-0000-0000-0000-000000000001'

describe('Bender route helpers', () => {
  it('builds a canonical focused-post path', () => {
    expect(benderPostPath(id)).toBe(`/bender/${id}`)
    expect(() => benderPostPath('not-a-uuid')).toThrow(TypeError)
  })

  it('normalizes legacy query and hash links with query precedence', () => {
    expect(getLegacyBenderPostId(`?post=${id}`, `#post-${id}`)).toBe(id)
    expect(getLegacyBenderPostPath(`?post=${id}`, `#post-${id}`)).toBe(`/bender/${id}`)
    expect(getLegacyBenderPostId('?post=not-a-uuid', `#post-${id}`)).toBeNull()
  })

  it('accepts canonical UUIDs only and rejects invalid legacy inputs', () => {
    expect(getLegacyBenderPostId('?post=not-a-uuid', '#post-not-a-uuid')).toBeNull()
    expect(getLegacyBenderPostId(`?post=${id}`, '#post-not-a-uuid')).toBe(id)
    expect(getLegacyBenderPostId('', '#post-not-a-uuid')).toBeNull()
    expect(getLegacyBenderPostPath('?post=not-a-uuid', '#post-not-a-uuid')).toBeNull()
  })

  it('does not accept an invalid canonical route parameter as a focused post id', async () => {
    const { parseCanonicalUuid } = await import('@/deep-links/deepLinkRoutes')
    expect(parseCanonicalUuid('not-a-uuid')).toBeNull()
  })
})

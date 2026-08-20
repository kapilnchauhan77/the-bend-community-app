import { describe, expect, it } from 'vitest'
import { publicWestmorelandUrl, WESTMORELAND_PUBLIC_ORIGIN } from './publicUrl'

describe('publicWestmorelandUrl', () => {
  it('uses the fixed public origin for a safe root-relative path', () => {
    expect(publicWestmorelandUrl('/bender/00000000-0000-0000-0000-000000000001'))
      .toBe(`${WESTMORELAND_PUBLIC_ORIGIN}/bender/00000000-0000-0000-0000-000000000001`)
  })

  it('preserves safe queries and hashes', () => {
    expect(publicWestmorelandUrl('/events/1?tab=about#comments')).toBe(`${WESTMORELAND_PUBLIC_ORIGIN}/events/1?tab=about#comments`)
  })

  it.each([
    '//evil.example/post',
    'https://evil.example/post',
    'events/1',
    '/foo\\bar',
    '/../secret',
    '/./secret',
    '/foo%2fbar',
    '/foo%5Cbar',
    '/foo bar',
    '/foo\nbar',
  ])('rejects unsafe path %s', (path) => {
    expect(() => publicWestmorelandUrl(path)).toThrow(TypeError)
  })
})

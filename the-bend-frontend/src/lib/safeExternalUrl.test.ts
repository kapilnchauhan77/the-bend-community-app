import { describe, expect, it } from 'vitest'
import { findFirstSafeExternalUrl, parseSafeExternalUrl } from './safeExternalUrl'

describe('parseSafeExternalUrl', () => {
  it.each([
    [' https://Example.com/path ', 'https://example.com/path', 'example.com'],
    ['http://example.com/path?q=1#section', 'http://example.com/path?q=1#section', 'example.com'],
  ])('normalizes %s', (raw, href, hostname) => {
    expect(parseSafeExternalUrl(raw)).toEqual({ href, hostname, original: raw.trim() })
  })

  it.each([null, undefined, '', '   ', 'https://example.com/a b', 'not a URL'])('rejects %s', (raw) => {
    expect(parseSafeExternalUrl(raw)).toBeNull()
  })

  it.each(['https://user@example.com', 'https://:password@example.com', 'javascript:alert(1)', 'data:text/plain,hello', 'file:///tmp/test'])('rejects unsafe URL %s', (raw) => {
    expect(parseSafeExternalUrl(raw)).toBeNull()
  })
})

describe('findFirstSafeExternalUrl', () => {
  it('finds explicit HTTP or HTTPS candidates in caption order and strips sentence punctuation', () => {
    expect(findFirstSafeExternalUrl('See https://example.com/one. Then https://example.com/two')).toEqual({
      href: 'https://example.com/one',
      hostname: 'example.com',
      original: 'https://example.com/one',
    })
  })

  it('skips a rejected first candidate', () => {
    expect(findFirstSafeExternalUrl('https://user:pass@bad.example/a, then http://Good.example/b!')).toEqual({
      href: 'http://good.example/b',
      hostname: 'good.example',
      original: 'http://Good.example/b',
    })
  })
})

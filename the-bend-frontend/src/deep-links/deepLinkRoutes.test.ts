import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLinkRoutes'

describe('parseDeepLink', () => {
  const eventId = '00000000-0000-0000-0000-000000000003'
  const postId = '00000000-0000-0000-0000-000000000004'
  const messageId = '00000000-0000-0000-0000-000000000005'

  it.each([
    ['https://westmoreland.bend.community/listing/00000000-0000-0000-0000-000000000001', '/listing/00000000-0000-0000-0000-000000000001'],
    ['https://westmoreland.bend.community/business/00000000-0000-0000-0000-000000000002', '/business/00000000-0000-0000-0000-000000000002'],
    ['https://westmoreland.bend.community/events/00000000-0000-0000-0000-000000000003', '/events/00000000-0000-0000-0000-000000000003'],
    ['https://westmoreland.bend.community/bender/00000000-0000-0000-0000-000000000004', '/bender/00000000-0000-0000-0000-000000000004'],
    ['https://westmoreland.bend.community/messages/00000000-0000-0000-0000-000000000005', '/messages/00000000-0000-0000-0000-000000000005'],
    ['https://westmoreland.bend.community/notifications', '/notifications'],
    ['https://westmoreland.bend.community/bender?post=00000000-0000-0000-0000-000000000006', '/bender/00000000-0000-0000-0000-000000000006'],
    ['https://westmoreland.bend.community/bender#post-00000000-0000-0000-0000-000000000007', '/bender/00000000-0000-0000-0000-000000000007'],
    ['https://westmoreland.bend.community/guidelines#privacy-data', '/guidelines#privacy-data'],
  ])('maps %s to %s', (url, path) => expect(parseDeepLink(url)?.path).toBe(path))

  it.each([
    'https://other.bend.community/listing/00000000-0000-0000-0000-000000000001',
    'https://westmoreland.bend.community/admin',
    'https://evil.example/messages/00000000-0000-0000-0000-000000000001',
    'https://westmoreland.bend.community/listing/123',
    'https://westmoreland.bend.community/listing/00000000-0000-0000-0000-000000000001?x=1',
    'https://westmoreland.bend.community/bender?post=00000000-0000-0000-0000-000000000001&x=1',
    'https://westmoreland.bend.community/bender?x=1&post=00000000-0000-0000-0000-000000000001',
    'https://westmoreland.bend.community/bender?post=not-a-uuid',
    'https://westmoreland.bend.community/bender?post=00000000-0000-0000-0000-000000000001#post-00000000-0000-0000-0000-000000000002',
    'https://westmoreland.bend.community/bender?post=00000000-0000-0000-0000-000000000001#other',
    'https://westmoreland.bend.community/bender#post-not-a-uuid',
    'https://westmoreland.bend.community/bender#other',
    'https://westmoreland.bend.community/guidelines?section=privacy-data',
    'https://westmoreland.bend.community/guidelines#unknown-section',
    'https://westmoreland.bend.community/guidelines#privacy-data/../contact',
    'https://westmoreland.bend.community/guidelines#privacy%2Ddata',
    'https://westmoreland.bend.community/listing/%2e%2e%2fadmin',
    'https://westmoreland.bend.community/events/%2e%2e%2fevents%2fpricing',
    'https://westmoreland.bend.community/events/../admin/events',
    'https://westmoreland.bend.community/bender/%2e%2e%2fadmin',
    '//westmoreland.bend.community/notifications',
    'https://user:pass@westmoreland.bend.community/notifications:443',
    'https://westmoreland.bend.community/notifications#x',
    'javascript://westmoreland.bend.community/notifications',
    ' https://westmoreland.bend.community/notifications',
    'https://westmoreland.bend.community/notifications ',
    'HTTPS://westmoreland.bend.community/notifications',
    'https://WESTMORELAND.BEND.COMMUNITY/notifications',
    'https://westmoreland.bend.community:443/notifications',
    'https://westmoreland.bend.community/listing/0000000-0000-0000-0000-000000000001',
    'https://westmoreland.bend.community/listing/00000000-0000-0000-0000-00000000000g',
    'https://westmoreland.bend.community/listing/00000000-0000-0000-0000-0000000000011',
  ])('rejects unsafe URL %s', (url) => expect(parseDeepLink(url)).toBeNull())

  it.each([
    `https://westmoreland.bend.community/admin/%2e%2e/events/${eventId}`,
    `https://westmoreland.bend.community/admin/.%2E/bender/${postId}`,
    `https://westmoreland.bend.community/admin/%2e./bender?post=${postId}`,
    `https://westmoreland.bend.community/admin/%2E%2e/bender#post-${postId}`,
    'https://westmoreland.bend.community/admin/%2e./guidelines#contact',
    'https://westmoreland.bend.community/admin/%2E%2E/notifications',
    `https://westmoreland.bend.community/admin/.%2e/messages/${messageId}`,
    `https://westmoreland.bend.community/%2e/events/${eventId}`,
    `https://westmoreland.bend.community/admin/%2e%2e%2fevents%2f${eventId}`,
    `https://westmoreland.bend.community/admin/%2e%2e%5cevents%5c${eventId}`,
    `https://westmoreland.bend.community/admin/../events/${eventId}`,
  ])('rejects raw traversal before URL normalization for %s', (url) => {
    expect(parseDeepLink(url)).toBeNull()
  })

  it.each([
    ['https://westmoreland.bend.community/', false],
    ['https://westmoreland.bend.community/events', false],
    ['https://westmoreland.bend.community/events/00000000-0000-0000-0000-000000000003', false],
    ['https://westmoreland.bend.community/bender', false],
    ['https://westmoreland.bend.community/messages/00000000-0000-0000-0000-000000000005', true],
    ['https://westmoreland.bend.community/notifications', true],
    ['https://westmoreland.bend.community/guidelines#contact', false],
  ])('sets requiresAuth for %s', (url, requiresAuth) => expect(parseDeepLink(url)?.requiresAuth).toBe(requiresAuth))

  it('accepts matching query and hash Bender ids with query precedence', () => {
    const id = 'abcdef00-0000-0000-0000-000000000008'
    expect(parseDeepLink(`https://westmoreland.bend.community/bender?post=${id}#post-${id}`)?.path).toBe(`/bender/${id}`)
    expect(parseDeepLink(`https://westmoreland.bend.community/bender?post=${id.toUpperCase()}#post-${id}`)?.path).toBe(`/bender/${id.toUpperCase()}`)
  })

  it.each([
    'purpose-mission',
    'membership-eligibility',
    'acceptable-use',
    'listings-transactions',
    'events-community-features',
    'advertising-sponsored-content',
    'limitation-liability',
    'privacy-data',
    'content-moderation-enforcement',
    'modifications',
    'contact',
  ])('preserves the known Guidelines section hash %s', (sectionId) => {
    expect(parseDeepLink(`https://westmoreland.bend.community/guidelines#${sectionId}`)?.path).toBe(`/guidelines#${sectionId}`)
  })

  it('accepts the canonical root URL without a trailing path segment', () => expect(parseDeepLink('https://westmoreland.bend.community')?.path).toBe('/'))
})

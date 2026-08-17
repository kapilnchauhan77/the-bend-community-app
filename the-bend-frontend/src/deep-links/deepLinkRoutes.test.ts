import { describe, expect, it } from 'vitest'
import { parseDeepLink } from './deepLinkRoutes'

describe('parseDeepLink', () => {
  it.each([
    ['https://westmoreland.bend.community/listing/00000000-0000-0000-0000-000000000001', '/listing/00000000-0000-0000-0000-000000000001'],
    ['https://westmoreland.bend.community/business/00000000-0000-0000-0000-000000000002', '/business/00000000-0000-0000-0000-000000000002'],
    ['https://westmoreland.bend.community/events/00000000-0000-0000-0000-000000000003', '/events/00000000-0000-0000-0000-000000000003'],
    ['https://westmoreland.bend.community/bender/00000000-0000-0000-0000-000000000004', '/bender/00000000-0000-0000-0000-000000000004'],
    ['https://westmoreland.bend.community/messages/00000000-0000-0000-0000-000000000005', '/messages/00000000-0000-0000-0000-000000000005'],
    ['https://westmoreland.bend.community/notifications', '/notifications'],
  ])('maps %s to %s', (url, path) => expect(parseDeepLink(url)?.path).toBe(path))

  it.each([
    'https://other.bend.community/listing/00000000-0000-0000-0000-000000000001',
    'https://westmoreland.bend.community/admin',
    'https://evil.example/messages/00000000-0000-0000-0000-000000000001',
    'https://westmoreland.bend.community/listing/123',
    'https://westmoreland.bend.community/listing/00000000-0000-0000-0000-000000000001?x=1',
    'https://westmoreland.bend.community/listing/%2e%2e%2fadmin',
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
    ['https://westmoreland.bend.community/', false],
    ['https://westmoreland.bend.community/events', false],
    ['https://westmoreland.bend.community/events/00000000-0000-0000-0000-000000000003', false],
    ['https://westmoreland.bend.community/bender', false],
    ['https://westmoreland.bend.community/messages/00000000-0000-0000-0000-000000000005', true],
    ['https://westmoreland.bend.community/notifications', true],
  ])('sets requiresAuth for %s', (url, requiresAuth) => expect(parseDeepLink(url)?.requiresAuth).toBe(requiresAuth))

  it('accepts the canonical root URL without a trailing path segment', () => expect(parseDeepLink('https://westmoreland.bend.community')?.path).toBe('/'))
})

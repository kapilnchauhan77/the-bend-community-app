import { describe, expect, it } from 'vitest'
import { parseNativeExploreQuery, serializeNativeExploreQuery, toBusinessParams, toEventParams, toListingParams, toOpportunityParams } from './queries'

describe('native explore query', () => {
  it('drops Near me for non-business types during parse and serialization', () => {
    for (const type of ['all', 'listings', 'events', 'bender', 'volunteer']) {
      const parsed = parseNativeExploreQuery(new URLSearchParams(`type=${type}&near=true`))
      expect(parsed.near).toBe(false)
      expect(serializeNativeExploreQuery({ ...parsed, near: true }).toString()).not.toContain('near=true')
    }
  })
  it('parses canonical values and serializes stable non-default parameters', () => {
    const query = parseNativeExploreQuery(new URLSearchParams('q=repair&type=businesses&category=food&urgency=urgent&sort=newest&mode=map&near=true'))
    expect(query).toEqual({ q: 'repair', type: 'businesses', category: 'food', urgency: null, sort: null, mode: 'map', near: true })
    expect(serializeNativeExploreQuery(query).toString()).toBe('q=repair&type=businesses&category=food&mode=map&near=true')
  })

  it('keeps device and coordinate-shaped fields out of the canonical query', () => {
    const query = {
      ...parseNativeExploreQuery(new URLSearchParams('type=businesses&near=true')),
      userCoordinates: { latitude: 38.123456, longitude: -76.654321 },
      hydratedCoordinates: { 'shop-1': { latitude: 38.123456, longitude: -76.654321 } },
      deviceLocation: 'LOCATION_SENTINEL',
    } as never
    const serialized = serializeNativeExploreQuery(query).toString()
    expect(serialized).toBe('type=businesses&near=true')
    expect(serialized).not.toContain('38.123456')
    expect(parseNativeExploreQuery(new URLSearchParams(serialized))).toEqual({ q: '', type: 'businesses', category: null, urgency: null, sort: null, mode: 'list', near: true })
  })

  it('falls back safely and omits defaults', () => {
    expect(serializeNativeExploreQuery(parseNativeExploreQuery(new URLSearchParams('type=nope&mode=nope&near=nope'))).toString()).toBe('')
  })

  it('translates q to search with exact endpoint-supported filters', () => {
    const query = parseNativeExploreQuery(new URLSearchParams('q=repair&type=all&category=food&urgency=urgent&sort=newest&mode=list&near=true'))
    expect(query.near).toBe(false)
    expect(toListingParams(query)).toEqual({ search: 'repair', category: undefined, urgency: 'urgent', sort: undefined, limit: 5 })
    expect(toBusinessParams(query)).toEqual({ search: 'repair', business_type: 'food', limit: 5 })
    expect(toEventParams(query)).toEqual({ search: 'repair', category: 'food', limit: 5 })
    expect(toOpportunityParams(query)).toEqual({ search: 'repair', urgency: 'urgent', sort: undefined, limit: 5 })
  })

  it('accepts only endpoint-supported filters for each type', () => {
    const listing = parseNativeExploreQuery(new URLSearchParams('type=listings&category=staff&sort=expiry_asc&urgency=urgent'))
    expect(listing).toMatchObject({ category: 'staff', sort: 'expiry_asc' })
    const event = parseNativeExploreQuery(new URLSearchParams('type=events&category=food&sort=expiry_asc'))
    expect(event).toMatchObject({ category: 'food', sort: null })
    const volunteer = parseNativeExploreQuery(new URLSearchParams('type=volunteer&category=staff&sort=created_desc'))
    expect(volunteer).toMatchObject({ category: null, sort: 'created_desc' })
  })

  it('keeps Bender search canonical while clearing unsupported filters, map, and Near me', () => {
    const parsed = parseNativeExploreQuery(new URLSearchParams('q=river&type=bender&category=staff&urgency=urgent&sort=created_desc&mode=map&near=true'))
    expect(parsed).toEqual({ q: 'river', type: 'bender', category: null, urgency: null, sort: null, mode: 'list', near: false })
    expect(serializeNativeExploreQuery(parsed).toString()).toBe('q=river&type=bender')
    expect(serializeNativeExploreQuery({ ...parsed, category: 'staff', urgency: 'urgent', sort: 'created_desc', mode: 'map', near: true }).toString()).toBe('q=river&type=bender')
  })
})

import { describe, expect, it } from 'vitest'
import { parseNativeExploreQuery, serializeNativeExploreQuery, toBusinessParams, toEventParams, toListingParams, toOpportunityParams } from './queries'

describe('native explore query', () => {
  it('parses canonical values and serializes stable non-default parameters', () => {
    const query = parseNativeExploreQuery(new URLSearchParams('q=repair&type=businesses&category=food&urgency=urgent&sort=newest&mode=map&near=true'))
    expect(query).toEqual({ q: 'repair', type: 'businesses', category: 'food', urgency: null, sort: null, mode: 'map', near: true })
    expect(serializeNativeExploreQuery(query).toString()).toBe('q=repair&type=businesses&category=food&mode=map&near=true')
  })

  it('falls back safely and omits defaults', () => {
    expect(serializeNativeExploreQuery(parseNativeExploreQuery(new URLSearchParams('type=nope&mode=nope&near=nope'))).toString()).toBe('')
  })

  it('translates q to search with exact endpoint-supported filters', () => {
    const query = parseNativeExploreQuery(new URLSearchParams('q=repair&type=all&category=food&urgency=urgent&sort=newest&mode=list&near=true'))
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
})

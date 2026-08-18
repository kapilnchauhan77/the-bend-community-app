import { describe, expect, it } from 'vitest'
import { parseNativeExploreQuery, serializeNativeExploreQuery, toBusinessParams, toEventParams, toListingParams, toOpportunityParams } from './queries'

describe('native explore query', () => {
  it('parses canonical values and serializes stable non-default parameters', () => {
    const query = parseNativeExploreQuery(new URLSearchParams('q=repair&type=businesses&category=food&urgency=urgent&sort=newest&mode=map&near=true'))
    expect(query).toEqual({ q: 'repair', type: 'businesses', category: 'food', urgency: 'urgent', sort: 'newest', mode: 'map', near: true })
    expect(serializeNativeExploreQuery(query).toString()).toBe('q=repair&type=businesses&category=food&urgency=urgent&sort=newest&mode=map&near=true')
  })

  it('falls back safely and omits defaults', () => {
    expect(serializeNativeExploreQuery(parseNativeExploreQuery(new URLSearchParams('type=nope&mode=nope&near=nope'))).toString()).toBe('')
  })

  it('translates q to backend search and bounds all mode to five', () => {
    const query = parseNativeExploreQuery(new URLSearchParams('q=repair&type=all&category=food&urgency=urgent&sort=newest&mode=list&near=true'))
    expect(toListingParams(query)).toEqual({ search: 'repair', category: 'food', urgency: 'urgent', sort: 'newest', limit: 5 })
    expect(toBusinessParams(query)).toEqual({ search: 'repair', category: 'food', sort: 'newest', limit: 5 })
    expect(toEventParams(query)).toEqual({ search: 'repair', category: 'food', sort: 'newest', limit: 5 })
    expect(toOpportunityParams(query)).toEqual({ search: 'repair', category: 'food', urgency: 'urgent', sort: 'newest', limit: 5 })
  })
})

import { describe, expect, it } from 'vitest'
import { getRuntimeConfig } from './runtimeConfig'

describe('getRuntimeConfig', () => {
  it.each(['ios', 'android'] as const)('locks %s to Westmoreland', (kind) => {
    const config = getRuntimeConfig(kind)
    expect(config.isNative).toBe(true)
    expect(config.tenantSlug).toBe('westmoreland')
    expect(config.apiBaseUrl).toBe('https://api.bend.community/api/v1')
  })

  it('keeps web tenant resolution configurable', () => {
    expect(getRuntimeConfig('web').kind).toBe('web')
  })
})

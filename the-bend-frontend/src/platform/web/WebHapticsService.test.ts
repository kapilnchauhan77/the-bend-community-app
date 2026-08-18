import { describe, expect, it } from 'vitest'
import { WebHapticsService } from './WebHapticsService'

describe('WebHapticsService', () => {
  it('is a resolved no-op on web', async () => {
    const service = new WebHapticsService()
    await expect(service.selection()).resolves.toBeUndefined()
    await expect(service.impact()).resolves.toBeUndefined()
    await expect(service.success()).resolves.toBeUndefined()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api'
import { eventApi } from './eventApi'

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const eventId = '00000000-0000-0000-0000-000000000003'

describe('eventApi.getDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requests the canonical event endpoint and forwards AbortSignal', () => {
    const signal = new AbortController().signal
    eventApi.getDetail(eventId, { signal })
    expect(api.get).toHaveBeenCalledWith(`/events/${eventId}`, { signal })
  })

  it.each([
    'event-1',
    '%2e%2e%2fevents%2fpricing',
    '../events/pricing',
    '%2e%2e%2fadmin%2fevents',
    '../admin/events',
  ])('rejects invalid event id %s before making a request', (invalidId) => {
    expect(() => eventApi.getDetail(invalidId)).toThrow(TypeError)
    expect(api.get).not.toHaveBeenCalled()
  })
})

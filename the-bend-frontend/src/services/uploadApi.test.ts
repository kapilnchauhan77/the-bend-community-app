import { describe, expect, it, vi } from 'vitest'
import api from './api'
import { uploadApi } from './uploadApi'

vi.mock('./api', () => ({ default: { post: vi.fn(() => Promise.resolve({ data: {} })) } }))

describe('upload API idempotency and progress', () => {
  it('sends the same explicit key and progress callback on all protected endpoints', async () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
    const progress = vi.fn()
    await uploadApi.uploadImages([file], '00000000-0000-4000-8000-000000000123', progress)
    await uploadApi.uploadPhoto(file, '00000000-0000-4000-8000-000000000123', progress)
    await uploadApi.uploadAvatar(file, '00000000-0000-4000-8000-000000000123', progress)
    await uploadApi.uploadMedia(file, '00000000-0000-4000-8000-000000000123', progress)
    for (const call of vi.mocked(api.post).mock.calls) {
      const config = call[2] as { headers: Record<string, string>; onUploadProgress: unknown }
      expect(config.headers['Idempotency-Key']).toBe('00000000-0000-4000-8000-000000000123')
      expect(config.onUploadProgress).toEqual(expect.any(Function))
    }
  })
})

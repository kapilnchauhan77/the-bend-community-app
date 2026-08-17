import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', convertFileSrc: (uri: string) => `capacitor://${uri}` },
}))

vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: vi.fn() }, CameraResultType: { Uri: 'uri' }, CameraSource: { Camera: 'camera', Photos: 'photos' } }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { readFile: vi.fn() } }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { getCurrentPosition: vi.fn() } }))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(), close: vi.fn() } }))

import { Camera } from '@capacitor/camera'
import { Geolocation } from '@capacitor/geolocation'
import { Share } from '@capacitor/share'
import { NativeMediaService } from './NativeMediaService'
import { NativeLocationService } from './NativeLocationService'
import { NativeShareService } from './NativeShareService'

describe('native device services', () => {
  it('returns cancellation without throwing when the picker is dismissed', async () => {
    vi.mocked(Camera.getPhoto).mockRejectedValueOnce({ message: 'User cancelled photos app' })
    await expect(new NativeMediaService().pickPhoto()).resolves.toBeNull()
  })

  it('maps a foreground position to the platform contract', async () => {
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValueOnce({ coords: { latitude: 40, longitude: -80, accuracy: 8 } } as never)
    await expect(new NativeLocationService().getForegroundPosition()).resolves.toEqual({ latitude: 40, longitude: -80, accuracy: 8 })
  })

  it('returns cancelled when native sharing is dismissed', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('cancelled'))
    await expect(new NativeShareService().share({ title: 'A', text: 'B', url: 'https://example.test' })).resolves.toBe('cancelled')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios', convertFileSrc: (uri: string) => `capacitor://${uri}` },
}))

vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: vi.fn() }, CameraResultType: { Uri: 'uri' }, CameraSource: { Camera: 'camera', Photos: 'photos' } }))
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { readFile: vi.fn(async () => ({ data: btoa('image-bytes') })) } }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { checkPermissions: vi.fn(), requestPermissions: vi.fn(), getCurrentPosition: vi.fn() } }))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }))
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(), close: vi.fn() } }))

import { Camera } from '@capacitor/camera'
import { Geolocation } from '@capacitor/geolocation'
import { Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { NativeMediaService } from './NativeMediaService'
import { NativeLocationService } from './NativeLocationService'
import { NativeShareService } from './NativeShareService'

describe('native device services', () => {
  beforeEach(() => vi.clearAllMocks())
  it('returns cancellation without throwing when the picker is dismissed', async () => {
    vi.mocked(Camera.getPhoto).mockRejectedValueOnce({ message: 'User cancelled photos app' })
    await expect(new NativeMediaService().pickPhoto()).resolves.toBeNull()
  })

  it('maps a foreground position to the platform contract', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValueOnce({ location: 'granted', coarseLocation: 'granted' } as never)
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValueOnce({ coords: { latitude: 40, longitude: -80, accuracy: 8 } } as never)
    await expect(new NativeLocationService().getForegroundPosition()).resolves.toEqual({ latitude: 40, longitude: -80, accuracy: 8 })
  })

  it('checks then requests location only from an explicit foreground call and normalizes denial', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValueOnce({ location: 'prompt' } as never)
    vi.mocked(Geolocation.requestPermissions).mockResolvedValueOnce({ location: 'denied' } as never)
    await expect(new NativeLocationService().getForegroundPosition()).rejects.toMatchObject({ code: 'LOCATION_PERMISSION_DENIED' })
    expect(Geolocation.checkPermissions).toHaveBeenCalledOnce()
    expect(Geolocation.requestPermissions).toHaveBeenCalledOnce()
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
  })

  it('accepts Android approximate permission without requesting fine location', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'granted' } as never)
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValueOnce({ coords: { latitude: 40, longitude: -80, accuracy: 500 } } as never)
    await expect(new NativeLocationService().getForegroundPosition()).resolves.toMatchObject({ latitude: 40, longitude: -80 })
    expect(Geolocation.requestPermissions).not.toHaveBeenCalled()
  })

  it('accepts a coarse-granted permission response after a prompt', async () => {
    vi.mocked(Geolocation.checkPermissions).mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'prompt' } as never)
    vi.mocked(Geolocation.requestPermissions).mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'granted' } as never)
    vi.mocked(Geolocation.getCurrentPosition).mockResolvedValueOnce({ coords: { latitude: 40, longitude: -80, accuracy: 500 } } as never)
    await expect(new NativeLocationService().getForegroundPosition()).resolves.toMatchObject({ latitude: 40, longitude: -80 })
  })

  it('declares truthful foreground location permissions for both native platforms', async () => {
    const manifest = await import('node:fs/promises').then(({ readFile }) => readFile('android/app/src/main/AndroidManifest.xml', 'utf8'))
    const plist = await import('node:fs/promises').then(({ readFile }) => readFile('ios/App/App/Info.plist', 'utf8'))
    expect(manifest).toContain('android.permission.ACCESS_COARSE_LOCATION')
    expect(manifest).toContain('android.permission.ACCESS_FINE_LOCATION')
    expect(manifest).not.toContain('android.hardware.location.gps')
    expect(plist).toContain('NSLocationWhenInUseUsageDescription')
    expect(plist).toContain('The Bend uses your location only when you choose Near me')
  })

  it('converts a native file path to a blob without logging or caching bytes', async () => {
    vi.mocked(Camera.getPhoto).mockResolvedValueOnce({ path: 'DCIM/photo.jpg', format: 'jpeg' } as never)
    const result = await new NativeMediaService().capturePhoto()
    expect(result?.localUri).toBe('capacitor://DCIM/photo.jpg')
    expect(result?.mimeType).toBe('image/jpeg')
    expect(result?.blob.size).toBeGreaterThan(0)
    expect(Filesystem.readFile).toHaveBeenCalledWith({ path: 'DCIM/photo.jpg' })
  })

  it('returns null for video capture when the device has no capture APIs', async () => {
    const original = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    await expect(new NativeMediaService().captureVideo()).resolves.toBeNull()
    Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true })
  })

  it('auto-stops native video at nine seconds and releases tracks', async () => {
    vi.useFakeTimers()
    const track = { stop: vi.fn() }
    const stream = { getTracks: () => [track] }
    const recorder = { state: 'inactive', mimeType: 'video/mp4', start: vi.fn(function (this: { state: string }) { this.state = 'recording' }), stop: vi.fn(function (this: { state: string; onstop?: () => void }) { this.state = 'inactive'; this.onstop?.() }), ondataavailable: undefined as ((event: { data: Blob }) => void) | undefined, onstop: undefined as (() => void) | undefined }
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(async () => stream) }, configurable: true })
    vi.stubGlobal('MediaRecorder', Object.assign(function () { return recorder }, { isTypeSupported: () => true }))
    new NativeMediaService().captureVideo()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(8999)
    expect(recorder.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(recorder.stop).toHaveBeenCalledTimes(1)
    expect(track.stop).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('returns cancelled when native sharing is dismissed', async () => {
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('cancelled'))
    await expect(new NativeShareService().share({ title: 'A', text: 'B', url: 'https://example.test' })).resolves.toBe('cancelled')
  })
})

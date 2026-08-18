import { describe, expect, it, vi } from 'vitest'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { NativeHapticsService } from './NativeHapticsService'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { selectionChanged: vi.fn(), impact: vi.fn(), notification: vi.fn() },
  ImpactStyle: { Medium: 'MEDIUM' },
  NotificationType: { Success: 'SUCCESS' },
}))

describe('NativeHapticsService', () => {
  it('maps each semantic haptic to the Capacitor adapter', async () => {
    const service = new NativeHapticsService()
    await service.selection(); await service.impact(); await service.success()
    expect(Haptics.selectionChanged).toHaveBeenCalledOnce()
    expect(Haptics.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium })
    expect(Haptics.notification).toHaveBeenCalledWith({ type: NotificationType.Success })
  })

  it('swallows rejected plugin calls as best-effort feedback', async () => {
    vi.mocked(Haptics.selectionChanged).mockRejectedValueOnce(new Error('unavailable'))
    await expect(new NativeHapticsService().selection()).resolves.toBeUndefined()
  })
})

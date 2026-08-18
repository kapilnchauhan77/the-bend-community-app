import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import type { HapticsService } from '../contracts'

export class NativeHapticsService implements HapticsService {
  async selection(): Promise<void> { try { await Haptics.selectionChanged() } catch { /* best effort */ } }
  async impact(): Promise<void> { try { await Haptics.impact({ style: ImpactStyle.Medium }) } catch { /* best effort */ } }
  async success(): Promise<void> { try { await Haptics.notification({ type: NotificationType.Success }) } catch { /* best effort */ } }
}

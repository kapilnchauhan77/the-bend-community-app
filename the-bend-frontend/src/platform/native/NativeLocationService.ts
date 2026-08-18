import type { LocationService } from '../contracts'

export class NativeLocationService implements LocationService {
  async getForegroundPosition() {
    const { Geolocation } = await import('@capacitor/geolocation')
    const permission = await Geolocation.checkPermissions()
    const currentGranted = permission.location === 'granted' || permission.coarseLocation === 'granted'
    if (!currentGranted) {
      const requested = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
      const requestedGranted = requested.location === 'granted' || requested.coarseLocation === 'granted'
      if (!requestedGranted) throw Object.assign(new Error('Location access was not allowed'), { code: 'LOCATION_PERMISSION_DENIED' })
    }
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
  }
}

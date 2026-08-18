import type { LocationService } from '../contracts'

export class NativeLocationService implements LocationService {
  async getForegroundPosition() {
    const { Geolocation } = await import('@capacitor/geolocation')
    const permission = await Geolocation.checkPermissions()
    const current = permission.location
    if (current !== 'granted') {
      const requested = await Geolocation.requestPermissions()
      if (requested.location !== 'granted') throw Object.assign(new Error('Location access was not allowed'), { code: 'LOCATION_PERMISSION_DENIED' })
    }
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
  }
}

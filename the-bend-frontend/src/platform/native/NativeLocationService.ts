import type { LocationService } from '../contracts'

export class NativeLocationService implements LocationService {
  async getForegroundPosition() {
    const { Geolocation } = await import('@capacitor/geolocation')
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
    return { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }
  }
}

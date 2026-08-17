import { Capacitor } from '@capacitor/core'
import type { MediaSelection, MediaService } from '../contracts'

function decodeBase64(value: string, mimeType: string): Blob {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

async function fromPhoto(photo: { format?: string; path?: string; webPath?: string }): Promise<MediaSelection> {
  const mimeType = photo.format ? `image/${photo.format.toLowerCase()}` : 'image/jpeg'
  const localUri = photo.path || photo.webPath || ''
  const fileUri = photo.path || photo.webPath || ''
  const { Filesystem } = await import('@capacitor/filesystem')
  const read = await Filesystem.readFile({ path: fileUri })
  const blob = typeof read.data === 'string' ? decodeBase64(read.data, mimeType) : new Blob([read.data], { type: mimeType })
  const ext = mimeType.split('/')[1] || 'jpg'
  return { blob, localUri: Capacitor.convertFileSrc(localUri), mimeType, filename: `capture.${ext}` }
}

export class NativeMediaService implements MediaService {
  async pickPhoto() {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      return await fromPhoto(await Camera.getPhoto({ resultType: CameraResultType.Uri, source: CameraSource.Photos, quality: 92 }))
    } catch (error) {
      if (String((error as { message?: string })?.message || error).toLowerCase().includes('cancel')) return null
      throw error
    }
  }

  async capturePhoto() {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera')
      return await fromPhoto(await Camera.getPhoto({ resultType: CameraResultType.Uri, source: CameraSource.Camera, quality: 92, saveToGallery: false }))
    } catch (error) {
      if (String((error as { message?: string })?.message || error).toLowerCase().includes('cancel')) return null
      throw error
    }
  }

  async captureVideo() {
    // Capacitor's Camera plugin intentionally handles stills only. The native
    // WebView MediaRecorder path provides video without persisting its bytes.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
    try {
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
      recorder.start()
      window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 9000)
      await done
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      return { blob, localUri: URL.createObjectURL(blob), mimeType: blob.type, filename: 'capture.webm' }
    } finally {
      stream.getTracks().forEach((track) => track.stop())
    }
  }
}

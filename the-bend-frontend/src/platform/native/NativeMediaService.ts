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
  let blob: Blob
  if (photo.path) {
    const { Filesystem } = await import('@capacitor/filesystem')
    const read = await Filesystem.readFile({ path: photo.path })
    blob = typeof read.data === 'string' ? decodeBase64(read.data, mimeType) : new Blob([read.data], { type: mimeType })
  } else {
    const response = await fetch(photo.webPath || '')
    blob = await response.blob()
  }
  const ext = mimeType.split('/')[1] || 'jpg'
  return { blob, localUri: Capacitor.convertFileSrc(localUri), mimeType, filename: `capture.${ext}` }
}

export class NativeMediaService implements MediaService {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private resolveVideo: ((value: MediaSelection | null) => void) | null = null
  private timer: number | null = null
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
    const candidates = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported?.(type))
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    this.recorder = recorder; this.chunks = []
    return new Promise<MediaSelection | null>((resolve) => {
      this.resolveVideo = resolve
      recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data) }
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || mimeType || 'video/mp4' })
        stream.getTracks().forEach((track) => track.stop())
        this.recorder = null; this.chunks = []
        this.resolveVideo = null
        if (this.timer) { window.clearTimeout(this.timer); this.timer = null }
        resolve(blob.size ? { blob, localUri: URL.createObjectURL(blob), mimeType: blob.type, filename: `capture.${blob.type.includes('webm') ? 'webm' : 'mp4'}` } : null)
      }
      recorder.start()
      this.timer = window.setTimeout(() => this.stopVideoCapture(), 9000)
    })
  }

  stopVideoCapture() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
  }
}

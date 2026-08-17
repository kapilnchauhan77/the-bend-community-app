import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Video, X, RotateCcw, Check, Upload, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/services/api';
import { Capacitor } from '@capacitor/core';
import { usePlatformServices } from '@/platform/createPlatformServices';
import { UploadProgress } from '@/components/native/UploadProgress';

// Maximum recorded video length. Server enforces 10s; we cap a hair below
// so we never trip the server-side bound on slow clocks.
const MAX_VIDEO_SECONDS = 9;
// JPEG quality for still capture — tuned to keep typical 1080p frames
// well under the 25 MB server cap while preserving readable detail.
const PHOTO_QUALITY = 0.92;

export type CameraResult = {
  url: string;
  thumbnail_url: string | null;
  type: 'image' | 'video';
  duration_ms?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptured: (result: CameraResult) => void;
  mode?: 'photo' | 'video' | 'both';
  /**
   * Overrides the backend endpoint the captured blob is POSTed to. Defaults
   * to `/upload/media`. SettingsPage passes `/upload/avatar` so the avatar
   * side-effect (returning `{avatar_url}`) still fires; the wrapper
   * normalises both response shapes before calling `onCaptured`.
   */
  uploadEndpoint?: string;
};

type Stage = 'idle' | 'preview' | 'uploading';
type CaptureMode = 'photo' | 'video';

/**
 * In-app camera modal: live preview, photo + 9 s video capture, fallback file
 * picker. Releases the underlying MediaStream on close / unmount so the camera
 * indicator turns off even if the user dismisses via the X button mid-record.
 */
export function CameraCapture({
  open,
  onClose,
  onCaptured,
  mode = 'both',
  uploadEndpoint,
}: Props) {
  const services = usePlatformServices();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const nativeVideoPromiseRef = useRef<Promise<import('@/platform/contracts').MediaSelection | null> | null>(null);
  const uploadKeyRef = useRef(crypto.randomUUID());
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);

  const [activeMode, setActiveMode] = useState<CaptureMode>(
    mode === 'video' ? 'video' : 'photo'
  );
  const [stage, setStage] = useState<Stage>('idle');
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0); // 0..MAX_VIDEO_SECONDS (seconds)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedType, setCapturedType] = useState<CaptureMode>('photo');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStreamReady(false);
  }, []);

  const resetCapture = useCallback(() => {
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setUploadError(null);
    setStage('idle');
    setElapsed(0);
  }, [capturedPreviewUrl]);

  const handleClose = useCallback(() => {
    // Bail out of any in-flight recording before tearing the stream down.
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore — stream is going away anyway
      }
    }
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    stopStream();
    resetCapture();
    onClose();
  }, [onClose, resetCapture, stopStream]);

  // Acquire the camera when the modal opens; release it on close / unmount.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStreamError(null);
    setStreamReady(false);

    const startStream = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setStreamError('Camera not supported on this device.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `environment` = back camera on phones; desktops gracefully ignore.
          video: { facingMode: 'environment' },
          audio: mode !== 'photo',
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // iOS Safari requires explicit playsInline + a play() call; the
          // `autoPlay` attribute alone won't always trigger playback.
          videoRef.current.muted = true;
          try {
            await videoRef.current.play();
          } catch {
            // play() can throw if the element was unmounted mid-await
          }
        }
        setStreamReady(true);
      } catch {
        setStreamError(
          'Camera access denied or unavailable. Use the file picker below to upload from your library.'
        );
      }
    };

    startStream();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, mode, stopStream]);

  // Cleanup any lingering object URL when unmounting.
  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, [capturedPreviewUrl]);

  // Photo capture: paint current frame to canvas, JPEG-encode it.
  const takePhoto = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      void services.media.capturePhoto().then((selection) => {
        if (!selection) return;
        setCapturedBlob(selection.blob);
        setCapturedPreviewUrl(selection.localUri || URL.createObjectURL(selection.blob));
        setCapturedType('photo');
        setStage('preview');
        stopStream();
      }).catch(() => setStreamError('Camera access was denied. You can choose a photo below.'));
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const previewUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedPreviewUrl(previewUrl);
        setCapturedType('photo');
        setStage('preview');
        // Stop the stream after capture so the camera light goes off until
        // the user retakes — saves battery and signals "captured".
        stopStream();
      },
      'image/jpeg',
      PHOTO_QUALITY
    );
  }, [services.media, stopStream]);

  const stopRecordingInternal = useCallback(() => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (Capacitor.isNativePlatform()) {
      services.media.stopVideoCapture?.();
    }
    setRecording(false);
  }, [services.media]);

  // Video capture: MediaRecorder with mime fallback + 9 s auto-stop.
  const startRecording = useCallback(() => {
    if (Capacitor.isNativePlatform()) {
      nativeVideoPromiseRef.current = services.media.captureVideo();
      setRecording(true); setElapsed(0);
      nativeVideoPromiseRef.current.then((selection) => {
        nativeVideoPromiseRef.current = null; setRecording(false);
        if (!selection) { setStreamError('Video capture was cancelled or unavailable.'); return; }
        setCapturedBlob(selection.blob); setCapturedPreviewUrl(selection.localUri || URL.createObjectURL(selection.blob)); setCapturedType('video'); setStage('preview');
      }).catch(() => { nativeVideoPromiseRef.current = null; setRecording(false); setStreamError('Video capture is not supported on this device.'); });
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];
    // Probe webm first (Chrome/Firefox), then fall back to whatever the UA
    // picks (Safari historically gave us video/mp4 with the H.264 codec).
    let mimeType = '';
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4';
      }
    }
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      setStreamError('Recording is not supported in this browser.');
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'video/webm';
      const blob = new Blob(recordedChunksRef.current, { type });
      recordedChunksRef.current = [];
      if (blob.size === 0) return;
      const previewUrl = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setCapturedPreviewUrl(previewUrl);
      setCapturedType('video');
      setStage('preview');
      stopStream();
    };

    recordStartRef.current = Date.now();
    recorder.start();
    setRecording(true);
    setElapsed(0);

    // Tick at 100ms so the countdown ring animates smoothly without leaning
    // on requestAnimationFrame (which pauses on backgrounded tabs).
    recordTimerRef.current = window.setInterval(() => {
      const secs = (Date.now() - recordStartRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_VIDEO_SECONDS) {
        stopRecordingInternal();
      }
    }, 100);
  }, [services.media, stopRecordingInternal, stopStream]);

  const handleRecordPress = useCallback(() => {
    if (recording) {
      stopRecordingInternal();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecordingInternal]);

  // Fallback file picker — when getUserMedia is denied or unsupported, or
  // when the user just prefers to attach an existing photo / clip.
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const previewUrl = URL.createObjectURL(file);
    setCapturedBlob(file);
    setCapturedPreviewUrl(previewUrl);
    setCapturedType(isVideo ? 'video' : 'photo');
    setStage('preview');
    stopStream();
    e.target.value = '';
  };

  // Wraps either `/upload/media` (default) or an override like `/upload/avatar`.
  // Normalises the two response shapes the backend may return.
  const performUpload = useCallback(async () => {
    if (!capturedBlob) return;
    setStage('uploading');
    setUploadProgress(0);
    setUploadError(null);
    try {
      const fd = new FormData();
      const ext =
        capturedBlob.type === 'video/webm'
          ? 'webm'
          : capturedBlob.type === 'video/mp4'
            ? 'mp4'
            : 'jpg';
      const filename = (capturedBlob as File).name || `capture.${ext}`;
      fd.append('file', capturedBlob, filename);
      const endpoint = uploadEndpoint || '/upload/media';
      const res = await api.post(endpoint, fd, {
        headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': uploadKeyRef.current },
        onUploadProgress: (event) => { if (event.total) setUploadProgress(Math.round((event.loaded / event.total) * 100)); },
      });
      const data = res.data as Record<string, unknown>;
      let result: CameraResult;
      if (typeof data.avatar_url === 'string') {
        // Avatar endpoint: { avatar_url }
        const url = data.avatar_url as string;
        result = { url, thumbnail_url: url, type: 'image' };
      } else {
        // /upload/media envelope: { url, thumbnail_url, type, duration_ms? }
        result = {
          url: String(data.url || ''),
          thumbnail_url:
            (data.thumbnail_url as string | null | undefined) ?? null,
          type: (data.type as 'image' | 'video' | undefined) ?? 'image',
          duration_ms: data.duration_ms as number | undefined,
        };
      }
      onCaptured(result);
      resetCapture();
      onClose();
    } catch {
      setUploadError(
        'Upload failed. Check your connection and try again, or pick a smaller file.'
      );
      setStage('preview');
    }
  }, [capturedBlob, onCaptured, onClose, resetCapture, uploadEndpoint]);

  if (!open) return null;

  const showToggle = mode === 'both';
  const ringProgress = Math.min(elapsed / MAX_VIDEO_SECONDS, 1);
  const ringDashOffset = 2 * Math.PI * 32 * (1 - ringProgress);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm md:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex w-full h-full md:h-auto md:max-h-[90vh] md:w-[480px] md:rounded-2xl bg-[hsl(30,15%,10%)] text-white shadow-2xl overflow-hidden flex-col">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <button
            onClick={handleClose}
            aria-label="Close camera"
            className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
          {showToggle && stage === 'idle' && (
            <div className="flex items-center gap-1 bg-black/50 rounded-full p-1">
              <button
                onClick={() => setActiveMode('photo')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  activeMode === 'photo'
                    ? 'bg-white text-[hsl(30,15%,10%)]'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Camera size={12} className="inline mr-1" />
                Photo
              </button>
              <button
                onClick={() => setActiveMode('video')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  activeMode === 'video'
                    ? 'bg-white text-[hsl(30,15%,10%)]'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                <Video size={12} className="inline mr-1" />
                Video
              </button>
            </div>
          )}
          <div className="w-9" />
        </div>

        {/* Live preview */}
        {stage === 'idle' && (
          <div className="flex-1 flex flex-col justify-end relative bg-black min-h-[60vh] md:min-h-[480px]">
            {streamError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                <div className="max-w-xs">
                  <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
                  <p className="text-sm text-white/80 mb-4">{streamError}</p>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {!streamReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white/70" />
                  </div>
                )}
              </>
            )}

            {/* Bottom controls */}
            <div className="relative z-10 px-6 pb-10 pt-6 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-4">
              {activeMode === 'video' && recording && (
                <div className="text-sm font-mono font-semibold text-red-400">
                  {elapsed.toFixed(1)}s / {MAX_VIDEO_SECONDS}s
                </div>
              )}

              {/* Shutter / record */}
              {activeMode === 'photo' ? (
                <button
                  onClick={takePhoto}
                  disabled={!streamReady}
                  aria-label="Take photo"
                  className="w-20 h-20 rounded-full bg-white border-4 border-white/30 disabled:opacity-50 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
                >
                  <span className="w-14 h-14 rounded-full bg-white border-2 border-[hsl(30,15%,10%)]" />
                </button>
              ) : (
                <div className="relative w-20 h-20">
                  {/* Countdown ring */}
                  <svg
                    className="absolute inset-0 -rotate-90"
                    width="80"
                    height="80"
                    viewBox="0 0 80 80"
                  >
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="4"
                      fill="none"
                    />
                    {recording && (
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="hsl(0, 84%, 60%)"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={2 * Math.PI * 32}
                        strokeDashoffset={ringDashOffset}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 100ms linear' }}
                      />
                    )}
                  </svg>
                  <button
                    onClick={handleRecordPress}
                    disabled={!streamReady}
                    aria-label={recording ? 'Stop recording' : 'Start recording'}
                    className="absolute inset-2 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
                  >
                    {recording ? (
                      <span className="w-6 h-6 rounded-sm bg-white" />
                    ) : (
                      <span className="w-12 h-12 rounded-full bg-red-500 border-2 border-white" />
                    )}
                  </button>
                </div>
              )}

              {/* Fallback file picker — always visible */}
              <label className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white cursor-pointer underline-offset-2 hover:underline">
                <Upload size={13} />
                <span>
                  {streamError ? 'Pick a file from your library' : 'Or pick from library'}
                </span>
                <input
                  type="file"
                  accept={
                    mode === 'photo'
                      ? 'image/*'
                      : mode === 'video'
                        ? 'video/*'
                        : 'image/*,video/*'
                  }
                  capture="environment"
                  className="hidden"
                  onChange={handleFilePicked}
                />
              </label>
            </div>
          </div>
        )}

        {/* Preview-before-upload */}
        {stage === 'preview' && capturedPreviewUrl && (
          <div className="flex-1 flex flex-col bg-black min-h-[60vh] md:min-h-[480px]">
            <div className="flex-1 relative flex items-center justify-center bg-black">
              {capturedType === 'photo' ? (
                <img
                  src={capturedPreviewUrl}
                  alt="Captured"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <video
                  ref={previewVideoRef}
                  src={capturedPreviewUrl}
                  controls
                  playsInline
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
            <div className="px-6 pb-8 pt-5 bg-gradient-to-t from-black/90 to-black/40 flex flex-col gap-3">
              {uploadError && (
                <p className="text-xs text-red-300 text-center">{uploadError}</p>
              )}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    resetCapture();
                    // Re-open the camera so the user can try again.
                    if (!streamRef.current && open) {
                      setStreamError(null);
                      setStreamReady(false);
                      navigator.mediaDevices
                        ?.getUserMedia({
                          video: { facingMode: 'environment' },
                          audio: mode !== 'photo',
                        })
                        .then((stream) => {
                          streamRef.current = stream;
                          if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.muted = true;
                            videoRef.current.play().catch(() => {});
                          }
                          setStreamReady(true);
                        })
                        .catch(() => {
                          setStreamError(
                            'Camera access denied or unavailable. Use the file picker below.'
                          );
                        });
                    }
                  }}
                  className="flex-1 gap-2 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <RotateCcw size={14} />
                  Retake
                </Button>
                <Button
                  onClick={performUpload}
                  className="flex-1 gap-2 text-white cursor-pointer"
                  style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
                >
                  <Check size={14} />
                  Use this
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Upload spinner overlay */}
        {stage === 'uploading' && (
          <div className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-white">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="text-sm font-medium">Uploading…</p>
              <UploadProgress value={uploadProgress} />
            </div>
          </div>
        )}

        {/* Hidden canvas used for photo capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}

export default CameraCapture;

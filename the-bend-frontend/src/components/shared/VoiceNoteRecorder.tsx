import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  RotateCcw,
  Check,
  X,
  Upload,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadApi } from '@/services/uploadApi';

// Max recorded voice-note length. Server caps at 10 s; we stop at 9 so we
// never trip the bound on slow client clocks (mirrors CameraCapture).
const MAX_AUDIO_SECONDS = 9;

// Number of bars in the live visualizer — small enough that the analyser
// stays cheap even on low-end phones, dense enough to feel "alive".
const VISUALIZER_BARS = 24;

export type VoiceNoteResult = {
  url: string;
  thumbnail_url: string | null;
  type: 'audio';
  duration_ms: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCaptured: (result: VoiceNoteResult) => void;
};

type Stage = 'idle' | 'preview' | 'uploading';

/**
 * Voice-note recorder modal: requests mic access, records up to 9 s, shows
 * a live waveform-ish visualizer and countdown, then lets the user audition
 * the take before uploading. Falls back to a file picker when MediaRecorder
 * isn't available or the mic permission is denied.
 *
 * Always releases the underlying MediaStream + AudioContext on close so the
 * browser's "recording" indicator turns off promptly.
 */
export function VoiceNoteRecorder({ open, onClose, onCaptured }: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);

  // Web Audio analyser plumbing for the visualizer. Optional — we degrade
  // to a pulsing dot if AudioContext isn't available.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const [stage, setStage] = useState<Stage>('idle');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0); // 0..MAX_AUDIO_SECONDS (seconds)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedDuration, setCapturedDuration] = useState<number>(0); // seconds
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() =>
    Array(VISUALIZER_BARS).fill(0.05)
  );

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore
      }
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // ignore
      }
      analyserRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
  }, []);

  const resetCapture = useCallback(() => {
    if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
    setCapturedBlob(null);
    setCapturedPreviewUrl(null);
    setCapturedDuration(0);
    setUploadError(null);
    setStage('idle');
    setElapsed(0);
    setLevels(Array(VISUALIZER_BARS).fill(0.05));
  }, [capturedPreviewUrl]);

  const handleClose = useCallback(() => {
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

  // Acquire the mic when the modal opens; release it on close / unmount.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPermissionError(null);

    const startStream = async () => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setPermissionError('Microphone not supported on this device.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
      } catch {
        setPermissionError(
          'Microphone access denied or unavailable. Use the file picker below to send an existing audio clip.'
        );
      }
    };

    startStream();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, stopStream]);

  // Clean up object URLs and any leftover timers on unmount.
  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) URL.revokeObjectURL(capturedPreviewUrl);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    };
  }, [capturedPreviewUrl]);

  // Spin up the analyser and start the rAF visualizer loop.
  const startVisualizer = useCallback((stream: MediaStream) => {
    const AudioCtxCtor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AudioCtxCtor) return; // Older browser — fall back to the pulsing dot.

    try {
      const ctx = new AudioCtxCtor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // 32 frequency bins is plenty for ~24 bars.
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buf);
        // Sample evenly across bins so the bar count is independent of fftSize.
        const next: number[] = [];
        const step = Math.max(1, Math.floor(buf.length / VISUALIZER_BARS));
        for (let i = 0; i < VISUALIZER_BARS; i++) {
          const raw = buf[i * step] ?? 0;
          // Normalize + add a tiny floor so quiet rooms still feel "live".
          next.push(Math.max(0.05, raw / 255));
        }
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // Swallow — visualizer is non-essential.
    }
  }, []);

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
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setRecording(false);
  }, []);

  // Voice note capture: MediaRecorder with mime fallback + 9 s auto-stop.
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    recordedChunksRef.current = [];

    // Probe audio/webm first (Chrome / Firefox / desktop Edge). iOS Safari
    // doesn't support it as of writing — it'll fall through to audio/mp4,
    // then to the UA's default container if both are rejected.
    let mimeType = '';
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        // iOS Safari path — labels the .m4a as audio/mp4.
        mimeType = 'audio/mp4';
      }
    }

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch {
      setPermissionError('Recording is not supported in this browser.');
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || 'audio/webm';
      const blob = new Blob(recordedChunksRef.current, { type });
      recordedChunksRef.current = [];
      if (blob.size === 0) return;
      const previewUrl = URL.createObjectURL(blob);
      const finalDuration = Math.min(
        MAX_AUDIO_SECONDS,
        (Date.now() - recordStartRef.current) / 1000
      );
      setCapturedBlob(blob);
      setCapturedPreviewUrl(previewUrl);
      setCapturedDuration(finalDuration);
      setStage('preview');
    };

    recordStartRef.current = Date.now();
    recorder.start();
    setRecording(true);
    setElapsed(0);
    startVisualizer(stream);

    // 100ms cadence keeps the countdown smooth without bursting renders.
    recordTimerRef.current = window.setInterval(() => {
      const secs = (Date.now() - recordStartRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_AUDIO_SECONDS) {
        stopRecordingInternal();
      }
    }, 100);
  }, [startVisualizer, stopRecordingInternal]);

  const handleRecordPress = useCallback(() => {
    if (recording) {
      stopRecordingInternal();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecordingInternal]);

  // Fallback file picker — for browsers without MediaRecorder or when mic
  // permission is denied. Accepts any audio mime the server allows.
  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setPermissionError('Please pick an audio file.');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setCapturedBlob(file);
    setCapturedPreviewUrl(previewUrl);
    setCapturedDuration(0); // Will be filled in by the <audio> element's loadedmetadata.
    setStage('preview');
  };

  const performUpload = useCallback(async () => {
    if (!capturedBlob) return;
    setStage('uploading');
    setUploadError(null);
    try {
      const { data } = await uploadApi.uploadMedia(capturedBlob);
      // Normalise to our local result shape. Server returns type: 'audio'
      // for any audio mime; if it returned something else (file-picker edge
      // case), treat it defensively as audio since this component is
      // audio-only.
      onCaptured({
        url: data.url,
        thumbnail_url: data.thumbnail_url,
        type: 'audio',
        duration_ms:
          typeof data.duration_ms === 'number'
            ? data.duration_ms
            : Math.round(capturedDuration * 1000),
      });
      resetCapture();
      onClose();
    } catch {
      setUploadError(
        'Upload failed. Check your connection and try again, or pick a smaller file.'
      );
      setStage('preview');
    }
  }, [capturedBlob, capturedDuration, onCaptured, onClose, resetCapture]);

  if (!open) return null;

  const ringProgress = Math.min(elapsed / MAX_AUDIO_SECONDS, 1);
  const ringDashOffset = 2 * Math.PI * 32 * (1 - ringProgress);
  const remaining = Math.max(0, MAX_AUDIO_SECONDS - elapsed);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Record voice note"
    >
      <div className="relative flex w-full h-full md:h-auto md:max-h-[90vh] md:w-[400px] md:rounded-2xl bg-[hsl(30,15%,10%)] text-white shadow-2xl overflow-hidden flex-col">
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
          <button
            onClick={handleClose}
            aria-label="Close voice recorder"
            className="w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
            Voice note
          </span>
          <div className="w-9" />
        </div>

        {/* Idle / recording stage */}
        {stage === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-10 gap-8 min-h-[60vh] md:min-h-[420px]">
            {permissionError ? (
              <div className="text-center max-w-xs">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
                <p className="text-sm text-white/80">{permissionError}</p>
              </div>
            ) : (
              <>
                {/* Live visualizer — bars when AudioContext is available,
                    pulsing dot otherwise. */}
                <div className="flex items-end justify-center gap-[3px] h-16 w-full max-w-[260px]">
                  {audioCtxRef.current ? (
                    levels.map((v, i) => (
                      <span
                        key={i}
                        className="flex-1 rounded-full"
                        style={{
                          height: `${Math.max(8, v * 100)}%`,
                          backgroundColor: recording
                            ? 'hsl(0, 84%, 60%)'
                            : 'hsl(35, 25%, 55%)',
                          transition: 'height 80ms linear, background-color 200ms',
                        }}
                      />
                    ))
                  ) : (
                    <span
                      className={`w-4 h-4 rounded-full ${
                        recording
                          ? 'bg-red-500 animate-pulse'
                          : 'bg-white/40'
                      }`}
                    />
                  )}
                </div>

                {/* Timer */}
                <div className="font-mono font-semibold text-2xl text-white">
                  {recording
                    ? `${elapsed.toFixed(1)}s`
                    : `0.0s / ${MAX_AUDIO_SECONDS}s`}
                </div>

                {/* Record button with countdown ring */}
                <div className="relative w-20 h-20">
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
                    aria-label={recording ? 'Stop recording' : 'Start recording'}
                    className="absolute inset-2 rounded-full bg-red-500 hover:bg-red-600 disabled:opacity-50 active:scale-95 transition-transform cursor-pointer flex items-center justify-center"
                  >
                    {recording ? (
                      <Square size={22} className="text-white" />
                    ) : (
                      <Mic size={28} className="text-white" />
                    )}
                  </button>
                </div>

                {recording && (
                  <p className="text-xs text-white/60 -mt-2">
                    Auto-stops in {remaining.toFixed(1)}s
                  </p>
                )}
                {!recording && (
                  <p className="text-xs text-white/60 -mt-2 text-center max-w-xs">
                    Tap the mic to record. Max {MAX_AUDIO_SECONDS} seconds.
                  </p>
                )}
              </>
            )}

            {/* Fallback file picker — always available, even with mic granted. */}
            <label className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white cursor-pointer underline-offset-2 hover:underline">
              <Upload size={13} />
              <span>
                {permissionError ? 'Pick an audio file' : 'Or pick an audio file'}
              </span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFilePicked}
              />
            </label>
          </div>
        )}

        {/* Preview-before-upload */}
        {stage === 'preview' && capturedPreviewUrl && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8 gap-6 min-h-[60vh] md:min-h-[420px] bg-[hsl(30,15%,10%)]">
            <div className="w-20 h-20 rounded-full bg-[hsl(0,84%,60%)]/15 flex items-center justify-center">
              <Mic size={32} className="text-red-300" />
            </div>
            <div className="w-full max-w-[280px] flex flex-col items-center gap-3">
              <p className="text-sm text-white/80">
                Preview your voice note
                {capturedDuration > 0 && (
                  <span className="text-white/60">
                    {' '}
                    · {capturedDuration.toFixed(1)}s
                  </span>
                )}
              </p>
              <audio
                src={capturedPreviewUrl}
                controls
                preload="metadata"
                className="w-full"
                onLoadedMetadata={(e) => {
                  const dur = (e.currentTarget as HTMLAudioElement).duration;
                  // Filled in for file-picker flows; record flow already set it.
                  if (
                    !capturedDuration &&
                    Number.isFinite(dur) &&
                    dur > 0
                  ) {
                    setCapturedDuration(dur);
                  }
                }}
              />
            </div>

            {uploadError && (
              <p className="text-xs text-red-300 text-center">{uploadError}</p>
            )}
            <div className="flex gap-3 w-full max-w-[320px]">
              <Button
                variant="outline"
                onClick={resetCapture}
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
        )}

        {/* Upload spinner overlay */}
        {stage === 'uploading' && (
          <div className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-white">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="text-sm font-medium">Uploading…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceNoteRecorder;

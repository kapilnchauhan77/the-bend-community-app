import api from './api';
import axios from 'axios';

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 60;
export const VIDEO_DURATION_ERROR = 'Video must be a browser-playable MP4/H.264 or WebM/VP8/VP9 format with a valid duration';
const VIDEO_METADATA_TIMEOUT_MS = 2000;

export function extractUploadError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

function readVideoDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const timer = window.setTimeout(() => finishError(), VIDEO_METADATA_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      URL.revokeObjectURL(url);
      video.remove();
    };
    const finishError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Could not read video metadata'));
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (settled) return;
      settled = true;
      cleanup();
      resolve(duration);
    };
    video.onerror = finishError;
    video.src = url;
    video.load();
  });
}

export async function validateVideoFile(file: Blob): Promise<string | null> {
  if (!file.type.startsWith('video/')) return null;
  if (file.size > MAX_VIDEO_BYTES) return 'File too large (max 25 MB)';
  let duration: number;
  try {
    duration = await readVideoDuration(file);
  } catch {
    return VIDEO_DURATION_ERROR;
  }
  if (!Number.isFinite(duration) || duration <= 0) return VIDEO_DURATION_ERROR;
  if (duration > MAX_VIDEO_SECONDS) return 'Video must be 60 seconds or less';
  return null;
}

export const uploadApi = {
  uploadNonprofitDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ document_ref: string }>('/upload/nonprofit-document', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  uploadSponsorLogo: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ logo_url: string }>('/upload/sponsor-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  uploadImages: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post<{ images: Array<{ id: string; url: string; thumbnail_url: string }> }>(
      '/upload/images',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  uploadGuidelines: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload/guidelines', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getCurrentGuidelines: () => api.get('/upload/guidelines/current'),

  uploadPhoto: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ photo_url: string }>('/upload/photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ avatar_url: string }>('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Unified image / video / voice-note upload backing the in-app camera and
  // microphone flows. Video uses the shared 25 MB and 60 s policy; the camera
  // recorder stops at 59 s for timing headroom. Voice notes keep their existing
  // 9 s client and 10 s server limits and have no thumbnail.
  uploadMedia: (file: Blob | File) => {
    const fd = new FormData();
    const filename =
      (file as File).name ||
      `capture.${
        file.type.startsWith('video/webm')
          ? 'webm'
          : file.type.startsWith('video/mp4')
            ? 'mp4'
            : file.type === 'video/quicktime'
              ? 'mov'
            : file.type.startsWith('audio/')
              ? file.type === 'audio/webm'
                ? 'webm'
                : file.type === 'audio/mp4'
                  ? 'm4a'
                  : file.type === 'audio/mpeg'
                    ? 'mp3'
                    : 'webm'
              : 'jpg'
      }`;
    fd.append('file', file, filename);
    return api.post<{
      url: string;
      thumbnail_url: string | null;
      type: 'image' | 'video' | 'audio';
      duration_ms?: number;
    }>('/upload/media', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

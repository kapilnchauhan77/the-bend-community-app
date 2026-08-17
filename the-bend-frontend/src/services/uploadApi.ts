import api from './api';

export type UploadProgress = (percent: number) => void;
const anonymousClientId = (() => {
  const storageKey = 'bend.anonymous-client-id';
  const existing = typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function' ? localStorage.getItem(storageKey) : null;
  if (existing) return existing;
  const created = crypto.randomUUID();
  try { if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') localStorage.setItem(storageKey, created); } catch { /* storage may be unavailable */ }
  return created;
})();
const key = async (value: string | undefined, source: Blob | File | File[]) => {
  if (value) return value;
  const bytes = await new Response(source instanceof Array ? new Blob(source) : source).arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  digest[6] = (digest[6] & 0x0f) | 0x40; digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const uploadConfig = (idempotencyKey: string, onProgress?: UploadProgress, anonymous = false) => ({
  headers: { 'Content-Type': 'multipart/form-data', 'Idempotency-Key': idempotencyKey, ...(anonymous ? { 'X-Anonymous-Client-ID': anonymousClientId } : {}) },
  onUploadProgress: (event: { loaded: number; total?: number }) => {
    if (event.total && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
  },
});

export const uploadApi = {
  uploadImages: async (files: File[], idempotencyKey?: string, onProgress?: UploadProgress) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post<{ images: Array<{ id: string; url: string; thumbnail_url: string }> }>(
      '/upload/images',
      formData,
      uploadConfig(await key(idempotencyKey, files), onProgress)
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

  uploadPhoto: async (file: File, idempotencyKey?: string, onProgress?: UploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ photo_url: string }>('/upload/photo', formData, {
      ...uploadConfig(await key(idempotencyKey, file), onProgress, true),
    });
  },

  uploadAvatar: async (file: File, idempotencyKey?: string, onProgress?: UploadProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ avatar_url: string }>('/upload/avatar', formData, {
      ...uploadConfig(await key(idempotencyKey, file), onProgress),
    });
  },

  // Unified image / video / voice-note upload backing the in-app camera and
  // microphone flows. Server enforces 25 MB and 10 s caps; client also caps
  // recording at 9 s. Voice notes have no thumbnail.
  uploadMedia: async (file: Blob | File, idempotencyKey?: string, onProgress?: UploadProgress) => {
    const fd = new FormData();
    const filename =
      (file as File).name ||
      `capture.${
        file.type === 'video/webm'
          ? 'webm'
          : file.type === 'video/mp4'
            ? 'mp4'
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
      ...uploadConfig(await key(idempotencyKey, file), onProgress),
    });
  },
};

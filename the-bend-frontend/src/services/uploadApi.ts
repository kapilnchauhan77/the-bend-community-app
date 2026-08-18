import api from './api';

export const uploadApi = {
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
  // microphone flows. Server enforces 25 MB and 10 s caps; client also caps
  // recording at 9 s. Voice notes have no thumbnail.
  uploadMedia: (file: Blob | File) => {
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
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

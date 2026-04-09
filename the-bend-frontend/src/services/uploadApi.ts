import api from './api';

export const uploadApi = {
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

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ avatar_url: string }>('/upload/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

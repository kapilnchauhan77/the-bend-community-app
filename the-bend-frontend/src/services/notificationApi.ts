import api from './api';

export const notificationApi = {
  getNotifications: (params?: Record<string, string | boolean>) =>
    api.get('/notifications', { params }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  dismiss: (id: string) => api.delete(`/notifications/${id}`),
  markAllRead: () => api.patch('/notifications/read-all'),
  getUnreadCount: () => api.get<{ unread_count: number }>('/notifications/unread-count'),
  registerPushSubscription: (data: { endpoint: string; keys: Record<string, string> }) =>
    api.post('/notifications/push-subscription', data),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (data: { push_enabled: boolean; message_received: boolean; listing_interest_received: boolean; registration_decision: boolean; urgent_listing_published: boolean }) =>
    api.put('/notifications/preferences', data),
  registerInstallation: (installationId: string, data: { platform: 'ios' | 'android'; provider_token: string; token?: string; app_version: string; build_number: string; locale: string }) =>
    api.put(`/devices/installations/${installationId}`, data),
  disableInstallation: (installationId: string) => api.delete(`/devices/installations/${installationId}`),
  revokeInstallation: (installationId: string, revocationSecret: string) =>
    api.post(`/devices/installations/${installationId}/revoke`, { revocation_secret: revocationSecret }),
};

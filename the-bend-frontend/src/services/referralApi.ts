import api from './api';

export interface ReferralCreatePayload {
  referred_name: string;
  referred_email: string;
  referred_county_name: string;
  referred_message?: string;
}

export interface ReferralAdvancePayload {
  status: 'pending' | 'contacted' | 'demo_scheduled' | 'launched' | 'expired';
  super_admin_notes?: string;
  resulting_tenant_id?: string;
}

export const referralApi = {
  // Community admin
  listMine: () => api.get('/referrals'),
  create: (data: ReferralCreatePayload) => api.post('/referrals', data),

  // Super admin
  listAll: (status?: string) =>
    api.get('/super-admin/referrals', { params: status ? { status } : undefined }),
  advance: (id: string, data: ReferralAdvancePayload) =>
    api.post(`/super-admin/referrals/${id}/advance`, data),
};

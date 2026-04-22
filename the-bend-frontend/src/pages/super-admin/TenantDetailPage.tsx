import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, UserPlus, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Navbar } from '@/components/layout/Navbar';
import api from '@/services/api';
import type { TenantAdmin } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ active_shops: number; active_listings: number; total_users: number; total_events: number } | null>(null);
  const [form, setForm] = useState({
    display_name: '',
    tagline: '',
    about_text: '',
    hero_image_url: '',
    logo_url: '',
    primary_color: '',
    footer_text: '',
  });
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminForm, setAdminForm] = useState({ email: '', password: '', name: '' });
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      api.get(`/super-admin/tenants/${tenantId}`),
      api.get(`/super-admin/tenants/${tenantId}/stats`),
    ])
      .then(([tenantRes, statsRes]) => {
        const t = tenantRes.data;
        setTenant(t);
        setForm({
          display_name: t.display_name || '',
          tagline: t.tagline || '',
          about_text: t.about_text || '',
          hero_image_url: t.hero_image_url || '',
          logo_url: t.logo_url || '',
          primary_color: t.primary_color || '',
          footer_text: t.footer_text || '',
        });
        setStats(statsRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const res = await api.put(`/super-admin/tenants/${tenantId}`, form);
      setTenant(res.data);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setCreatingAdmin(true);
    try {
      await api.post(`/super-admin/tenants/${tenantId}/admin`, adminForm);
      setShowAdminForm(false);
      setAdminForm({ email: '', password: '', name: '' });
      alert('Community admin created successfully');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to create admin');
    } finally {
      setCreatingAdmin(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="h-8 w-48 bg-gray-200 animate-pulse rounded mb-6" />
          <div className="h-96 bg-gray-100 animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          <p className="text-gray-500">Tenant not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        <button
          onClick={() => navigate('/super-admin/tenants')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Tenants
        </button>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded flex items-center justify-center text-white font-bold font-serif text-lg"
              style={{ backgroundColor: tenant.primary_color || PRIMARY }}
            >
              {tenant.slug[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold font-serif" style={{ color: PRIMARY }}>
                {tenant.display_name}
              </h1>
              <p className="text-xs text-gray-500">{tenant.subdomain}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Active Shops', value: stats.active_shops },
              { label: 'Active Listings', value: stats.active_listings },
              { label: 'Total Users', value: stats.total_users },
              { label: 'Total Events', value: stats.total_events },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-gray-200 p-4 text-center">
                <div className="text-2xl font-bold font-serif" style={{ color: PRIMARY }}>{value}</div>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Branding Form */}
        <div className="bg-white border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold font-serif mb-4" style={{ color: PRIMARY }}>
            Branding & Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Display Name</Label>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div>
              <Label>Tagline</Label>
              <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </div>
            <div>
              <Label>Hero Image URL</Label>
              <Input value={form.hero_image_url} onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })} />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
            </div>
            <div>
              <Label>Primary Color</Label>
              <Input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} placeholder="hsl(160,25%,24%)" />
            </div>
            <div>
              <Label>Footer Text</Label>
              <Input value={form.footer_text} onChange={(e) => setForm({ ...form, footer_text: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>About Text</Label>
              <textarea
                value={form.about_text}
                onChange={(e) => setForm({ ...form, about_text: e.target.value })}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[100px]"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleSave} disabled={saving} className="text-white" style={{ backgroundColor: BRONZE }}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Admin Management */}
        <div className="bg-white border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-serif" style={{ color: PRIMARY }}>
              Community Admin
            </h2>
            <Button
              onClick={() => setShowAdminForm(!showAdminForm)}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <UserPlus className="w-4 h-4 mr-1" />
              Create Admin
            </Button>
          </div>

          {showAdminForm && (
            <form onSubmit={handleCreateAdmin} className="border border-gray-200 p-4 space-y-3 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={adminForm.name}
                    onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                    placeholder="Community Admin"
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={adminForm.email}
                    onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                    placeholder="admin@community.app"
                    required
                  />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={adminForm.password}
                    onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                    placeholder="Min 8 characters"
                    required
                    minLength={8}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creatingAdmin} className="text-white text-xs" style={{ backgroundColor: BRONZE }}>
                  {creatingAdmin ? 'Creating...' : 'Create'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAdminForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <p className="text-sm text-gray-500">
            Community admins manage their tenant's shops, listings, events, and other content.
          </p>
        </div>
      </div>
    </div>
  );
}

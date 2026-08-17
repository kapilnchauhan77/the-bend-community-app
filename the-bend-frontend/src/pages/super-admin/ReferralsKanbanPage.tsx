import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, Save, ArrowLeft } from 'lucide-react';
import { referralApi } from '@/services/referralApi';
import { parseServerDate } from '@/lib/utils';
import type { TenantReferral, ReferralStatus, TenantAdmin } from '@/types';
import api from '@/services/api';

const PRIMARY = 'hsl(160, 25%, 24%)';

const columns: { key: ReferralStatus; title: string }[] = [
  { key: 'pending', title: 'Pending' },
  { key: 'contacted', title: 'Contacted' },
  { key: 'demo_scheduled', title: 'Demo Scheduled' },
  { key: 'launched', title: 'Launched' },
  { key: 'expired', title: 'Expired' },
];

export default function ReferralsKanbanPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TenantReferral[]>([]);
  const [tenants, setTenants] = useState<TenantAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<TenantReferral | null>(null);
  const [form, setForm] = useState<{ status: ReferralStatus; super_admin_notes: string; resulting_tenant_id: string }>({
    status: 'pending',
    super_admin_notes: '',
    resulting_tenant_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [refRes, tenantRes] = await Promise.all([
        referralApi.listAll(),
        api.get('/super-admin/tenants'),
      ]);
      setItems(refRes.data?.items ?? []);
      setTenants(tenantRes.data?.items ?? []);
    } catch {
      setItems([]);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (ref: TenantReferral) => {
    setEditing(ref);
    setForm({
      status: ref.status,
      super_admin_notes: ref.super_admin_notes || '',
      resulting_tenant_id: ref.resulting_tenant_id || '',
    });
    setErr(null);
  };

  const save = async () => {
    if (!editing) return;
    if (form.status === 'launched' && !form.resulting_tenant_id) {
      setErr('Pick the resulting tenant before marking as launched.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await referralApi.advance(editing.id, {
        status: form.status,
        super_admin_notes: form.super_admin_notes || undefined,
        resulting_tenant_id: form.status === 'launched' ? form.resulting_tenant_id : undefined,
      });
      setEditing(null);
      await load();
    } catch (e: unknown) {
      const x = e as { response?: { data?: { detail?: string } } };
      setErr(x?.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const grouped: Record<ReferralStatus, TenantReferral[]> = {
    pending: [], contacted: [], demo_scheduled: [], launched: [], expired: [],
  };
  for (const r of items) grouped[r.status].push(r);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        <button
          onClick={() => navigate('/super-admin/tenants')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Tenants
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold font-serif" style={{ color: PRIMARY }}>
            Tenant Referrals
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track and advance community-leader referrals through the funnel.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {columns.map((col) => (
              <div key={col.key} className="bg-white border border-gray-200 rounded-lg p-3 min-h-[300px]">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                    {col.title}
                  </h2>
                  <Badge variant="outline" className="text-[10px]">
                    {grouped[col.key].length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {grouped[col.key].map((ref) => (
                    <Card
                      key={ref.id}
                      className="border-gray-200 hover:border-[hsl(35,45%,42%)] cursor-pointer transition-colors"
                      onClick={() => openEdit(ref)}
                    >
                      <CardContent className="p-3">
                        <div className="text-sm font-semibold text-gray-900 line-clamp-1">
                          {ref.referred_name}
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-1">
                          {ref.referred_county_name}
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-500">
                          From {ref.referrer_tenant_name || '—'}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1">
                          {parseServerDate(ref.created_at).toLocaleDateString('en-US', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {grouped[col.key].length === 0 && (
                    <p className="text-xs text-gray-400 italic text-center py-4">empty</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.referred_name}</DialogTitle>
            <DialogDescription>
              {editing?.referred_county_name} · {editing?.referred_email}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 text-sm">
              <div className="text-xs text-muted-foreground">
                Referred by {editing.referrer_user_name || '—'} ({editing.referrer_tenant_name || '—'}) on{' '}
                {parseServerDate(editing.created_at).toLocaleDateString()}
              </div>
              {editing.referred_message && (
                <div className="rounded bg-amber-50 border border-amber-200 p-3 text-sm italic text-gray-700">
                  "{editing.referred_message}"
                </div>
              )}
              <div>
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => setForm(f => ({ ...f, status: e.target.value as ReferralStatus }))}
                  className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
                >
                  <option value="pending">Pending</option>
                  <option value="contacted">Contacted</option>
                  <option value="demo_scheduled">Demo Scheduled</option>
                  <option value="launched">Launched</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              {form.status === 'launched' && (
                <div>
                  <Label htmlFor="resulting">Resulting Tenant</Label>
                  <select
                    id="resulting"
                    value={form.resulting_tenant_id}
                    onChange={(e) => setForm(f => ({ ...f, resulting_tenant_id: e.target.value }))}
                    className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white"
                  >
                    <option value="">— pick the new tenant —</option>
                    {tenants
                      .filter(t => t.id !== editing.referrer_tenant_id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.display_name} ({t.slug})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Reward of {editing.reward_amount || 6} free months will be granted automatically.
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="notes">Internal Notes</Label>
                <Textarea
                  id="notes"
                  value={form.super_admin_notes}
                  onChange={(e) => setForm(f => ({ ...f, super_admin_notes: e.target.value }))}
                  rows={3}
                  placeholder="Demo on Tue 3pm; spoke with chamber director…"
                  className="mt-1"
                />
              </div>
              {err && <div className="text-xs text-red-600">{err}</div>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="gap-2 text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

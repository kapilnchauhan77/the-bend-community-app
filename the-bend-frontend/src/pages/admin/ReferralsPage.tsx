import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Gift, Users, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { referralApi } from '@/services/referralApi';
import { parseServerDate } from '@/lib/utils';
import type { TenantReferral, ReferralSummary, ReferralStatus } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

const statusOrder: ReferralStatus[] = ['pending', 'contacted', 'demo_scheduled', 'launched', 'expired'];

const statusLabel: Record<ReferralStatus, string> = {
  pending: 'Pending',
  contacted: 'Contacted',
  demo_scheduled: 'Demo Scheduled',
  launched: 'Launched',
  expired: 'Expired',
};

const statusStyles: Record<ReferralStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  contacted: 'bg-blue-50 text-blue-700 border-blue-200',
  demo_scheduled: 'bg-violet-50 text-violet-700 border-violet-200',
  launched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function ReferralsPage() {
  const [items, setItems] = useState<TenantReferral[]>([]);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [form, setForm] = useState({
    referred_name: '',
    referred_email: '',
    referred_county_name: '',
    referred_message: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await referralApi.listMine();
      setItems(res.data?.items ?? []);
      setSummary(res.data?.summary ?? null);
    } catch {
      setItems([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await referralApi.create(form);
      setForm({ referred_name: '', referred_email: '', referred_county_name: '', referred_message: '' });
      setMsg({ ok: true, text: 'Referral submitted. We\'ll reach out and keep you posted.' });
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setMsg({ ok: false, text: err?.response?.data?.detail || 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif', color: PRIMARY }}>
            Refer a County
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Know a community leader who'd love this for their county? Refer them and earn 6 months free
            on your tenant when they launch.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-[hsl(35,18%,87%)]">
            <CardContent className="pt-5 pb-5 text-center">
              <Users size={18} className="mx-auto mb-1 text-muted-foreground" />
              <div className="text-2xl font-bold" style={{ color: PRIMARY }}>
                {summary?.total_referrals ?? 0}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Total Referrals
              </div>
            </CardContent>
          </Card>
          <Card className="border-[hsl(35,18%,87%)]">
            <CardContent className="pt-5 pb-5 text-center">
              <CheckCircle size={18} className="mx-auto mb-1 text-emerald-600" />
              <div className="text-2xl font-bold text-emerald-700">{summary?.launched ?? 0}</div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Launched
              </div>
            </CardContent>
          </Card>
          <Card className="border-[hsl(35,18%,87%)]">
            <CardContent className="pt-5 pb-5 text-center">
              <Gift size={18} className="mx-auto mb-1" style={{ color: BRONZE }} />
              <div className="text-2xl font-bold" style={{ color: BRONZE }}>
                {summary?.free_months_earned ?? 0}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Free Months Earned
              </div>
            </CardContent>
          </Card>
        </div>

        {/* New referral form */}
        <Card className="border-[hsl(35,18%,87%)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ color: PRIMARY }}>
              <Send size={18} />
              Refer a Neighboring County
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ref-name" className="text-sm">Their name</Label>
                  <Input
                    id="ref-name"
                    required
                    value={form.referred_name}
                    onChange={(e) => setForm(f => ({ ...f, referred_name: e.target.value }))}
                    placeholder="e.g. Jamie Carter"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ref-email" className="text-sm">Their email</Label>
                  <Input
                    id="ref-email"
                    type="email"
                    required
                    value={form.referred_email}
                    onChange={(e) => setForm(f => ({ ...f, referred_email: e.target.value }))}
                    placeholder="jamie@countyseat.gov"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ref-county" className="text-sm">Their county</Label>
                <Input
                  id="ref-county"
                  required
                  value={form.referred_county_name}
                  onChange={(e) => setForm(f => ({ ...f, referred_county_name: e.target.value }))}
                  placeholder="e.g. Lancaster County, VA"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ref-message" className="text-sm">Why they'd be a good fit (optional)</Label>
                <Textarea
                  id="ref-message"
                  value={form.referred_message}
                  onChange={(e) => setForm(f => ({ ...f, referred_message: e.target.value }))}
                  placeholder="A few sentences about the community, who you'd connect us with, anything that helps."
                  rows={4}
                  className="mt-1"
                />
              </div>
              {msg && (
                <div
                  className={`text-sm rounded px-3 py-2 ${
                    msg.ok
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}
                >
                  {msg.text}
                </div>
              )}
              <Button
                type="submit"
                disabled={submitting}
                className="text-white gap-2"
                style={{ backgroundColor: PRIMARY }}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? 'Submitting…' : 'Submit Referral'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* History */}
        <Card className="border-[hsl(35,18%,87%)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2" style={{ color: PRIMARY }}>
              <Clock size={18} />
              Your Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No referrals yet. Refer a county above to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {items.map((r) => (
                  <div
                    key={r.id}
                    className="border border-[hsl(35,18%,90%)] rounded-md p-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{r.referred_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.referred_county_name} · {r.referred_email}
                      </div>
                      {r.reward_granted_at && r.reward_amount ? (
                        <div className="text-xs mt-1.5" style={{ color: BRONZE }}>
                          Reward earned: {r.reward_amount} months free
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant="outline" className={statusStyles[r.status]}>
                        {statusLabel[r.status]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {parseServerDate(r.created_at).toLocaleDateString('en-US', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground italic">
          Status legend: {statusOrder.map(s => statusLabel[s]).join(' → ')}
        </p>
      </div>
    </AdminLayout>
  );
}

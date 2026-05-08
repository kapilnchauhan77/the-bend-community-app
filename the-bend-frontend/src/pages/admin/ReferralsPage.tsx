import { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Send, Gift, Users, CheckCircle, Clock, Loader2,
  ArrowDown, Handshake, Sparkles, MailCheck, Rocket,
} from 'lucide-react';
import { referralApi } from '@/services/referralApi';
import { parseServerDate } from '@/lib/utils';
import type { TenantReferral, ReferralSummary, ReferralStatus } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';
const INK = 'hsl(30, 18%, 14%)';
const CREAM = 'hsl(40, 30%, 95%)';

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

function Ornament({ color = BRONZE }: { color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="block h-px w-8" style={{ backgroundColor: color }} />
      <span className="block w-1 h-1 rotate-45" style={{ backgroundColor: color }} />
      <span className="block h-px w-8" style={{ backgroundColor: color }} />
    </div>
  );
}

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
      setMsg({ ok: true, text: "Referral submitted. We'll reach out and keep you posted." });
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
      <div className="space-y-12 max-w-4xl">
        {/* ─────────── HERO ─────────── */}
        <section
          className="relative rounded-lg overflow-hidden border"
          style={{ borderColor: 'hsl(35,18%,82%)' }}
        >
          {/* Cream background with subtle paper grain */}
          <div className="absolute inset-0" style={{ backgroundColor: CREAM }} />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.05] pointer-events-none"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
          {/* Gold accent rule */}
          <div
            aria-hidden
            className="absolute top-0 inset-x-0 h-[3px]"
            style={{ background: `linear-gradient(90deg, transparent, ${BRONZE}, transparent)` }}
          />

          <div className="relative px-8 py-12 md:px-14 md:py-16">
            <div
              className="text-[10px] tracking-[0.4em] uppercase mb-5 flex items-center gap-3"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              <Sparkles size={12} />
              Founding Ambassador Program
            </div>
            <h1
              className="font-bold leading-[1.02] tracking-[-0.02em]"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", serif',
                color: INK,
                fontSize: 'clamp(2.25rem, 5vw, 3.5rem)',
              }}
            >
              Bring The Bend to a <em style={{ color: PRIMARY }}>neighboring county.</em>
            </h1>
            <p
              className="text-lg md:text-xl leading-relaxed mt-5 max-w-2xl"
              style={{ color: 'hsl(30,12%,30%)' }}
            >
              Every county we add makes the whole network stronger. If you know a community leader
              in a neighboring county, send them a warm intro — and we'll reward you with{' '}
              <strong style={{ color: BRONZE }}>6 months of free platform fees</strong> the day
              they go live.
            </p>

            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <Ornament />
              <Button
                onClick={() => {
                  document.getElementById('refer-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-white text-xs tracking-[0.2em] uppercase gap-2"
                style={{ backgroundColor: PRIMARY }}
              >
                Refer a County
                <ArrowDown size={14} />
              </Button>
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-xs tracking-[0.2em] uppercase border-b cursor-pointer"
                style={{ color: INK, borderColor: INK, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                See how it works
              </a>
            </div>
          </div>
        </section>

        {/* ─────────── BENEFITS ─────────── */}
        <section>
          <div className="text-center mb-8">
            <div
              className="text-[10px] tracking-[0.4em] uppercase mb-3"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              § Why It's Worth Your Time
            </div>
            <h2
              className="font-bold tracking-[-0.01em]"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", serif',
                color: INK,
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              }}
            >
              You help. We reward. <em style={{ color: PRIMARY }}>Everyone wins.</em>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                num: '01',
                Icon: Gift,
                title: '6 months free',
                body: 'Each referral that launches earns your tenant a half-year of free platform fees. Multiple referrals stack.',
              },
              {
                num: '02',
                Icon: Handshake,
                title: 'Help your region',
                body: 'A connected network of nearby counties means your local businesses can hire, lend, and trade across county lines.',
              },
              {
                num: '03',
                Icon: Rocket,
                title: 'White-glove for them',
                body: "We do all the heavy lifting — branded subdomain, seeded businesses, demo call. Your friend just shows up.",
              },
            ].map((b) => (
              <Card key={b.num} className="border-[hsl(35,18%,87%)] relative overflow-hidden">
                <CardContent className="p-6 pt-7">
                  <div
                    className="font-bold leading-none mb-3 absolute top-3 right-4 opacity-20"
                    style={{ fontSize: '3rem', color: BRONZE, fontFamily: 'Georgia, serif' }}
                  >
                    {b.num}
                  </div>
                  <b.Icon size={22} style={{ color: BRONZE }} className="mb-3" />
                  <h3
                    className="text-lg font-semibold mb-2"
                    style={{ fontFamily: 'Georgia, serif', color: INK }}
                  >
                    {b.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{b.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ─────────── HOW IT WORKS ─────────── */}
        <section id="how-it-works">
          <div className="text-center mb-10">
            <div
              className="text-[10px] tracking-[0.4em] uppercase mb-3"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              § How It Works
            </div>
            <h2
              className="font-bold tracking-[-0.01em]"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", serif',
                color: INK,
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              }}
            >
              From handshake to launch in <em style={{ color: PRIMARY }}>under a week.</em>
            </h2>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
            {[
              {
                step: 'I.',
                Icon: MailCheck,
                title: 'You introduce',
                body: 'Drop their name, email, and county below — plus a sentence on why they\'d be a good fit. We send the intro from your name.',
              },
              {
                step: 'II.',
                Icon: Handshake,
                title: 'We talk',
                body: 'Our team has a 20-minute call with them. No pressure, no sales script — just listening for what makes their county theirs.',
              },
              {
                step: 'III.',
                Icon: Rocket,
                title: 'They launch',
                body: 'We raise their subdomain, seed local businesses, and hand them the keys. They\'re live in days, not months.',
              },
              {
                step: 'IV.',
                Icon: Gift,
                title: 'You\'re rewarded',
                body: '6 months of free platform fees apply to your tenant automatically. We email you the moment it kicks in.',
              },
            ].map((s) => (
              <li key={s.step} className="grid grid-cols-[auto_1fr] gap-4">
                <div
                  className="italic font-bold leading-none flex-shrink-0"
                  style={{ color: BRONZE, fontFamily: 'Georgia, serif', fontSize: '2rem' }}
                >
                  {s.step}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <s.Icon size={18} style={{ color: PRIMARY }} />
                    <h3
                      className="text-lg font-semibold"
                      style={{ fontFamily: 'Georgia, serif', color: INK }}
                    >
                      {s.title}
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ─────────── PULL QUOTE / SOCIAL PROOF ─────────── */}
        <section
          className="relative rounded-lg border px-8 py-10 text-center"
          style={{ borderColor: 'hsl(35,18%,82%)', backgroundColor: 'hsl(40,28%,93%)' }}
        >
          <Ornament />
          <blockquote
            className="italic mt-4 mb-3"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              fontSize: 'clamp(1.25rem, 2.4vw, 1.75rem)',
              color: PRIMARY,
              lineHeight: 1.3,
            }}
          >
            "The platforms that build community fastest aren't the ones with the best ads —
            they're the ones whose users invite their neighbors."
          </blockquote>
          <div
            className="text-[10px] tracking-[0.3em] uppercase"
            style={{ color: 'hsl(30,12%,40%)', fontFamily: 'ui-sans-serif, system-ui' }}
          >
            — The Bend, Founding Charter
          </div>
        </section>

        {/* ─────────── YOUR REWARDS SUMMARY ─────────── */}
        <section>
          <div className="text-center mb-6">
            <div
              className="text-[10px] tracking-[0.4em] uppercase mb-3"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              § Your Ledger
            </div>
            <h2
              className="font-bold tracking-[-0.01em]"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", serif',
                color: INK,
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              }}
            >
              Where you stand
            </h2>
          </div>
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
        </section>

        {/* ─────────── REFER FORM ─────────── */}
        <section id="refer-form" className="scroll-mt-6">
          <Card className="border-[hsl(35,18%,87%)] shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle
                className="text-xl flex items-center gap-2"
                style={{ fontFamily: 'Georgia, serif', color: PRIMARY }}
              >
                <Send size={20} />
                Refer a Neighboring County
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Submit one referral. We handle the rest.
              </p>
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
        </section>

        {/* ─────────── HISTORY ─────────── */}
        <section>
          <Card className="border-[hsl(35,18%,87%)]">
            <CardHeader className="pb-3">
              <CardTitle
                className="text-base flex items-center gap-2"
                style={{ color: PRIMARY }}
              >
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
              <p className="text-[10px] text-muted-foreground italic mt-4 text-center">
                Status legend: {statusOrder.map(s => statusLabel[s]).join(' → ')}
              </p>
            </CardContent>
          </Card>
        </section>

        {/* ─────────── FAQ ─────────── */}
        <section>
          <div className="text-center mb-6">
            <div
              className="text-[10px] tracking-[0.4em] uppercase mb-3"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              § Common Questions
            </div>
            <h2
              className="font-bold tracking-[-0.01em]"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", serif',
                color: INK,
                fontSize: 'clamp(1.4rem, 2.8vw, 1.85rem)',
              }}
            >
              Good to know
            </h2>
          </div>
          <div className="space-y-3">
            {[
              {
                q: 'How many counties can I refer?',
                a: 'As many as you like. Each successful launch stacks 6 free months on your tenant.',
              },
              {
                q: 'What counts as "launched"?',
                a: 'When the new county has a live subdomain, an active community admin, and at least one shop posting. We confirm before granting the reward.',
              },
              {
                q: 'What if my friend never responds?',
                a: 'After 30 days with no response we mark the referral as Expired. No effect on you — feel free to refer them again later or refer someone else.',
              },
              {
                q: "Can I refer someone I don't know personally?",
                a: 'Best results come from people who already know you. We send the intro using your name, so a cold lead may be skeptical. Use this for your real network.',
              },
              {
                q: 'Is there a cash alternative to free months?',
                a: 'Not yet. We may add cash credits or revenue share later — for now, the reward is in platform fees.',
              },
            ].map((f, i) => (
              <details
                key={i}
                className="group rounded-md border border-[hsl(35,18%,87%)] bg-white open:bg-[hsl(40,25%,98%)]"
              >
                <summary
                  className="cursor-pointer list-none flex items-center justify-between p-4 text-sm font-semibold"
                  style={{ color: INK, fontFamily: 'Georgia, serif' }}
                >
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45 text-xl leading-none">
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ─────────── CLOSER ─────────── */}
        <section className="text-center pt-4 pb-10">
          <Ornament />
          <p
            className="italic mt-4 mb-5"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              fontSize: '1.15rem',
              color: 'hsl(30,12%,30%)',
            }}
          >
            Every neighbor you bring makes the next one easier.
          </p>
          <Button
            onClick={() => {
              document.getElementById('refer-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="text-white text-xs tracking-[0.2em] uppercase gap-2"
            style={{ backgroundColor: PRIMARY }}
          >
            Refer a County
            <ArrowDown size={14} />
          </Button>
        </section>
      </div>
    </AdminLayout>
  );
}

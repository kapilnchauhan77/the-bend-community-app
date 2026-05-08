import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import {
  ArrowDown, Gift, Handshake, Sparkles, Rocket, MailCheck,
  Users, MapPin, Award,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/context/TenantContext';

const PRIMARY_DEFAULT = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';
const INK = 'hsl(30, 18%, 14%)';
const CREAM = 'hsl(40, 30%, 95%)';

function Ornament({ color = BRONZE }: { color?: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="block h-px w-12" style={{ backgroundColor: color }} />
      <span className="block w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color }} />
      <span className="block h-px w-12" style={{ backgroundColor: color }} />
    </div>
  );
}

export default function ReferralLandingPage() {
  const navigate = useNavigate();
  const tenant = useTenant();
  const { isAuthenticated, user } = useAuthStore();
  const PRIMARY = tenant.primary_color || PRIMARY_DEFAULT;

  const isCommunityAdmin = isAuthenticated && (user?.role === 'community_admin' || user?.role === 'super_admin');

  const handleRefer = () => {
    if (isCommunityAdmin) {
      navigate('/admin/referrals#refer-form');
      return;
    }
    if (isAuthenticated) {
      // Logged in but not an admin — show a friendly prompt and route to mailto
      window.location.href = `mailto:support@proline-online.com?subject=I want to refer a county`;
      return;
    }
    navigate('/login');
  };

  return (
    <PageLayout>
      {/* ─────────── HERO ─────────── */}
      <section
        className="relative overflow-hidden border-b"
        style={{ borderColor: 'hsl(35,18%,82%)' }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: CREAM }} />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
        <div
          aria-hidden
          className="absolute top-0 inset-x-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, transparent, ${BRONZE}, transparent)` }}
        />

        <div className="relative max-w-5xl mx-auto px-6 md:px-10 py-20 md:py-28 text-center">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-6 inline-flex items-center gap-3"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            <Sparkles size={12} />
            Founding Ambassador Program
            <Sparkles size={12} />
          </div>
          <h1
            className="font-bold leading-[1.02] tracking-[-0.02em] mb-6"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              color: INK,
              fontSize: 'clamp(2.5rem, 7vw, 5rem)',
            }}
          >
            Bring The Bend to <br />
            <em style={{ color: PRIMARY }}>your neighboring county.</em>
          </h1>
          <p
            className="text-xl md:text-2xl leading-relaxed max-w-3xl mx-auto mb-10"
            style={{ color: 'hsl(30,12%,30%)' }}
          >
            Know a community leader who'd love this for their county? Refer them — and we'll
            reward you with <strong style={{ color: BRONZE }}>6 months of free platform fees</strong>{' '}
            the day they go live.
          </p>

          <div className="mb-10">
            <Ornament />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={handleRefer}
              className="text-white text-xs tracking-[0.3em] uppercase gap-3 px-8 py-6"
              style={{ backgroundColor: PRIMARY }}
            >
              {isCommunityAdmin ? 'Refer a County Now' : 'Become an Ambassador'}
              <ArrowDown size={14} />
            </Button>
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-xs tracking-[0.3em] uppercase border-b cursor-pointer"
              style={{ color: INK, borderColor: INK, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              See how it works
            </a>
          </div>

          {!isCommunityAdmin && (
            <p
              className="text-xs mt-8 italic"
              style={{ color: 'hsl(30,12%,45%)', fontFamily: 'Georgia, serif' }}
            >
              Already a community admin?{' '}
              <button
                onClick={() => navigate('/admin/referrals')}
                className="underline hover:no-underline"
                style={{ color: BRONZE }}
              >
                Refer from your admin panel →
              </button>
            </p>
          )}
        </div>
      </section>

      {/* ─────────── BENEFITS ─────────── */}
      <section className="max-w-6xl mx-auto px-6 md:px-10 py-20">
        <div className="text-center mb-12">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-4"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            § Why It's Worth Your Time
          </div>
          <h2
            className="font-bold tracking-[-0.01em]"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              color: INK,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
            }}
          >
            You help. We reward. <em style={{ color: PRIMARY }}>Everyone wins.</em>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ backgroundColor: 'hsl(35,18%,80%)' }}>
          {[
            {
              num: '01',
              Icon: Gift,
              title: '6 months free',
              body: 'Each referral that launches earns your tenant a half-year of free platform fees. Multiple referrals stack — refer three counties, you\'re free for a year and a half.',
            },
            {
              num: '02',
              Icon: Handshake,
              title: 'A stronger region',
              body: 'A connected network of nearby counties means your local businesses can hire across county lines, share equipment, and trade surplus. Bigger network, more opportunities.',
            },
            {
              num: '03',
              Icon: Rocket,
              title: 'White-glove onboarding for them',
              body: "We do all the heavy lifting — branded subdomain, seeded businesses, a kick-off call. Your friend just shows up and gets handed the keys to a working platform.",
            },
          ].map((b) => (
            <div
              key={b.num}
              className="relative p-8 md:p-10"
              style={{ backgroundColor: CREAM }}
            >
              <div
                className="font-bold leading-none mb-5 absolute top-3 right-5 opacity-15"
                style={{ fontSize: '5rem', color: BRONZE, fontFamily: 'Georgia, serif' }}
              >
                {b.num}
              </div>
              <b.Icon size={28} style={{ color: BRONZE }} className="mb-4" />
              <h3
                className="text-xl md:text-[22px] font-semibold mb-3"
                style={{ fontFamily: 'Georgia, serif', color: INK }}
              >
                {b.title}
              </h3>
              <p className="text-base leading-relaxed" style={{ color: 'hsl(30,12%,32%)' }}>
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────── PULL QUOTE ─────────── */}
      <section
        className="border-y"
        style={{ borderColor: 'hsl(35,18%,82%)', backgroundColor: 'hsl(40,28%,93%)' }}
      >
        <div className="max-w-3xl mx-auto px-6 md:px-10 py-20 md:py-24 text-center">
          <Ornament />
          <blockquote
            className="italic mt-6 mb-5"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              fontSize: 'clamp(1.5rem, 3vw, 2.25rem)',
              color: PRIMARY,
              lineHeight: 1.25,
            }}
          >
            "The platforms that build community fastest aren't the ones with the best ads —
            they're the ones whose users invite their neighbors."
          </blockquote>
          <div
            className="text-[10px] tracking-[0.4em] uppercase"
            style={{ color: 'hsl(30,12%,40%)', fontFamily: 'ui-sans-serif, system-ui' }}
          >
            — The Bend, Founding Charter
          </div>
        </div>
      </section>

      {/* ─────────── HOW IT WORKS ─────────── */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 md:px-10 py-20">
        <div className="text-center mb-16">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-4"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            § How It Works
          </div>
          <h2
            className="font-bold tracking-[-0.01em]"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              color: INK,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
            }}
          >
            From handshake to launch in <em style={{ color: PRIMARY }}>under a week.</em>
          </h2>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
          {[
            {
              step: 'I.',
              Icon: MailCheck,
              title: 'You introduce',
              body: 'Drop their name, email, and county into the form — plus a sentence on why they\'d be a good fit. We send the warm intro from your name.',
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
              body: 'We raise their subdomain, seed local businesses, and hand them the admin keys. They\'re live in days, not months.',
            },
            {
              step: 'IV.',
              Icon: Gift,
              title: 'You\'re rewarded',
              body: '6 months of free platform fees apply to your tenant automatically. We email you the moment it kicks in.',
            },
          ].map((s) => (
            <li key={s.step} className="grid grid-cols-[auto_1fr] gap-5">
              <div
                className="italic font-bold leading-none flex-shrink-0"
                style={{ color: BRONZE, fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)' }}
              >
                {s.step}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <s.Icon size={20} style={{ color: PRIMARY }} />
                  <h3
                    className="text-xl md:text-2xl font-semibold"
                    style={{ fontFamily: 'Georgia, serif', color: INK }}
                  >
                    {s.title}
                  </h3>
                </div>
                <p className="text-base leading-relaxed" style={{ color: 'hsl(30,12%,32%)' }}>
                  {s.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ─────────── WHO TO REFER ─────────── */}
      <section className="border-t" style={{ borderColor: 'hsl(35,18%,82%)', backgroundColor: 'hsl(40,25%,97%)' }}>
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-20">
          <div className="text-center mb-12">
            <div
              className="text-[10px] tracking-[0.5em] uppercase mb-4"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              § Who Makes a Great Referral
            </div>
            <h2
              className="font-bold tracking-[-0.01em]"
              style={{
                fontFamily: 'Georgia, "Cormorant Garamond", serif',
                color: INK,
                fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
              }}
            >
              Think of someone who…
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                Icon: Users,
                title: 'Cares about local',
                body: 'A chamber of commerce director, town manager, downtown development officer, or the friend who always knows who in town to call.',
              },
              {
                Icon: MapPin,
                title: 'Lives nearby',
                body: 'Best results come from neighboring counties — your residents and businesses already cross over for work, supplies, and events.',
              },
              {
                Icon: Award,
                title: 'Wants their county to thrive',
                body: 'They\'re looking for tools that bring their community together, not just another SaaS subscription.',
              },
            ].map((c) => (
              <div
                key={c.title}
                className="text-center p-6"
              >
                <c.Icon size={28} style={{ color: BRONZE }} className="mx-auto mb-4" />
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ fontFamily: 'Georgia, serif', color: INK }}
                >
                  {c.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'hsl(30,12%,38%)' }}>
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── FAQ ─────────── */}
      <section className="max-w-3xl mx-auto px-6 md:px-10 py-20">
        <div className="text-center mb-12">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-4"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            § Common Questions
          </div>
          <h2
            className="font-bold tracking-[-0.01em]"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              color: INK,
              fontSize: 'clamp(1.5rem, 3.5vw, 2.25rem)',
            }}
          >
            Good to know
          </h2>
        </div>
        <div className="space-y-3">
          {[
            {
              q: 'How many counties can I refer?',
              a: 'As many as you like. Each successful launch stacks 6 free months on your tenant. Refer three counties, you\'re fee-free for 18 months.',
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
              q: 'I\'m not a community admin yet — can I still refer?',
              a: 'The reward (6 months free fees) only applies to existing tenants. If you\'d like to bring The Bend to your own county first, write to us at support@proline-online.com and we\'ll get you set up.',
            },
            {
              q: 'Is there a cash alternative to free months?',
              a: 'Not yet. We may add cash credits or revenue share later — for now, the reward is in platform fees.',
            },
          ].map((f, i) => (
            <details
              key={i}
              className="group rounded-md border bg-white open:bg-[hsl(40,25%,98%)]"
              style={{ borderColor: 'hsl(35,18%,87%)' }}
            >
              <summary
                className="cursor-pointer list-none flex items-center justify-between p-5 text-base font-semibold"
                style={{ color: INK, fontFamily: 'Georgia, serif' }}
              >
                {f.q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45 text-2xl leading-none">
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-base leading-relaxed" style={{ color: 'hsl(30,12%,38%)' }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* ─────────── FINAL CTA ─────────── */}
      <section
        className="relative border-t py-20 md:py-28 text-center"
        style={{ borderColor: 'hsl(35,18%,82%)' }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${BRONZE}, transparent)` }}
        />
        <div className="max-w-3xl mx-auto px-6 md:px-10">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-6"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            § The Invitation
          </div>
          <h2
            className="font-bold leading-[1.05] tracking-[-0.02em] mb-8"
            style={{
              fontFamily: 'Georgia, "Cormorant Garamond", serif',
              color: INK,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            Every neighbor you bring <br />
            <em style={{ color: PRIMARY }}>makes the next one easier.</em>
          </h2>
          <p
            className="text-lg md:text-xl mb-10 leading-relaxed"
            style={{ color: 'hsl(30,12%,30%)' }}
          >
            Take 60 seconds. Drop a name and an email. We'll handle the rest.
          </p>
          <Button
            onClick={handleRefer}
            className="text-white text-xs tracking-[0.3em] uppercase gap-3 px-10 py-6"
            style={{ backgroundColor: PRIMARY }}
          >
            {isCommunityAdmin ? 'Refer a County Now' : 'Become an Ambassador'}
            <ArrowDown size={14} />
          </Button>
          <p
            className="mt-6 text-xs"
            style={{ color: 'hsl(30,12%,50%)', fontFamily: 'ui-sans-serif, system-ui' }}
          >
            Or write to{' '}
            <a
              href="mailto:support@proline-online.com"
              className="underline underline-offset-4"
              style={{ color: INK }}
            >
              support@proline-online.com
            </a>
          </p>
        </div>
      </section>
    </PageLayout>
  );
}

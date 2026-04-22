import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Mail } from 'lucide-react';

const INK = 'hsl(30, 18%, 14%)';
const CREAM = 'hsl(40, 30%, 95%)';
const FOREST = 'hsl(160, 28%, 22%)';
const BRONZE = 'hsl(32, 48%, 44%)';
const SAGE = 'hsl(80, 15%, 55%)';

// Reveal on scroll helper
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setShown(true),
      { threshold: 0.15 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return { ref, shown };
}

const grainSvg =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='512' height='512' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")";

function Ornament({ color = BRONZE }: { color?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="block h-px w-12" style={{ backgroundColor: color }} />
      <span className="block w-1.5 h-1.5 rotate-45" style={{ backgroundColor: color }} />
      <span className="block h-px w-12" style={{ backgroundColor: color }} />
    </div>
  );
}

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [community, setCommunity] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const phil = useReveal<HTMLDivElement>();
  const what = useReveal<HTMLDivElement>();
  const proof = useReveal<HTMLDivElement>();
  const how = useReveal<HTMLDivElement>();
  const features = useReveal<HTMLDivElement>();
  const cta = useReveal<HTMLDivElement>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Route to mailto for now — concrete sales follow-up
    const subject = encodeURIComponent(`Bring The Bend to ${community || 'my community'}`);
    const body = encodeURIComponent(
      `Hello,\n\nI would like to explore bringing The Bend to ${community}.\nContact: ${email}\n\n— A community leader`
    );
    window.location.href = `mailto:hello@bend.community?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

  return (
    <div
      className="min-h-screen antialiased"
      style={{
        backgroundColor: CREAM,
        color: INK,
        fontFamily: "'Cormorant Garamond', Georgia, serif",
      }}
    >
      {/* Persistent grain overlay */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-[5]"
        style={{
          backgroundImage: grainSvg,
          opacity: 0.06,
          mixBlendMode: 'multiply',
        }}
      />

      {/* ─────────── NAV ─────────── */}
      <header className="relative z-20 border-b" style={{ borderColor: 'hsl(35,20%,85%)' }}>
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center"
              style={{ border: `1.5px solid ${BRONZE}` }}
            >
              <span
                className="text-base font-bold"
                style={{ color: BRONZE, letterSpacing: '0.04em' }}
              >
                B
              </span>
            </div>
            <div className="leading-none">
              <div
                className="text-[15px] font-semibold tracking-[0.02em]"
                style={{ color: INK }}
              >
                THE BEND
              </div>
              <div
                className="text-[9px] tracking-[0.35em] uppercase mt-1"
                style={{ color: SAGE, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                Community Platform
              </div>
            </div>
          </div>

          <nav
            className="hidden md:flex items-center gap-8 text-[11px] tracking-[0.25em] uppercase"
            style={{ fontFamily: 'ui-sans-serif, system-ui', color: 'hsl(30,12%,35%)' }}
          >
            <a href="#philosophy" className="hover:text-[color:var(--ink)]" style={{ ['--ink' as any]: INK }}>
              Philosophy
            </a>
            <a href="#how" className="hover:opacity-60">How It Works</a>
            <a href="#communities" className="hover:opacity-60">Communities</a>
            <a
              href="#begin"
              className="px-4 py-2.5 text-white transition-transform hover:-translate-y-px"
              style={{ backgroundColor: INK }}
            >
              Begin
            </a>
          </nav>
        </div>
      </header>

      {/* ─────────── HERO ─────────── */}
      <section className="relative overflow-hidden">
        {/* Faint architectural drawing overlay */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url('/images/the-bend-hero.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.13,
            filter: 'sepia(20%) contrast(1.05)',
          }}
        />
        {/* Top-left ornamental label */}
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-4 relative">
          <div
            className="text-[10px] tracking-[0.5em] uppercase"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            Vol. I  ·  Est. 2026  ·  Bend.Community
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto px-6 md:px-10 pb-28 md:pb-36 relative">
          <div className="grid grid-cols-12 gap-6 items-end">
            <div className="col-span-12 md:col-span-8 lg:col-span-7">
              <h1
                className="font-bold leading-[0.92] tracking-[-0.02em] hero-reveal"
                style={{
                  fontSize: 'clamp(3rem, 10vw, 9rem)',
                  color: INK,
                }}
              >
                <span className="block">Your town,</span>
                <span className="block italic" style={{ color: FOREST }}>
                  reassembled.
                </span>
              </h1>
            </div>
            <div
              className="col-span-12 md:col-span-4 lg:col-span-4 md:col-start-9 hero-reveal"
              style={{ animationDelay: '0.3s' }}
            >
              <div
                className="text-[10px] tracking-[0.3em] uppercase mb-3"
                style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                A Note to the Reader
              </div>
              <p className="text-lg md:text-xl leading-relaxed" style={{ color: 'hsl(30,12%,28%)' }}>
                The Bend is a heritage community platform where local businesses share gigs, materials, and equipment — a digital Main Street built for <em>your</em> county, with your name on the door.
              </p>
            </div>
          </div>

          {/* Ornamental divider + CTAs */}
          <div className="mt-16 md:mt-20 flex flex-col md:flex-row items-start md:items-center gap-8 hero-reveal" style={{ animationDelay: '0.6s' }}>
            <Ornament />
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#begin"
                className="group inline-flex items-center gap-3 px-7 py-4 text-white text-[11px] tracking-[0.3em] uppercase transition-transform hover:-translate-y-0.5"
                style={{ backgroundColor: FOREST, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                Claim Your Community
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="https://westmoreland.bend.community"
                className="inline-flex items-center gap-2 px-1 py-4 text-[11px] tracking-[0.3em] uppercase border-b"
                style={{ color: INK, borderColor: INK, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                Tour a Live Community
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── PHILOSOPHY / PULL QUOTE ─────────── */}
      <section
        id="philosophy"
        ref={phil.ref}
        className={`relative border-y transition-opacity duration-1000 ${phil.shown ? 'opacity-100' : 'opacity-0'}`}
        style={{ borderColor: 'hsl(35,20%,82%)', backgroundColor: 'hsl(40,25%,92%)' }}
      >
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-24 md:py-32 text-center">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-8"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            § Our Philosophy
          </div>
          <blockquote
            className="italic leading-[1.1] tracking-[-0.01em]"
            style={{
              fontSize: 'clamp(1.75rem, 4.5vw, 3.75rem)',
              color: FOREST,
            }}
          >
            &ldquo;A platform isn&rsquo;t what a town needs.{' '}
            <span style={{ color: INK }}>A town is what a platform needs.</span>
            &rdquo;
          </blockquote>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Ornament />
            <div
              className="text-[11px] tracking-[0.3em] uppercase"
              style={{ color: 'hsl(30,12%,40%)', fontFamily: 'ui-sans-serif, system-ui' }}
            >
              — The Bend, Founding Charter
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── WHAT YOUR COMMUNITY GETS ─────────── */}
      <section
        ref={what.ref}
        className={`relative py-28 md:py-36 transition-all duration-1000 ${what.shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-12 gap-6 mb-20 items-end">
            <div className="col-span-12 md:col-span-7">
              <div
                className="text-[10px] tracking-[0.5em] uppercase mb-6"
                style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                § What Your Community Receives
              </div>
              <h2
                className="font-bold leading-[0.95] tracking-[-0.02em]"
                style={{ fontSize: 'clamp(2.25rem, 5vw, 4.5rem)', color: INK }}
              >
                Not software. <em style={{ color: FOREST }}>A town square.</em>
              </h2>
            </div>
            <div className="col-span-12 md:col-span-4 md:col-start-9">
              <p className="text-lg leading-relaxed" style={{ color: 'hsl(30,12%,32%)' }}>
                Everything is built into a single platform, branded to your county, populated with your neighbors — and ready to serve the day it launches.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ backgroundColor: 'hsl(35,18%,80%)' }}>
            {[
              {
                num: '01',
                title: 'A subdomain of your own',
                body: 'your-county.bend.community, branded with your colors, imagery, and verbiage. Google sees it as yours.',
              },
              {
                num: '02',
                title: 'A marketplace for neighbors',
                body: 'Local businesses post gigs, share materials, lend equipment. Volunteers enlist. Artists get hired.',
              },
              {
                num: '03',
                title: 'A calendar that fills itself',
                body: 'Events, markets, and heritage festivals flow in from every corner — manually or via automated connectors.',
              },
            ].map((item, i) => (
              <div
                key={item.num}
                className="relative p-10 md:p-12"
                style={{ backgroundColor: CREAM }}
              >
                <div
                  className="font-bold leading-none mb-6"
                  style={{ fontSize: '5rem', color: BRONZE, letterSpacing: '-0.03em' }}
                >
                  {item.num}
                </div>
                <h3
                  className="text-2xl md:text-[28px] font-semibold leading-tight mb-4"
                  style={{ color: INK }}
                >
                  {item.title}
                </h3>
                <p className="text-lg leading-relaxed" style={{ color: 'hsl(30,12%,32%)' }}>
                  {item.body}
                </p>
                {i < 2 && (
                  <div
                    className="hidden md:block absolute right-0 top-12 bottom-12 w-px"
                    style={{ backgroundColor: 'transparent' }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── SOCIAL PROOF — LIVE COMMUNITIES ─────────── */}
      <section
        id="communities"
        ref={proof.ref}
        className={`relative py-28 md:py-32 transition-opacity duration-1000 ${proof.shown ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: INK, color: CREAM }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: grainSvg }}
        />
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 relative">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
            <div>
              <div
                className="text-[10px] tracking-[0.5em] uppercase mb-6"
                style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                § Now Serving
              </div>
              <h2
                className="font-bold leading-[0.95] tracking-[-0.02em]"
                style={{ fontSize: 'clamp(2rem, 4.5vw, 4rem)' }}
              >
                Three counties. <em style={{ color: 'hsl(35, 50%, 70%)' }}>One platform.</em>
              </h2>
            </div>
            <div className="text-[11px] tracking-[0.3em] uppercase" style={{ color: 'hsl(35,30%,65%)', fontFamily: 'ui-sans-serif, system-ui' }}>
              Click any to visit →
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {[
              {
                slug: 'westmoreland',
                name: 'Westmoreland',
                tagline: 'Where the bends built a community',
                palette: 'hsl(160, 28%, 32%)',
                est: 'Est. 2026',
              },
              {
                slug: 'king-george',
                name: 'King George',
                tagline: 'Neighbors, connected',
                palette: 'hsl(220, 32%, 38%)',
                est: 'Est. 2026',
              },
              {
                slug: 'new-kent',
                name: 'New Kent',
                tagline: 'Virginia heritage, reassembled',
                palette: 'hsl(28, 48%, 38%)',
                est: 'Est. 2026',
              },
            ].map((c) => (
              <a
                key={c.slug}
                href={`https://${c.slug}.bend.community`}
                target="_blank"
                rel="noreferrer"
                className="group relative block p-8 md:p-10 transition-all duration-500 hover:-translate-y-1"
                style={{
                  backgroundColor: 'hsl(30, 18%, 18%)',
                  border: '1px solid hsl(30, 18%, 22%)',
                }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-0.5 transition-all"
                  style={{ backgroundColor: c.palette }}
                />
                <div
                  className="text-[10px] tracking-[0.4em] uppercase mb-4"
                  style={{ color: 'hsl(35, 30%, 55%)', fontFamily: 'ui-sans-serif, system-ui' }}
                >
                  {c.est}
                </div>
                <h3
                  className="font-bold leading-tight tracking-[-0.01em] mb-3"
                  style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)' }}
                >
                  {c.name}
                </h3>
                <p className="italic text-lg leading-relaxed mb-8" style={{ color: 'hsl(35, 25%, 72%)' }}>
                  {c.tagline}
                </p>
                <div
                  className="flex items-center justify-between text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: 'hsl(35, 30%, 65%)', fontFamily: 'ui-sans-serif, system-ui' }}
                >
                  <span>{c.slug}.bend.community</span>
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </div>
              </a>
            ))}
          </div>

          <div className="mt-16 text-center">
            <div
              className="inline-flex items-center gap-3 text-[11px] tracking-[0.3em] uppercase"
              style={{ color: 'hsl(35, 30%, 65%)', fontFamily: 'ui-sans-serif, system-ui' }}
            >
              <span className="block h-px w-8" style={{ backgroundColor: BRONZE }} />
              Yours could be next
              <span className="block h-px w-8" style={{ backgroundColor: BRONZE }} />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────── HOW IT WORKS ─────────── */}
      <section
        id="how"
        ref={how.ref}
        className={`relative py-28 md:py-36 transition-all duration-1000 ${how.shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="mb-16 md:mb-20">
            <div
              className="text-[10px] tracking-[0.5em] uppercase mb-6"
              style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
            >
              § How A Community Begins
            </div>
            <h2
              className="font-bold leading-[0.95] tracking-[-0.02em] max-w-4xl"
              style={{ fontSize: 'clamp(2.25rem, 5vw, 4.5rem)', color: INK }}
            >
              From handshake to launch in <em style={{ color: FOREST }}>under a week.</em>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-16">
            {[
              {
                step: 'I.',
                title: 'We talk',
                body: 'A 30-minute conversation. You describe your county, your character, your people. We listen for what makes your place unlike anywhere else.',
              },
              {
                step: 'II.',
                title: 'We compose',
                body: 'Your subdomain is raised. Your colors are mixed. Your imagery is selected. Your verbiage — the way your county sounds — is written into the platform itself.',
              },
              {
                step: 'III.',
                title: 'We plant the seed',
                body: 'Local businesses, events, volunteers, and talent are seeded. The platform opens its doors already alive — not an empty shell waiting for activity.',
              },
              {
                step: 'IV.',
                title: 'You lead',
                body: 'A Community Admin account hands you the keys. Approve registrations, feature businesses, curate events. The Bend remains yours to shape.',
              },
            ].map((s) => (
              <div key={s.step} className="grid grid-cols-[auto_1fr] gap-6 md:gap-8 items-start">
                <div
                  className="italic font-bold leading-none"
                  style={{
                    fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                    color: BRONZE,
                  }}
                >
                  {s.step}
                </div>
                <div>
                  <h3
                    className="text-2xl md:text-[30px] font-semibold leading-tight mb-3 pb-3 border-b"
                    style={{ color: INK, borderColor: 'hsl(35,20%,82%)' }}
                  >
                    {s.title}
                  </h3>
                  <p className="text-lg leading-relaxed" style={{ color: 'hsl(30,12%,32%)' }}>
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── FEATURES GRID (dark) ─────────── */}
      <section
        ref={features.ref}
        className={`relative py-24 md:py-32 transition-opacity duration-1000 ${features.shown ? 'opacity-100' : 'opacity-0'}`}
        style={{ backgroundColor: FOREST, color: CREAM }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.05]"
          style={{ backgroundImage: grainSvg }}
        />
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 relative">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
            <h2
              className="font-bold leading-[0.95] tracking-[-0.02em]"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              What&rsquo;s <em style={{ color: 'hsl(35, 50%, 70%)' }}>in the box.</em>
            </h2>
            <div
              className="text-[11px] tracking-[0.3em] uppercase"
              style={{ color: 'hsl(35, 40%, 70%)', fontFamily: 'ui-sans-serif, system-ui' }}
            >
              Everything, from day one
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-8 gap-x-12">
            {[
              'Gig board — part-time jobs & open shifts',
              'Materials marketplace — surplus & requests',
              'Equipment lending — tools, trucks, kilns',
              'Volunteer enrollment — time, skills, hours',
              'Talent directory — artists, tradespeople, musicians',
              'Community events — manual or auto-synced',
              'Business directory — endorsements, profiles',
              'Sponsor placements — homepage, footer, browse',
              'Community admin dashboard — approvals & reports',
              'Multi-role accounts — shop admins & employees',
              'Native push notifications & messaging',
              'Branded emails — your name on every thread',
            ].map((feat) => (
              <div key={feat} className="flex items-start gap-4 group">
                <Check
                  size={18}
                  strokeWidth={2}
                  className="mt-1.5 flex-shrink-0 transition-transform group-hover:scale-110"
                  style={{ color: 'hsl(35, 50%, 70%)' }}
                />
                <span className="text-lg leading-snug" style={{ color: 'hsl(35, 25%, 92%)' }}>
                  {feat}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────── CTA — Claim Your Community ─────────── */}
      <section
        id="begin"
        ref={cta.ref}
        className={`relative py-28 md:py-40 transition-all duration-1000 ${cta.shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${BRONZE}, transparent)`,
          }}
        />
        <div className="max-w-[1100px] mx-auto px-6 md:px-10 text-center">
          <div
            className="text-[10px] tracking-[0.5em] uppercase mb-8"
            style={{ color: BRONZE, fontFamily: 'ui-sans-serif, system-ui' }}
          >
            § The Invitation
          </div>

          <h2
            className="font-bold leading-[0.92] tracking-[-0.02em] mb-10"
            style={{ fontSize: 'clamp(2.5rem, 7vw, 6.5rem)', color: INK }}
          >
            Bring The Bend <br />
            <em style={{ color: FOREST }}>to your county.</em>
          </h2>

          <p
            className="text-xl md:text-2xl leading-relaxed max-w-2xl mx-auto mb-12"
            style={{ color: 'hsl(30,12%,30%)' }}
          >
            Tell us where you lead, and we&rsquo;ll raise your subdomain by the end of the week.
          </p>

          {!submitted ? (
            <form
              onSubmit={handleSubmit}
              className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-stretch"
            >
              <input
                type="text"
                required
                placeholder="Your county"
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
                className="px-5 py-4 bg-transparent text-lg outline-none focus:ring-2"
                style={{
                  border: `1px solid hsl(35,20%,75%)`,
                  color: INK,
                  fontFamily: "'Cormorant Garamond', serif",
                }}
              />
              <input
                type="email"
                required
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-5 py-4 bg-transparent text-lg outline-none focus:ring-2"
                style={{
                  border: `1px solid hsl(35,20%,75%)`,
                  color: INK,
                  fontFamily: "'Cormorant Garamond', serif",
                }}
              />
              <button
                type="submit"
                className="group px-8 py-4 text-white text-[11px] tracking-[0.3em] uppercase transition-transform hover:-translate-y-0.5 inline-flex items-center justify-center gap-3"
                style={{ backgroundColor: INK, fontFamily: 'ui-sans-serif, system-ui' }}
              >
                Begin
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </button>
            </form>
          ) : (
            <div
              className="inline-flex items-center gap-3 px-8 py-4 text-lg italic"
              style={{ color: FOREST, border: `1px solid ${FOREST}` }}
            >
              <Mail size={18} />
              Your email client is opening. We&rsquo;ll be in touch.
            </div>
          )}

          <div
            className="mt-10 text-[11px] tracking-[0.3em] uppercase"
            style={{ color: 'hsl(30,12%,45%)', fontFamily: 'ui-sans-serif, system-ui' }}
          >
            Or write to{' '}
            <a
              href="mailto:hello@bend.community"
              className="underline underline-offset-4"
              style={{ color: INK }}
            >
              hello@bend.community
            </a>
          </div>
        </div>
      </section>

      {/* ─────────── FOOTER ─────────── */}
      <footer
        className="relative border-t py-16"
        style={{ borderColor: 'hsl(35,20%,82%)', backgroundColor: 'hsl(40,28%,93%)' }}
      >
        <div className="max-w-[1400px] mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-10 items-center">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 flex items-center justify-center"
                style={{ border: `1.5px solid ${BRONZE}` }}
              >
                <span className="text-lg font-bold" style={{ color: BRONZE }}>B</span>
              </div>
              <div>
                <div className="text-xl font-semibold" style={{ color: INK }}>
                  The Bend
                </div>
                <div
                  className="text-[10px] tracking-[0.35em] uppercase mt-1"
                  style={{ color: SAGE, fontFamily: 'ui-sans-serif, system-ui' }}
                >
                  Community Platform · Est. 2026
                </div>
              </div>
            </div>
            <div
              className="md:text-right italic text-lg"
              style={{ color: 'hsl(30,12%,35%)' }}
            >
              &ldquo;Preserving community, one connection at a time.&rdquo;
            </div>
          </div>
        </div>
      </footer>

      {/* Keyframes */}
      <style>{`
        @keyframes heroReveal {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .hero-reveal {
          animation: heroReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AdPricing } from '@/types';
import { advertisingApi } from '@/services/advertisingApi';
import { eventApi } from '@/services/eventApi';
import { PageLayout } from '@/components/layout/PageLayout';

const HEADER_BG = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';
const CARD_BORDER = 'hsl(35, 18%, 84%)';
const CARD_BG = 'hsl(40, 20%, 98%)';
const SELECTED_BORDER = 'hsl(35, 45%, 42%)';

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdvertisePage() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [pricing, setPricing] = useState<AdPricing[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<AdPricing | null>(null);
  const [formData, setFormData] = useState({
    contact_name: '',
    contact_email: '',
    name: '',
    description: '',
    website_url: '',
    logo_url: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'select' | 'details' | 'connector' | 'success'>('select');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadingPricing, setLoadingPricing] = useState(true);

  // Connector purchase state
  const [connectorForm, setConnectorForm] = useState({
    business_name: '', website_url: '', contact_name: '', contact_email: '', notes: '',
  });
  const [connectorSubmitting, setConnectorSubmitting] = useState(false);

  useEffect(() => {
    if (sessionId) {
      setStep('success');
      advertisingApi.checkStatus(sessionId).then((res) => {
        const status = res.data?.status;
        if (status === 'paid' || status === 'complete') {
          setStatusMessage('Payment received! Your ad is being reviewed and will be live within 24 hours.');
        } else {
          setStatusMessage('Your session was found. An admin will review your submission shortly.');
        }
      }).catch(() => {
        setStatusMessage('Payment received! Your ad is being reviewed and will be live within 24 hours.');
      });
      return;
    }

    setLoadingPricing(true);
    advertisingApi.getPricing().then((res) => {
      setPricing(res.data.items || []);
    }).catch(() => {
      setPricing([]);
    }).finally(() => {
      setLoadingPricing(false);
    });
  }, [sessionId]);

  function handleSelectPlan(plan: AdPricing) {
    setSelectedPlan(plan);
    setStep('details');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlan) return;
    setSubmitting(true);
    try {
      const res = await advertisingApi.createCheckout({
        pricing_id: selectedPlan.id,
        name: formData.name,
        description: formData.description || undefined,
        website_url: formData.website_url || undefined,
        logo_url: formData.logo_url || undefined,
        contact_email: formData.contact_email,
        contact_name: formData.contact_name,
      });
      const checkoutUrl = res.data?.checkout_url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch {
      setSubmitting(false);
    }
  }

  if (step === 'success') {
    return (
      <PageLayout>
        {/* Header */}
        <div style={{ background: HEADER_BG }} className="py-10 px-4">
          <div className="max-w-4xl mx-auto">
            <nav className="text-xs mb-3" style={{ color: 'hsl(160, 15%, 65%)' }}>
              <Link to="/" className="hover:underline">Home</Link>
              <span className="mx-2">/</span>
              <span style={{ color: 'hsl(35, 45%, 65%)' }}>Advertise</span>
            </nav>
            <h1 className="font-serif text-3xl font-bold text-white tracking-wide">Advertise with Us</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="mb-6" style={{ color: BRONZE }}>
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-4" style={{ color: 'hsl(160, 25%, 24%)' }}>
            {statusMessage || 'Payment received! Your ad is being reviewed and will be live within 24 hours.'}
          </h2>
          <p className="text-sm mb-8" style={{ color: 'hsl(35, 10%, 45%)' }}>
            Thank you for supporting the community. You'll receive a confirmation email once your ad goes live.
          </p>
          <Link
            to="/"
            className="inline-block px-6 py-3 font-semibold text-white text-sm rounded"
            style={{ background: BRONZE }}
          >
            Return Home
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      {/* Header */}
      <div style={{ background: HEADER_BG }} className="py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <nav className="text-xs mb-3" style={{ color: 'hsl(160, 15%, 65%)' }}>
            <Link to="/" className="hover:underline">Home</Link>
            <span className="mx-2">/</span>
            <span style={{ color: 'hsl(35, 45%, 65%)' }}>Advertise</span>
          </nav>
          <h1 className="font-serif text-3xl font-bold text-white tracking-wide">Advertise with Us</h1>
          <p className="mt-2 text-sm" style={{ color: 'hsl(160, 15%, 72%)' }}>
            Reach the local community with a featured placement on our platform
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-12">
        {/* How It Works */}
        <section className="mb-14">
          <h2 className="font-serif text-xl font-bold mb-6" style={{ color: 'hsl(160, 25%, 24%)' }}>How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '1', title: 'Choose a Placement', body: 'Browse available ad placements and select the one that best fits your business goals.' },
              { num: '2', title: 'Submit Your Details', body: 'Provide your business information and ad copy so we can review your listing.' },
              { num: '3', title: 'Pay & Go Live', body: 'Pay securely via Stripe and your ad will be live within 24 hours after admin review.' },
            ].map((step) => (
              <div
                key={step.num}
                className="flex gap-4 p-5 rounded border"
                style={{ borderColor: CARD_BORDER, background: 'white' }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-serif font-bold text-white text-sm flex-shrink-0 mt-0.5"
                  style={{ background: BRONZE }}
                >
                  {step.num}
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-1" style={{ color: 'hsl(160, 25%, 24%)' }}>{step.title}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'hsl(35, 10%, 45%)' }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Example Sponsor Card */}
        <section className="mb-14">
          <h2 className="font-serif text-xl font-bold mb-2" style={{ color: 'hsl(160, 25%, 24%)' }}>What Your Ad Looks Like</h2>
          <p className="text-xs mb-6" style={{ color: 'hsl(35, 10%, 50%)' }}>
            Here's an example of how your sponsor card will appear across the platform.
          </p>
          <div className="max-w-sm mx-auto">
            <div
              className="rounded border p-5 text-center"
              style={{ borderColor: CARD_BORDER, background: CARD_BG }}
            >
              <div
                className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-xl font-bold font-serif text-white"
                style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
              >
                P
              </div>
              <h3 className="font-serif font-bold text-base mb-1" style={{ color: 'hsl(30, 15%, 18%)' }}>
                Provoke
              </h3>
              <p className="text-xs leading-relaxed mb-2" style={{ color: 'hsl(35, 10%, 45%)' }}>
                1 workspace every AI workflow.
              </p>
              <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: BRONZE }}>
                Launching Spring 2026
              </p>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'hsl(35, 18%, 88%)' }}>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: 'hsl(35, 10%, 60%)' }}>
                  Community Partner
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        {step === 'select' && (
          <section className="mb-14">
            <h2 className="font-serif text-xl font-bold mb-6" style={{ color: 'hsl(160, 25%, 24%)' }}>
              Available Placements
            </h2>
            {loadingPricing ? (
              <div className="text-center py-16" style={{ color: 'hsl(35, 10%, 55%)' }}>
                <div className="text-sm">Loading pricing options...</div>
              </div>
            ) : pricing.length === 0 ? (
              <div
                className="text-center py-16 border rounded"
                style={{ borderColor: CARD_BORDER, color: 'hsl(35, 10%, 55%)' }}
              >
                <p className="text-sm">No pricing options available at this time. Please check back soon.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {pricing.map((plan) => {
                  const isSelected = selectedPlan?.id === plan.id;
                  return (
                    <div
                      key={plan.id}
                      className="rounded border p-6 flex flex-col transition-all duration-150"
                      style={{
                        borderColor: isSelected ? SELECTED_BORDER : CARD_BORDER,
                        borderWidth: isSelected ? '2px' : '1px',
                        background: 'white',
                        boxShadow: isSelected ? `0 0 0 1px ${SELECTED_BORDER}20` : undefined,
                      }}
                    >
                      <h3 className="font-serif text-lg font-bold mb-1" style={{ color: 'hsl(160, 25%, 24%)' }}>
                        {plan.name}
                      </h3>
                      {plan.description && (
                        <p className="text-xs leading-relaxed mb-3" style={{ color: 'hsl(35, 10%, 50%)' }}>
                          {plan.description}
                        </p>
                      )}
                      <div className="mt-auto">
                        <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: 'hsl(35, 10%, 55%)' }}>
                          <span className="uppercase tracking-wide font-medium">Placement:</span>
                          <span>{plan.placement}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-4 text-xs" style={{ color: 'hsl(35, 10%, 55%)' }}>
                          <span className="uppercase tracking-wide font-medium">Duration:</span>
                          <span>{plan.duration_days} day{plan.duration_days !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-serif text-2xl font-bold" style={{ color: BRONZE }}>
                            {formatPrice(plan.price_cents)}
                          </span>
                          <button
                            onClick={() => handleSelectPlan(plan)}
                            className="px-4 py-2 text-sm font-semibold text-white rounded transition-opacity hover:opacity-90"
                            style={{ background: BRONZE }}
                          >
                            Select
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Premium: Automatic Website Events Linker */}
        {step === 'select' && (
          <section className="mb-14">
            <h2 className="font-serif text-xl font-bold mb-2" style={{ color: 'hsl(160, 25%, 24%)' }}>
              Premium Service
            </h2>
            <p className="text-xs mb-6" style={{ color: 'hsl(35, 10%, 50%)' }}>
              Automate your event presence
            </p>
            <div
              className="rounded border-2 p-6 relative overflow-hidden"
              style={{ borderColor: BRONZE, background: 'linear-gradient(135deg, hsl(40,20%,98%), hsl(35,15%,94%))' }}
            >
              <div className="absolute top-0 right-0 px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-white" style={{ backgroundColor: BRONZE }}>
                Premium
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex-1">
                  <h3 className="font-serif text-xl font-bold mb-2" style={{ color: 'hsl(160, 25%, 24%)' }}>
                    Automatic Website Events Linker
                  </h3>
                  <p className="text-sm leading-relaxed mb-3" style={{ color: 'hsl(35, 10%, 40%)' }}>
                    Never manually post events again. We connect directly to your website, calendar feed, or event page and automatically pull your events into the community calendar.
                  </p>
                  <ul className="space-y-1.5 text-xs" style={{ color: 'hsl(35, 10%, 50%)' }}>
                    <li className="flex items-start gap-2">
                      <span style={{ color: BRONZE }}>&#10003;</span>
                      Automatic sync from your website, RSS feed, or calendar
                    </li>
                    <li className="flex items-start gap-2">
                      <span style={{ color: BRONZE }}>&#10003;</span>
                      Events appear within hours of posting on your site
                    </li>
                    <li className="flex items-start gap-2">
                      <span style={{ color: BRONZE }}>&#10003;</span>
                      90-day active connection with deduplication
                    </li>
                    <li className="flex items-start gap-2">
                      <span style={{ color: BRONZE }}>&#10003;</span>
                      Setup handled by our team — just provide your website URL
                    </li>
                  </ul>
                </div>
                <div className="text-center md:text-right flex-shrink-0">
                  <div className="font-serif text-3xl font-bold mb-1" style={{ color: BRONZE }}>$399</div>
                  <p className="text-xs mb-4" style={{ color: 'hsl(35, 10%, 55%)' }}>90-day connector</p>
                  <button
                    onClick={() => setStep('connector')}
                    className="px-6 py-3 text-sm font-semibold text-white rounded transition-opacity hover:opacity-90 cursor-pointer"
                    style={{ background: 'hsl(160, 25%, 24%)' }}
                  >
                    Get Started
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Connector Details Form */}
        {step === 'connector' && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setStep('select')}
                className="text-xs flex items-center gap-1 hover:underline"
                style={{ color: BRONZE }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            </div>

            <div
              className="rounded border p-4 mb-8 flex items-center justify-between"
              style={{ borderColor: SELECTED_BORDER, borderWidth: '2px', background: 'white' }}
            >
              <div>
                <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: 'hsl(35, 10%, 55%)' }}>Selected</p>
                <p className="font-serif font-bold" style={{ color: 'hsl(160, 25%, 24%)' }}>Automatic Website Events Linker</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(35, 10%, 55%)' }}>90-day automated event sync</p>
              </div>
              <span className="font-serif text-2xl font-bold" style={{ color: BRONZE }}>$399.00</span>
            </div>

            <h2 className="font-serif text-xl font-bold mb-6" style={{ color: 'hsl(160, 25%, 24%)' }}>
              Your Details
            </h2>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setConnectorSubmitting(true);
                try {
                  const res = await eventApi.connectorCheckout(connectorForm);
                  const checkoutUrl = (res.data as { checkout_url?: string })?.checkout_url;
                  if (checkoutUrl) window.location.href = checkoutUrl;
                } catch {
                  setConnectorSubmitting(false);
                }
              }}
              className="space-y-5 max-w-2xl"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                    Contact Name <span style={{ color: BRONZE }}>*</span>
                  </label>
                  <input type="text" required value={connectorForm.contact_name}
                    onChange={(e) => setConnectorForm(f => ({ ...f, contact_name: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                    style={{ borderColor: CARD_BORDER, background: 'white' }} placeholder="Jane Smith" />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                    Contact Email <span style={{ color: BRONZE }}>*</span>
                  </label>
                  <input type="email" required value={connectorForm.contact_email}
                    onChange={(e) => setConnectorForm(f => ({ ...f, contact_email: e.target.value }))}
                    className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                    style={{ borderColor: CARD_BORDER, background: 'white' }} placeholder="jane@example.com" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                  Business / Organization Name <span style={{ color: BRONZE }}>*</span>
                </label>
                <input type="text" required value={connectorForm.business_name}
                  onChange={(e) => setConnectorForm(f => ({ ...f, business_name: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                  style={{ borderColor: CARD_BORDER, background: 'white' }} placeholder="My Business" />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                  Website URL (where your events are posted) <span style={{ color: BRONZE }}>*</span>
                </label>
                <input type="url" required value={connectorForm.website_url}
                  onChange={(e) => setConnectorForm(f => ({ ...f, website_url: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                  style={{ borderColor: CARD_BORDER, background: 'white' }} placeholder="https://mybusiness.com/events" />
                <p className="text-xs mt-1" style={{ color: 'hsl(35, 10%, 55%)' }}>
                  Provide the URL where your events are listed. We support websites, calendar feeds (ICS), and RSS feeds.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                  Additional Notes <span className="font-normal normal-case tracking-normal" style={{ color: 'hsl(35, 10%, 55%)' }}>(optional)</span>
                </label>
                <textarea rows={3} value={connectorForm.notes}
                  onChange={(e) => setConnectorForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
                  style={{ borderColor: CARD_BORDER, background: 'white' }}
                  placeholder="Any special instructions about where events are on your site, login requirements, etc." />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={connectorSubmitting}
                  className="px-8 py-3 font-semibold text-white text-sm rounded transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
                  style={{ background: 'hsl(160, 25%, 24%)' }}
                >
                  {connectorSubmitting && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {connectorSubmitting ? 'Redirecting to Payment...' : 'Pay $399 & Activate'}
                </button>
                <p className="text-xs mt-3" style={{ color: 'hsl(35, 10%, 55%)' }}>
                  You'll be securely redirected to Stripe. After payment, our team will set up your connector within 24-48 hours.
                </p>
              </div>
            </form>
          </section>
        )}

        {/* Business Details Form */}
        {step === 'details' && selectedPlan && (
          <section>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setStep('select'); setSelectedPlan(null); }}
                className="text-xs flex items-center gap-1 hover:underline"
                style={{ color: BRONZE }}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to plans
              </button>
            </div>

            {/* Selected plan summary */}
            <div
              className="rounded border p-4 mb-8 flex items-center justify-between"
              style={{ borderColor: SELECTED_BORDER, borderWidth: '2px', background: 'white' }}
            >
              <div>
                <p className="text-xs uppercase tracking-wide font-medium mb-1" style={{ color: 'hsl(35, 10%, 55%)' }}>Selected Plan</p>
                <p className="font-serif font-bold" style={{ color: 'hsl(160, 25%, 24%)' }}>{selectedPlan.name}</p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(35, 10%, 55%)' }}>
                  {selectedPlan.placement} · {selectedPlan.duration_days} days
                </p>
              </div>
              <span className="font-serif text-2xl font-bold" style={{ color: BRONZE }}>
                {formatPrice(selectedPlan.price_cents)}
              </span>
            </div>

            <h2 className="font-serif text-xl font-bold mb-6" style={{ color: 'hsl(160, 25%, 24%)' }}>
              Your Business Details
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                    Contact Name <span style={{ color: BRONZE }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="contact_name"
                    required
                    value={formData.contact_name}
                    onChange={handleFormChange}
                    className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                    style={{ borderColor: CARD_BORDER, background: 'white' }}
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                    Contact Email <span style={{ color: BRONZE }}>*</span>
                  </label>
                  <input
                    type="email"
                    name="contact_email"
                    required
                    value={formData.contact_email}
                    onChange={handleFormChange}
                    className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                    style={{ borderColor: CARD_BORDER, background: 'white' }}
                    placeholder="jane@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                  Business Name (for the ad) <span style={{ color: BRONZE }}>*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                  style={{ borderColor: CARD_BORDER, background: 'white' }}
                  placeholder="My Business Name"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                  Description
                </label>
                <textarea
                  name="description"
                  rows={3}
                  maxLength={200}
                  value={formData.description}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
                  style={{ borderColor: CARD_BORDER, background: 'white' }}
                  placeholder="A short description of your business or promotion..."
                />
                <p className="text-xs mt-1" style={{ color: 'hsl(35, 10%, 55%)' }}>
                  Use the description to sell your services with custom text. {formData.description.length}/200 characters viewable.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                    Website URL
                  </label>
                  <input
                    type="url"
                    name="website_url"
                    value={formData.website_url}
                    onChange={handleFormChange}
                    className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                    style={{ borderColor: CARD_BORDER, background: 'white' }}
                    placeholder="https://mybusiness.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'hsl(160, 25%, 28%)' }}>
                    Image URL <span className="font-normal normal-case tracking-normal" style={{ color: 'hsl(35, 10%, 55%)' }}>(optional)</span>
                  </label>
                  <input
                    type="url"
                    name="logo_url"
                    value={formData.logo_url}
                    onChange={handleFormChange}
                    className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1"
                    style={{ borderColor: CARD_BORDER, background: 'white' }}
                    placeholder="https://mybusiness.com/logo.png"
                  />
                  <p className="text-xs mt-1" style={{ color: 'hsl(35, 10%, 55%)' }}>
                    Use this image upload feature to add custom image artwork or custom advertising images.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3 font-semibold text-white text-sm rounded transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
                  style={{ background: BRONZE }}
                >
                  {submitting && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {submitting ? 'Redirecting to Payment...' : 'Proceed to Payment'}
                </button>
                <p className="text-xs mt-3" style={{ color: 'hsl(35, 10%, 55%)' }}>
                  You'll be securely redirected to Stripe to complete your payment.
                </p>
              </div>
            </form>
          </section>
        )}
      </div>
    </PageLayout>
  );
}

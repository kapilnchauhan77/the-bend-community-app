import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AdPricing } from '@/types';
import { advertisingApi } from '@/services/advertisingApi';
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
  const [step, setStep] = useState<'select' | 'details' | 'success'>('select');
  const [statusMessage, setStatusMessage] = useState('');
  const [loadingPricing, setLoadingPricing] = useState(true);

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
            <h1 className="font-serif text-3xl font-bold text-white tracking-wide">Advertise with The Bend</h1>
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
            Thank you for supporting The Bend community. You'll receive a confirmation email once your ad goes live.
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
          <h1 className="font-serif text-3xl font-bold text-white tracking-wide">Advertise with The Bend</h1>
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
                  value={formData.description}
                  onChange={handleFormChange}
                  className="w-full border rounded px-3 py-2 text-sm outline-none focus:ring-1 resize-none"
                  style={{ borderColor: CARD_BORDER, background: 'white' }}
                  placeholder="A short description of your business or promotion..."
                />
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
                    Logo URL <span className="font-normal normal-case tracking-normal" style={{ color: 'hsl(35, 10%, 55%)' }}>(optional)</span>
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

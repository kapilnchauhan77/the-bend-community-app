import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { sponsorApi } from '@/services/sponsorApi';
import api from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, Info, CreditCard, Globe, Settings, Palette, Save, Loader2 } from 'lucide-react';

const PRIMARY = 'hsl(160, 25%, 24%)';

interface PlatformSettings {
  stripe_configured: boolean;
  stripe_publishable_key: string;
  stripe_secret_key_masked: string;
  stripe_webhook_configured: boolean;
  frontend_url: string;
  app_name: string;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
      ) : (
        <XCircle size={16} className="text-red-500 flex-shrink-0" />
      )}
      <span className={`text-sm font-medium ${ok ? 'text-green-700' : 'text-red-600'}`}>
        {label}
      </span>
      <Badge
        variant="outline"
        className={`text-xs ${
          ok
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-600 border-red-200'
        }`}
      >
        {ok ? 'Configured' : 'Not set'}
      </Badge>
    </div>
  );
}

function MaskedKeyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[hsl(35,18%,92%)] last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono text-gray-700">
        {value || <span className="italic text-gray-400">—</span>}
      </span>
    </div>
  );
}

interface TenantBranding {
  display_name: string;
  tagline: string;
  sponsor_strip_label: string;
  footer_text: string;
  primary_color: string;
}

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tenant branding form
  const [branding, setBranding] = useState<TenantBranding>({
    display_name: '',
    tagline: '',
    sponsor_strip_label: '',
    footer_text: '',
    primary_color: '',
  });
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingMsg, setBrandingMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [settingsRes, tenantRes] = await Promise.all([
          sponsorApi.getSettings(),
          api.get('/tenant/current'),
        ]);
        setSettings(settingsRes.data);
        const t = tenantRes.data;
        setBranding({
          display_name: t.display_name || '',
          tagline: t.tagline || '',
          sponsor_strip_label: t.sponsor_strip_label || '',
          footer_text: t.footer_text || '',
          primary_color: t.primary_color || '',
        });
      } catch {
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveBranding = async () => {
    setSavingBranding(true);
    setBrandingMsg(null);
    try {
      await api.put('/tenant/current', {
        display_name: branding.display_name || undefined,
        tagline: branding.tagline || null,
        sponsor_strip_label: branding.sponsor_strip_label || null,
        footer_text: branding.footer_text || null,
        primary_color: branding.primary_color || null,
      });
      setBrandingMsg({ ok: true, text: 'Branding saved. Refresh to see changes.' });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } };
      setBrandingMsg({ ok: false, text: err?.response?.data?.detail || 'Save failed.' });
    } finally {
      setSavingBranding(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'Georgia, serif', color: PRIMARY }}
          >
            Platform Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Current configuration and integration status
          </p>
        </div>

        {/* Info box */}
        <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Environment-managed settings</p>
            <p>
              Stripe keys and other sensitive values are managed through environment variables.
              To update them, edit your <code className="bg-blue-100 px-1 rounded font-mono text-xs">.env</code> file
              or update the variables in your Railway (or Render) project dashboard, then redeploy.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <Card key={i} className="border-[hsl(35,18%,87%)]">
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-40" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-600 text-sm py-8 justify-center">
            <XCircle size={16} />
            {error}
          </div>
        ) : settings ? (
          <div className="space-y-4">
            {/* Stripe card */}
            <Card className="border-[hsl(35,18%,87%)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: PRIMARY }}>
                  <CreditCard size={18} />
                  Stripe Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <StatusBadge ok={settings.stripe_configured} label="Stripe Secret Key" />
                  <StatusBadge ok={settings.stripe_webhook_configured} label="Stripe Webhook Secret" />
                  <StatusBadge
                    ok={!!settings.stripe_publishable_key}
                    label="Stripe Publishable Key"
                  />
                </div>

                {(settings.stripe_publishable_key || settings.stripe_secret_key_masked) && (
                  <div className="mt-3 rounded-md border border-[hsl(35,18%,90%)] bg-[hsl(35,15%,97%)] px-4 py-1">
                    {settings.stripe_publishable_key && (
                      <MaskedKeyRow
                        label="Publishable key"
                        value={settings.stripe_publishable_key}
                      />
                    )}
                    {settings.stripe_secret_key_masked && (
                      <MaskedKeyRow
                        label="Secret key"
                        value={settings.stripe_secret_key_masked}
                      />
                    )}
                  </div>
                )}

                {!settings.stripe_configured && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Stripe is not configured. Payments will not work until{' '}
                    <code className="font-mono text-xs">STRIPE_SECRET_KEY</code> is set.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Branding card — community admin can edit their own tenant */}
            <Card className="border-[hsl(35,18%,87%)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: PRIMARY }}>
                  <Palette size={18} />
                  Tenant Branding
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="display_name" className="text-sm">Display Name</Label>
                  <Input
                    id="display_name"
                    value={branding.display_name}
                    onChange={(e) => setBranding(b => ({ ...b, display_name: e.target.value }))}
                    placeholder="The Bend — Westmoreland"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="tagline" className="text-sm">Tagline</Label>
                  <Input
                    id="tagline"
                    value={branding.tagline}
                    onChange={(e) => setBranding(b => ({ ...b, tagline: e.target.value }))}
                    placeholder="Find opportunity within your neighborhood"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="sponsor_strip_label" className="text-sm">Sponsor Strip Label</Label>
                  <Input
                    id="sponsor_strip_label"
                    value={branding.sponsor_strip_label}
                    onChange={(e) => setBranding(b => ({ ...b, sponsor_strip_label: e.target.value }))}
                    placeholder="Proud Community Partners"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Heading shown above the sponsor logo strip on every page.
                  </p>
                </div>
                <div>
                  <Label htmlFor="footer_text" className="text-sm">Footer Tagline</Label>
                  <Textarea
                    id="footer_text"
                    value={branding.footer_text}
                    onChange={(e) => setBranding(b => ({ ...b, footer_text: e.target.value }))}
                    placeholder="Preserving community, one connection at a time"
                    rows={2}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="primary_color" className="text-sm">Primary Color (HSL)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      id="primary_color"
                      value={branding.primary_color}
                      onChange={(e) => setBranding(b => ({ ...b, primary_color: e.target.value }))}
                      placeholder="hsl(160,25%,24%)"
                    />
                    <div
                      className="w-10 h-10 rounded border border-[hsl(35,18%,87%)] flex-shrink-0"
                      style={{ backgroundColor: branding.primary_color || PRIMARY }}
                    />
                  </div>
                </div>
                {brandingMsg && (
                  <div className={`text-sm rounded px-3 py-2 ${brandingMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {brandingMsg.text}
                  </div>
                )}
                <Button
                  onClick={saveBranding}
                  disabled={savingBranding}
                  className="text-white gap-2"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {savingBranding ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {savingBranding ? 'Saving...' : 'Save Branding'}
                </Button>
              </CardContent>
            </Card>

            {/* App info card */}
            <Card className="border-[hsl(35,18%,87%)]">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base" style={{ color: PRIMARY }}>
                  <Settings size={18} />
                  Application
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-[hsl(35,18%,90%)] bg-[hsl(35,15%,97%)] px-4 py-1">
                  <MaskedKeyRow label="App name" value={settings.app_name} />
                  <div className="flex items-center justify-between py-2 border-b border-[hsl(35,18%,92%)] last:border-0">
                    <span className="text-sm text-muted-foreground">Frontend URL</span>
                    <a
                      href={settings.frontend_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-[hsl(35,45%,38%)] hover:underline"
                    >
                      <Globe size={12} />
                      {settings.frontend_url}
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}

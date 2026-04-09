import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { sponsorApi } from '@/services/sponsorApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Info, CreditCard, Globe, Settings } from 'lucide-react';

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

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await sponsorApi.getSettings();
        setSettings(res.data);
      } catch {
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

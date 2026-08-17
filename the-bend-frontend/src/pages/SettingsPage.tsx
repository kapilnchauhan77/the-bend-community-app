import { resolveAssetUrl } from '@/lib/constants';
import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User,
  Bell,
  Smartphone,
  LogOut,
  ChevronRight,
  Info,
  Save,
  Phone,
  Camera,
  HeartHandshake,
  Star,
  ChevronDown,
  Trash2,
  Plus,
  Store,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PageLayout } from '@/components/layout/PageLayout';
import { useAuthStore } from '@/stores/authStore';
import { uploadApi } from '@/services/uploadApi';
import { shopApi } from '@/services/shopApi';
import { useDarkMode } from '@/hooks/useDarkMode';
import { volunteerApi } from '@/services/volunteerApi';
import { talentApi } from '@/services/talentApi';
import { CameraCapture } from '@/components/shared/CameraCapture';
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS } from '@/lib/businessTypes';
import type { Volunteer, Talent, Shop } from '@/types/index';
import { sessionManager } from '@/auth/sessionManager';
import { notificationApi } from '@/services/notificationApi';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { usePlatformServices } from '@/platform/createPlatformServices';

const PRIMARY = 'hsl(160, 25%, 24%)';

// Lazy-load the Leaflet map editor so the heavy map bundle only loads when a
// business owner actually opens Settings.
const LocationPinEditor = lazy(() => import('@/components/shared/LocationPinEditor'));

// ─── Section wrapper ──────────────────────────────────────────────────────────
function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
      <CardHeader className="pb-3 pt-5 px-5 border-b border-gray-50">
        <CardTitle className="flex items-center gap-2.5 text-base font-bold text-gray-800">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'hsl(35, 15%, 92%)', color: PRIMARY }}
          >
            <Icon size={14} />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 py-4 space-y-4">{children}</CardContent>
    </Card>
  );
}

// ─── Row: label + switch ──────────────────────────────────────────────────────
function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <Switch disabled={disabled} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ─── App link row ─────────────────────────────────────────────────────────────
function AppLinkRow({
  icon: Icon,
  label,
  description,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className="w-full flex items-center justify-between gap-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
          <Icon size={15} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">{label}</p>
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
      </div>
      <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
    </button>
  );
}

// ─── Collapsible community profile block ─────────────────────────────────────
function CollapsibleBlock({
  title,
  icon: Icon,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[hsl(35,18%,90%)] rounded-xl overflow-hidden bg-[hsl(40,25%,98%)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[hsl(40,25%,96%)] transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'hsl(35, 15%, 90%)', color: PRIMARY }}
        >
          <Icon size={14} />
        </div>
        <span className="flex-1 text-sm font-semibold text-gray-800">{title}</span>
        {badge && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'hsl(35, 15%, 90%)', color: 'hsl(160, 25%, 22%)' }}
          >
            {badge}
          </span>
        )}
        <ChevronDown
          size={16}
          className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-[hsl(35,18%,90%)]">{children}</div>}
    </div>
  );
}

function VolunteerProfileEditor({
  profile,
  onSaved,
  onDeleted,
}: {
  profile: Volunteer;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [skills, setSkills] = useState(profile.skills);
  const [availableTime, setAvailableTime] = useState(profile.available_time);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await volunteerApi.update(profile.id, {
        name,
        phone: phone || undefined,
        email: email || undefined,
        skills,
        available_time: availableTime,
      });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
      onSaved();
    } catch (err) {
      console.error('Failed to update volunteer profile:', err);
      setError('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await volunteerApi.delete(profile.id);
      onDeleted();
    } catch (err) {
      console.error('Failed to delete volunteer profile:', err);
      setError('Could not delete. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-3 pt-3">
      {error && (
        <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">{error}</div>
      )}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Skills</Label>
        <textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Available time</Label>
        <Input value={availableTime} onChange={(e) => setAvailableTime(e.target.value)} className="h-10" required />
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          className="flex-1 font-semibold text-white"
          style={{ backgroundColor: PRIMARY }}
        >
          {saving ? 'Saving…' : savedFlag ? 'Saved!' : 'Save changes'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete volunteer profile?</AlertDialogTitle>
              <AlertDialogDescription>
                Your volunteer profile will be removed from the community board. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="rounded-xl text-white font-semibold"
                style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}

function TalentProfileEditor({
  profile,
  onSaved,
  onDeleted,
}: {
  profile: Talent;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [category, setCategory] = useState<Talent['category']>(profile.category);
  const [skills, setSkills] = useState(profile.skills);
  const [availableTime, setAvailableTime] = useState(profile.available_time);
  const [rate, setRate] = useState(String(profile.rate ?? ''));
  const [rateUnit, setRateUnit] = useState<Talent['rate_unit']>(profile.rate_unit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savedFlag, setSavedFlag] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await talentApi.update(profile.id, {
        name,
        phone: phone || undefined,
        email: email || undefined,
        category,
        skills,
        available_time: availableTime,
        rate: parseFloat(rate),
        rate_unit: rateUnit,
      });
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2000);
      onSaved();
    } catch (err) {
      console.error('Failed to update talent profile:', err);
      setError('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await talentApi.delete(profile.id);
      onDeleted();
    } catch (err) {
      console.error('Failed to delete talent profile:', err);
      setError('Could not delete. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-3 pt-3">
      {error && (
        <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">{error}</div>
      )}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Talent['category'])}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="freelancer">Freelancer</SelectItem>
              <SelectItem value="musician">Musician</SelectItem>
              <SelectItem value="artist">Artist</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Available time</Label>
          <Input value={availableTime} onChange={(e) => setAvailableTime(e.target.value)} className="h-10" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Skills</Label>
        <textarea
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Rate ($)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="h-10"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Rate unit</Label>
          <Select value={rateUnit} onValueChange={(v) => setRateUnit(v as Talent['rate_unit'])}>
            <SelectTrigger className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hr">Per hour</SelectItem>
              <SelectItem value="gig">Per gig</SelectItem>
              <SelectItem value="day">Per day</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          className="flex-1 font-semibold text-white"
          style={{ backgroundColor: PRIMARY }}
        >
          {saving ? 'Saving…' : savedFlag ? 'Saved!' : 'Save changes'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete talent profile?</AlertDialogTitle>
              <AlertDialogDescription>
                Your talent profile will be removed from the marketplace. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="rounded-xl text-white font-semibold"
                style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </form>
  );
}

// ─── Business Information editor ──────────────────────────────────────────────
// Renders inside the "Business Information" section for shop owners. Fetches the
// full shop (incl. lat/lng) on mount for prefill, lets the owner edit text fields
// and fine-tune the map pin, then saves via PUT /shops/{id}.
function BusinessInfoEditor({ shopId }: { shopId: string }) {
  const { user, shop, setAuth } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Editable text fields.
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');

  // Map pin. `pin` is the owner's chosen coordinates (manual drag/drop). When the
  // owner clicks "Reset pin to address" we flag a re-geocode instead of sending
  // coordinates. `pinDirty` tracks whether the owner touched the pin this session.
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinDirty, setPinDirty] = useState(false);
  const [resetToAddress, setResetToAddress] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Prefill from the full shop record on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const { data } = await shopApi.getShop(shopId);
        const s = data as Shop;
        if (cancelled) return;
        setName(s.name ?? '');
        setBusinessType(s.business_type ?? '');
        setAddress(s.address ?? '');
        setContactPhone(s.contact_phone ?? '');
        setWhatsapp(s.whatsapp ?? '');
        if (s.latitude != null && s.longitude != null) {
          setPin({ lat: s.latitude, lng: s.longitude });
        } else {
          setPin(null);
        }
      } catch (err) {
        console.error('Failed to load business info:', err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  // Owner moved/placed the pin: adopt the new coordinates and cancel any pending
  // "reset to address" intent.
  const handlePinChange = (lat: number, lng: number) => {
    setPin({ lat, lng });
    setPinDirty(true);
    setResetToAddress(false);
  };

  // Owner wants the pin to follow their typed address instead of a manual point.
  const handleResetPin = () => {
    setPin(null);
    setPinDirty(false);
    setResetToAddress(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        business_type: businessType,
        address,
        contact_phone: contactPhone,
        whatsapp,
      };

      // Coordinate intent — manual pin wins; otherwise an explicit reset asks the
      // backend to re-geocode the address.
      if (pinDirty && pin) {
        payload.latitude = pin.lat;
        payload.longitude = pin.lng;
      } else if (resetToAddress) {
        payload.regeocode = true;
      }

      await shopApi.updateShop(shopId, payload);

      // Re-fetch so local state (and the pin) reflect any server-side geocoding.
      const { data } = await shopApi.getShop(shopId);
      const s = data as Shop;
      setName(s.name ?? '');
      setBusinessType(s.business_type ?? '');
      setAddress(s.address ?? '');
      setContactPhone(s.contact_phone ?? '');
      setWhatsapp(s.whatsapp ?? '');
      setPin(s.latitude != null && s.longitude != null ? { lat: s.latitude, lng: s.longitude } : null);
      setPinDirty(false);
      setResetToAddress(false);

      // Mirror a changed business name into the auth store so the header/shop
      // pages refresh immediately (same setAuth pattern the avatar flow uses).
      if (shop && s.name && s.name !== shop.name) {
        const token = sessionManager.getAccessToken() || '';
        const refreshToken = '';
        setAuth(user!, { ...shop, name: s.name }, token, refreshToken);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error('Failed to update business info:', err);
      setError('Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-red-600">
        Could not load your business details. Please refresh and try again.
      </p>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {error && (
        <div className="p-2.5 rounded-lg border border-red-200 bg-red-50 text-xs text-red-700">{error}</div>
      )}

      {/* Business name */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-name" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Business Name
        </Label>
        <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      {/* Business type */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Type</Label>
        <Select value={businessType} onValueChange={setBusinessType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {BUSINESS_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Address */}
      <div className="space-y-1.5">
        <Label htmlFor="biz-address" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Address
        </Label>
        <div className="relative">
          <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            id="biz-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, Town, VA"
            className="pl-9"
          />
        </div>
        <p className="text-[11px] text-gray-400">
          Changing your address automatically updates your map pin.
        </p>
      </div>

      {/* Contact phone + WhatsApp */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="biz-phone" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Contact Phone
          </Label>
          <Input
            id="biz-phone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="biz-whatsapp" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            WhatsApp
          </Label>
          <Input
            id="biz-whatsapp"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+1 (555) 000-0000"
          />
        </div>
      </div>

      {/* Location pin */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location Pin</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetPin}
            className="h-7 text-[11px] font-semibold"
            style={{ borderColor: PRIMARY, color: PRIMARY }}
          >
            Reset pin to address
          </Button>
        </div>
        {resetToAddress && (
          <p className="text-[11px] text-[hsl(35,45%,42%)]">
            Your pin will be re-placed from your address when you save.
          </p>
        )}
        <Suspense fallback={null}>
          <LocationPinEditor
            lat={pin?.lat ?? null}
            lng={pin?.lng ?? null}
            onChange={handlePinChange}
          />
        </Suspense>
      </div>

      {/* Save */}
      <Button
        type="submit"
        disabled={saving}
        size="sm"
        className="w-full font-semibold gap-2 text-white"
        style={{ backgroundColor: PRIMARY }}
      >
        {saving ? (
          <>
            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Saving…
          </>
        ) : saved ? (
          <span className="text-white">Saved!</span>
        ) : (
          <>
            <Save size={14} />
            Save Changes
          </>
        )}
      </Button>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, shop, setAuth, logout } = useAuthStore();
  const platformServices = usePlatformServices();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isDark, toggle: toggleDark } = useDarkMode();

  // Profile state
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCameraOpen, setAvatarCameraOpen] = useState(false);

  // Pushes a freshly-uploaded avatar URL into the auth store (and the shop's
  // avatar mirror, so the header / shop pages refresh immediately). Used by
  // both the file-picker and the camera capture flows.
  const applyAvatar = (avatarUrl: string) => {
    const updatedUser = { ...user!, avatar_url: avatarUrl };
    const updatedShop = shop ? { ...shop, avatar_url: avatarUrl } : null;
    const token = sessionManager.getAccessToken() || '';
    const refreshToken = '';
    setAuth(updatedUser, updatedShop, token, refreshToken);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { data } = await uploadApi.uploadAvatar(file);
      applyAvatar(data.avatar_url);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Scroll the Business Information section into view when arriving via the
  // /settings#business deep link (e.g. "Edit Business" on the shop page).
  useEffect(() => {
    if (!shop || window.location.hash !== '#business') return;
    const el = document.getElementById('business');
    if (el) {
      // Defer to next frame so the section has rendered before we scroll.
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [shop]);

  // Notification preferences
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [gigAlerts, setGigAlerts] = useState(true);
  const [materialsAlerts, setMaterialsAlerts] = useState(true);
  const [equipmentAlerts, setEquipmentAlerts] = useState(false);
  const [urgencyThreshold, setUrgencyThreshold] = useState<string>('normal');
  const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'prompt'>('granted');

  useEffect(() => {
    let cancelled = false;
    notificationApi.getPreferences().then(({ data }) => {
      if (cancelled || !data) return;
      setPushEnabled(Boolean(data.push_enabled));
      setGigAlerts(Boolean(data.message_received));
      setMaterialsAlerts(Boolean(data.listing_interest_received));
      setEquipmentAlerts(Boolean(data.registration_decision));
      setUrgencyThreshold(data.urgent_listing_published ? 'normal' : 'urgent');
    }).catch(() => {});
    if (Capacitor.isNativePlatform()) PushNotifications.checkPermissions().then(({ receive }) => { if (!cancelled) setPushPermission(receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt') }).catch(() => {});
    return () => { cancelled = true };
  }, []);

  const updatePushPreferences = async (next: Partial<{ push_enabled: boolean; message_received: boolean; listing_interest_received: boolean; registration_decision: boolean; urgent_listing_published: boolean }>, rollback?: () => void) => {
    const current = { push_enabled: pushEnabled, message_received: gigAlerts, listing_interest_received: materialsAlerts, registration_decision: equipmentAlerts, urgent_listing_published: urgencyThreshold === 'normal', ...next };
    try { await notificationApi.updatePreferences(current) } catch { rollback?.() }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    // Simulate save — wire to userApi when available
    await new Promise((r) => setTimeout(r, 700));
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ─── My Community Profile state ─────────────────────────────────────────
  const [volunteerProfile, setVolunteerProfile] = useState<Volunteer | null>(null);
  const [talentProfile, setTalentProfile] = useState<Talent | null>(null);
  const [communityLoading, setCommunityLoading] = useState(true);

  // Refresh trigger so child editors can ask parent to re-fetch
  const [communityRefreshKey, setCommunityRefreshKey] = useState(0);
  const refreshCommunity = () => setCommunityRefreshKey((k) => k + 1);

  useEffect(() => {
    if (!user?.id) {
      setCommunityLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCommunityLoading(true);
      try {
        const [volRes, talRes] = await Promise.all([
          volunteerApi.list({ limit: '100' }),
          talentApi.list({ limit: '100' }),
        ]);
        if (cancelled) return;
        const vols: Volunteer[] = volRes.data.items ?? [];
        const tals: Talent[] = talRes.data.items ?? [];
        setVolunteerProfile(vols.find((v) => v.user_id === user.id) ?? null);
        setTalentProfile(tals.find((t) => t.user_id === user.id) ?? null);
      } catch (err) {
        console.error('Failed to load community profile:', err);
      } finally {
        if (!cancelled) setCommunityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, communityRefreshKey]);

  return (
    <PageLayout>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Page header */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
        </div>

        <div className="space-y-5">
          {/* ── Profile Section ──────────────────────────────────────────── */}
          <SettingsSection icon={User} title="Profile">
            {/* Avatar upload */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[hsl(35,18%,84%)] bg-[hsl(35,15%,90%)]">
                  {user?.avatar_url ? (
                    <img src={resolveAssetUrl(user.avatar_url)} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold font-serif text-[hsl(160,25%,24%)]">
                      {user?.name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[hsl(35,45%,42%)] flex items-center justify-center cursor-pointer shadow-md hover:bg-[hsl(35,45%,36%)] transition-colors"
                  aria-label="Change profile picture"
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <div>
                <p className="font-serif font-semibold text-[hsl(30,15%,18%)]">{user?.name}</p>
                <p className="text-xs text-[hsl(30,10%,48%)]">{user?.email}</p>
                {avatarUploading ? (
                  <p className="text-xs text-[hsl(35,45%,42%)] mt-1">Uploading...</p>
                ) : (
                  <div className="mt-1 flex items-center gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-medium cursor-pointer hover:underline"
                      style={{ color: 'hsl(35, 45%, 42%)' }}
                    >
                      Change photo
                    </button>
                    <span className="text-xs text-gray-300">·</span>
                    <button
                      onClick={() => setAvatarCameraOpen(true)}
                      className="text-xs font-medium cursor-pointer hover:underline inline-flex items-center gap-1"
                      style={{ color: 'hsl(35, 45%, 42%)' }}
                    >
                      <Camera size={11} />
                      Use camera
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Name — read-only */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Full Name
              </Label>
              <Input
                id="name"
                value={user?.name ?? ''}
                readOnly
                className="bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-gray-400">Contact your admin to update your name.</p>
            </div>

            <Separator />

            {/* Email — read-only */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                value={user?.email ?? ''}
                readOnly
                className="bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-[11px] text-gray-400">Your email address cannot be changed.</p>
            </div>

            <Separator />

            {/* Phone — editable */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Phone Number
              </Label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="pl-9"
                />
              </div>
            </div>

            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              size="sm"
              className="w-full font-semibold gap-2 text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              {savingProfile ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : profileSaved ? (
                <>
                  <span className="text-white">Saved!</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  Save Changes
                </>
              )}
            </Button>
          </SettingsSection>

          {/* ── Business Information Section ──────────────────────────────── */}
          {shop && (
            <div id="business" className="scroll-mt-20">
              <SettingsSection icon={Store} title="Business Information">
                <p className="text-xs text-gray-500 -mt-1 mb-1">
                  Update your business details and fine-tune your location on the map.
                </p>
                <BusinessInfoEditor shopId={shop.id} />
              </SettingsSection>
            </div>
          )}

          {/* ── My Community Profile Section ──────────────────────────────── */}
          <SettingsSection icon={HeartHandshake} title="My community profile">
            <p className="text-xs text-gray-500 -mt-1 mb-1">
              Manage how you appear on the Volunteer board and Talent marketplace.
            </p>

            {communityLoading ? (
              <div className="space-y-3">
                <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Volunteer block */}
                {volunteerProfile ? (
                  <CollapsibleBlock title="Volunteer profile" icon={HeartHandshake} badge="Active">
                    <VolunteerProfileEditor
                      profile={volunteerProfile}
                      onSaved={refreshCommunity}
                      onDeleted={refreshCommunity}
                    />
                  </CollapsibleBlock>
                ) : (
                  <div className="flex items-center justify-between gap-3 border border-dashed border-[hsl(35,18%,84%)] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'hsl(35, 15%, 90%)', color: PRIMARY }}
                      >
                        <HeartHandshake size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">Volunteer profile</p>
                        <p className="text-xs text-gray-500">Offer your time to help local businesses.</p>
                      </div>
                    </div>
                    <Link to="/volunteers" className="flex-shrink-0">
                      <Button size="sm" variant="outline" className="font-semibold gap-1.5" style={{ borderColor: PRIMARY, color: PRIMARY }}>
                        <Plus size={14} />
                        Create
                      </Button>
                    </Link>
                  </div>
                )}

                {/* Talent block */}
                {talentProfile ? (
                  <CollapsibleBlock title="Talent profile" icon={Star} badge="Active">
                    <TalentProfileEditor
                      profile={talentProfile}
                      onSaved={refreshCommunity}
                      onDeleted={refreshCommunity}
                    />
                  </CollapsibleBlock>
                ) : (
                  <div className="flex items-center justify-between gap-3 border border-dashed border-[hsl(35,18%,84%)] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: 'hsl(35, 15%, 90%)', color: PRIMARY }}
                      >
                        <Star size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800">Talent profile</p>
                        <p className="text-xs text-gray-500">List yourself as a freelancer, musician, or artist.</p>
                      </div>
                    </div>
                    <Link to="/talent" className="flex-shrink-0">
                      <Button size="sm" variant="outline" className="font-semibold gap-1.5" style={{ borderColor: PRIMARY, color: PRIMARY }}>
                        <Plus size={14} />
                        Create
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </SettingsSection>

          {/* ── Notifications Section ─────────────────────────────────────── */}
          <SettingsSection icon={Bell} title="Notifications">
            <SwitchRow
              label="Push Notifications"
              description="Receive alerts on this device"
              checked={pushEnabled}
              onCheckedChange={(value) => { const old = pushEnabled; setPushEnabled(value); void updatePushPreferences({ push_enabled: value }, () => setPushEnabled(old)) }}
            />
            {Capacitor.isNativePlatform() && pushPermission === 'denied' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Push is disabled in system settings. Re-enable it in App settings to receive alerts.
                <Button type="button" variant="outline" size="sm" className="mt-2 h-8" onClick={() => { window.location.href = Capacitor.getPlatform() === 'ios' ? 'app-settings:' : 'intent:#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;S.android.provider.extra.APP_PACKAGE=community.bend.westmoreland;end' }}>Open App Settings</Button>
              </div>
            )}
            {Capacitor.isNativePlatform() && pushPermission === 'prompt' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                Get timely alerts for messages, listing interest, registration decisions, and urgent listings.
                <Button type="button" size="sm" className="mt-2 h-8" onClick={() => { void platformServices.push.explainAndRequest().then(async (result) => { setPushPermission(result); if (result === 'granted') await platformServices.push.register({ user, shop, isAuthenticated: true, isLoading: false }) }) }}>Enable push notifications</Button>
              </div>
            )}
            <Separator />
            <SwitchRow
              label="Email Notifications"
              description="Receive a daily digest via email"
              checked={emailEnabled}
              onCheckedChange={setEmailEnabled}
            />

            <Separator />

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Category Alerts
              </p>
              <div className="space-y-3">
                <SwitchRow
                  label="Gig Alerts"
                  description="New gig postings and availability"
                  checked={gigAlerts}
                  onCheckedChange={(value) => { const old = gigAlerts; setGigAlerts(value); void updatePushPreferences({ message_received: value }, () => setGigAlerts(old)) }}
                  disabled={pushPermission === 'denied'}
                />
                <SwitchRow
                  label="Materials"
                  description="Flour, dairy, produce and more"
                  checked={materialsAlerts}
                  onCheckedChange={(value) => { const old = materialsAlerts; setMaterialsAlerts(value); void updatePushPreferences({ listing_interest_received: value }, () => setMaterialsAlerts(old)) }}
                  disabled={pushPermission === 'denied'}
                />
                <SwitchRow
                  label="Equipment"
                  description="Mixers, ovens, and tools"
                  checked={equipmentAlerts}
                  onCheckedChange={(value) => { const old = equipmentAlerts; setEquipmentAlerts(value); void updatePushPreferences({ registration_decision: value }, () => setEquipmentAlerts(old)) }}
                  disabled={pushPermission === 'denied'}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Urgency Threshold
              </Label>
              <p className="text-xs text-gray-400">Only notify me for listings at or above this urgency level</p>
              <Select value={urgencyThreshold} onValueChange={(value) => { const old = urgencyThreshold; setUrgencyThreshold(value); void updatePushPreferences({ urgent_listing_published: value === 'normal' }, () => setUrgencyThreshold(old)) }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">All listings (Normal+)</SelectItem>
                  <SelectItem value="urgent">Urgent only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SettingsSection>

          {/* ── App Section ───────────────────────────────────────────────── */}
          <SettingsSection icon={Smartphone} title="App">
            <SwitchRow
              label="Dark Mode"
              description="Use a darker color theme"
              checked={isDark}
              onCheckedChange={toggleDark}
            />
            <Separator />
            <AppLinkRow
              icon={Smartphone}
              label="Install App"
              description="Add app to your home screen"
              onClick={() => {
                alert('To install: tap the Share button in your browser and select "Add to Home Screen".');
              }}
            />
            <Separator />
            <AppLinkRow
              icon={Info}
              label="About"
              description="Version 1.0 · Community Edition"
              onClick={() => navigate('/about')}
            />
          </SettingsSection>

          {/* ── Logout ───────────────────────────────────────────────────── */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors">
                <LogOut size={16} />
                Log Out
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Log out?</AlertDialogTitle>
                <AlertDialogDescription>
                  You will need to sign in again to access your account and manage listings.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogout}
                  className="rounded-xl text-white font-semibold"
                  style={{ backgroundColor: 'hsl(0, 84%, 60%)' }}
                >
                  Log Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Account info footer */}
          <p className="text-center text-[11px] text-gray-400 pb-4">
            Signed in as <span className="font-medium text-gray-500">{user?.email}</span>
            {user?.role && (
              <>
                {' · '}
                <span className="capitalize">{user.role.replace(/_/g, ' ')}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <CameraCapture
        open={avatarCameraOpen}
        onClose={() => setAvatarCameraOpen(false)}
        mode="photo"
        uploadEndpoint="/upload/avatar"
        onCaptured={(result) => {
          // CameraCapture normalises /upload/avatar's `{avatar_url}` shape into
          // `result.url`, so this just mirrors the file-picker side-effect.
          applyAvatar(result.url);
        }}
      />
    </PageLayout>
  );
}

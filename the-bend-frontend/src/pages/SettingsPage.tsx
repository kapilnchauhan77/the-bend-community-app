import { resolveAssetUrl } from '@/lib/constants';
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

const PRIMARY = 'hsl(160, 25%, 24%)';

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
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, shop, setAuth, logout } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { data } = await uploadApi.uploadAvatar(file);
      const updatedUser = { ...user!, avatar_url: data.avatar_url };
      const updatedShop = shop ? { ...shop, avatar_url: data.avatar_url } : null;
      const token = sessionStorage.getItem('access_token') || '';
      const refreshToken = sessionStorage.getItem('refresh_token') || '';
      setAuth(updatedUser, updatedShop, token, refreshToken);
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setAvatarUploading(false);
    }
  };

  // Notification preferences
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [staffAlerts, setStaffAlerts] = useState(true);
  const [materialsAlerts, setMaterialsAlerts] = useState(true);
  const [equipmentAlerts, setEquipmentAlerts] = useState(false);
  const [urgencyThreshold, setUrgencyThreshold] = useState<string>('normal');

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
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-medium mt-1 cursor-pointer hover:underline"
                    style={{ color: 'hsl(35, 45%, 42%)' }}
                  >
                    Change photo
                  </button>
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

          {/* ── Notifications Section ─────────────────────────────────────── */}
          <SettingsSection icon={Bell} title="Notifications">
            <SwitchRow
              label="Push Notifications"
              description="Receive alerts on this device"
              checked={pushEnabled}
              onCheckedChange={setPushEnabled}
            />
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
                  label="Staff Sharing"
                  description="New offers and requests for staff"
                  checked={staffAlerts}
                  onCheckedChange={setStaffAlerts}
                />
                <SwitchRow
                  label="Raw Materials"
                  description="Flour, dairy, produce and more"
                  checked={materialsAlerts}
                  onCheckedChange={setMaterialsAlerts}
                />
                <SwitchRow
                  label="Equipment"
                  description="Mixers, ovens, and tools"
                  checked={equipmentAlerts}
                  onCheckedChange={setEquipmentAlerts}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Urgency Threshold
              </Label>
              <p className="text-xs text-gray-400">Only notify me for listings at or above this urgency level</p>
              <Select value={urgencyThreshold} onValueChange={setUrgencyThreshold}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">All listings (Normal+)</SelectItem>
                  <SelectItem value="urgent">Urgent and Critical only</SelectItem>
                  <SelectItem value="critical">Critical only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SettingsSection>

          {/* ── App Section ───────────────────────────────────────────────── */}
          <SettingsSection icon={Smartphone} title="App">
            <AppLinkRow
              icon={Smartphone}
              label="Install App"
              description="Add The Bend to your home screen"
              onClick={() => {
                alert('To install: tap the Share button in your browser and select "Add to Home Screen".');
              }}
            />
            <Separator />
            <AppLinkRow
              icon={Info}
              label="About The Bend"
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
                <AlertDialogTitle>Log out of The Bend?</AlertDialogTitle>
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
    </PageLayout>
  );
}

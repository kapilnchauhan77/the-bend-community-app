import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  Mail,
  Clock,
  Music,
  Palette,
  Briefcase,
  X,
  Star,
  CheckCircle,
  Sparkles,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { talentApi } from '@/services/talentApi';
import { uploadApi } from '@/services/uploadApi';
import { ShareButton } from '@/components/shared/ShareButton';
import { resolveAssetUrl } from '@/lib/constants';
import type { Talent } from '@/types/index';

const PRIMARY = 'hsl(160, 25%, 24%)';

type CategoryFilter = 'all' | 'freelancer' | 'musician' | 'artist';

const categoryMeta: Record<
  'freelancer' | 'musician' | 'artist',
  { label: string; Icon: React.ElementType; bg: string; text: string }
> = {
  freelancer: { label: 'Freelancer', Icon: Briefcase, bg: '#dbeafe', text: '#1d4ed8' },
  musician: { label: 'Musician', Icon: Music, bg: '#ede9fe', text: '#7c3aed' },
  artist: { label: 'Artist', Icon: Palette, bg: '#fce7f3', text: '#be185d' },
};

const rateUnitLabel: Record<string, string> = { hr: 'hr', gig: 'gig', day: 'day' };

interface BookingForm {
  name: string;
  message: string;
  preferred_date: string;
}

export default function TalentPage() {
  const navigate = useNavigate();

  // Registration modal
  const [showRegForm, setShowRegForm] = useState(false);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCategory, setRegCategory] = useState<'freelancer' | 'musician' | 'artist'>('freelancer');
  const [regSkills, setRegSkills] = useState('');
  const [regAvailableTime, setRegAvailableTime] = useState('');
  const [regRate, setRegRate] = useState('');
  const [regRateUnit, setRegRateUnit] = useState<'hr' | 'gig' | 'day'>('hr');
  const [regPhoto, setRegPhoto] = useState<string | null>(null);
  const [regPhotoUploading, setRegPhotoUploading] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [regError, setRegError] = useState('');

  // Talent list
  const [talents, setTalents] = useState<Talent[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');

  // Booking modal
  const [bookingTalent, setBookingTalent] = useState<Talent | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingForm>({ name: '', message: '', preferred_date: '' });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const hasModal = showRegForm || !!bookingTalent;

  // Data fetching
  const fetchTalents = async (category?: string) => {
    setListLoading(true);
    try {
      const params: Record<string, string> = {};
      if (category && category !== 'all') params.category = category;
      const res = await talentApi.list(params);
      setTalents(res.data.items ?? []);
    } catch (err) {
      console.error('Failed to load talent:', err);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchTalents(activeFilter);
  }, [activeFilter]);

  // Scroll to and highlight a card based on URL hash
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.style.boxShadow = '0 0 0 3px hsl(35, 45%, 42%)';
          setTimeout(() => { el.style.boxShadow = ''; }, 3000);
        }
      }, 500);
    }
  }, []);

  // Auto-dismiss success
  useEffect(() => {
    if (regSuccess) {
      const timer = setTimeout(() => setRegSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [regSuccess]);

  // Escape to close any modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (bookingTalent) closeBooking();
      else if (showRegForm) closeRegForm();
    }
  }, [bookingTalent, showRegForm]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when any modal open
  useEffect(() => {
    document.body.style.overflow = hasModal ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [hasModal]);

  // Registration
  const openRegForm = () => {
    setShowRegForm(true);
    setRegSuccess(false);
    setRegError('');
  };

  const closeRegForm = () => {
    setShowRegForm(false);
    setRegError('');
  };

  const handleRegSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!regPhone && !regEmail) {
      setRegError('Please provide at least an email or phone number.');
      return;
    }
    setRegSubmitting(true);
    try {
      await talentApi.register({
        name: regName, phone: regPhone || undefined, email: regEmail || undefined, category: regCategory,
        skills: regSkills, available_time: regAvailableTime,
        rate: parseFloat(regRate), rate_unit: regRateUnit,
        photo_url: regPhoto || undefined,
      });
      setRegSuccess(true);
      setRegName(''); setRegPhone(''); setRegEmail(''); setRegCategory('freelancer');
      setRegSkills(''); setRegAvailableTime(''); setRegRate(''); setRegRateUnit('hr'); setRegPhoto(null);
      setShowRegForm(false);
      await fetchTalents(activeFilter);
    } catch (err) {
      console.error('Registration failed:', err);
      setRegError('Something went wrong. Please try again.');
    } finally {
      setRegSubmitting(false);
    }
  };

  // Booking
  const openBooking = (talent: Talent) => {
    setBookingTalent(talent);
    setBookingForm({ name: '', message: '', preferred_date: '' });
    setBookingSuccess(false);
    setBookingError('');
  };

  const closeBooking = () => {
    setBookingTalent(null);
    setBookingSuccess(false);
    setBookingError('');
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingTalent) return;
    setBookingError('');
    setBookingSubmitting(true);
    try {
      await talentApi.sendInquiry(bookingTalent.id, {
        name: bookingForm.name,
        message: bookingForm.message,
        ...(bookingForm.preferred_date ? { preferred_date: bookingForm.preferred_date } : {}),
      });
      setBookingSuccess(true);
    } catch (err) {
      console.error('Inquiry failed:', err);
      setBookingError('Could not send inquiry. Please try again.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Filter tabs
  const tabs: { key: CategoryFilter; label: string; icon: React.ElementType }[] = [
    { key: 'all', label: 'All', icon: Sparkles },
    { key: 'freelancer', label: 'Freelancers', icon: Briefcase },
    { key: 'musician', label: 'Musicians', icon: Music },
    { key: 'artist', label: 'Artists', icon: Palette },
  ];

  return (
    <PageLayout>
      {/* Page Header */}
      <section className="bg-[hsl(160,25%,24%)] py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center gap-2 text-white/90 text-sm mb-1">
            <button onClick={() => navigate(-1)} className="hover:text-white transition-colors cursor-pointer" aria-label="Go back">
              <ArrowLeft size={14} />
            </button>
            <span>Home</span>
            <span>/</span>
            <span className="text-white">Talent Marketplace</span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-white">Talent Marketplace</h1>
          <p className="text-sm text-white/85 mt-1">Discover freelancers, musicians, and artists — book them for your next event or project</p>
        </div>
      </section>

      {/* Success toast */}
      {regSuccess && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-4">
          <div
            className="p-4 rounded-lg border flex items-start gap-3 text-sm font-medium"
            style={{
              backgroundColor: 'hsl(35, 15%, 92%)',
              borderColor: 'hsl(35, 25%, 70%)',
              color: 'hsl(160, 25%, 18%)',
            }}
          >
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>Your talent profile is now live! The community can discover and book you.</span>
          </div>
        </div>
      )}

      {/* Talent Directory */}
      <section className="py-8">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(35, 15%, 88%)', color: PRIMARY }}>
                <Star className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold font-serif text-gray-900">Browse Talent</h2>
                {!listLoading && (
                  <p className="text-xs text-muted-foreground">{talents.length} talent{talents.length !== 1 ? 's' : ''} available</p>
                )}
              </div>
            </div>
            <Button
              onClick={openRegForm}
              size="sm"
              className="gap-1.5 rounded-xl font-semibold text-white cursor-pointer"
              style={{ backgroundColor: PRIMARY }}
            >
              <Plus className="w-4 h-4" />
              Register
            </Button>
          </div>

          {/* Category Filter — pill style */}
          <div className="flex flex-wrap gap-2 mb-8">
            {tabs.map((tab) => {
              const isActive = activeFilter === tab.key;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'text-white shadow-md'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                  style={isActive ? { backgroundColor: PRIMARY } : undefined}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Loading */}
          {listLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3].map((n) => (
                <Card key={n} className="border-0 shadow-md rounded-2xl animate-pulse">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-gray-200 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded-lg w-2/3" />
                        <div className="h-3 bg-gray-100 rounded-lg w-1/3" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="h-6 bg-gray-100 rounded-full w-16" />
                      <div className="h-6 bg-gray-100 rounded-full w-20" />
                    </div>
                    <div className="h-4 bg-gray-100 rounded-lg w-3/4" />
                    <div className="h-10 bg-gray-200 rounded-xl w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : talents.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
              <Star className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm mb-4">
                No talent found{activeFilter !== 'all' ? ' in this category' : ''}. Be the first!
              </p>
              <Button
                onClick={openRegForm}
                size="sm"
                className="text-white cursor-pointer"
                style={{ backgroundColor: PRIMARY }}
              >
                Register Now
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {talents.map((talent) => {
                const meta = categoryMeta[talent.category];
                const CategoryIcon = meta.Icon;
                return (
                  <Card key={talent.id} id={`talent-${talent.id}`} className="border-0 shadow-md rounded-2xl hover:shadow-xl transition-all duration-200 group">
                    <CardContent className="p-6">
                      {/* Avatar + Name + Rate */}
                      <div className="flex items-center gap-3 mb-4">
                        {talent.photo_url ? (
                          <img src={resolveAssetUrl(talent.photo_url)} alt={talent.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-gray-200" />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                            style={{ backgroundColor: meta.bg, color: meta.text }}
                          >
                            {talent.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold font-serif text-gray-900 text-base leading-tight truncate">{talent.name}</h3>
                          <Badge
                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] rounded-full border-0 px-2 py-0"
                            style={{ backgroundColor: meta.bg, color: meta.text }}
                          >
                            <CategoryIcon className="w-2.5 h-2.5" />
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-extrabold text-gray-900">${talent.rate}</div>
                          <span className="text-[10px] text-muted-foreground uppercase">/{rateUnitLabel[talent.rate_unit] ?? talent.rate_unit}</span>
                        </div>
                      </div>

                      {/* Skills */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {talent.skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4).map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs rounded-full border-0"
                            style={{ backgroundColor: 'hsl(35, 15%, 88%)', color: 'hsl(160, 25%, 18%)' }}
                          >
                            {skill}
                          </Badge>
                        ))}
                      </div>

                      {/* Time + Phone */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-start gap-1.5 text-sm text-gray-500">
                          <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: PRIMARY }} />
                          <span>{talent.available_time}</span>
                        </div>
                        <a href={`tel:${talent.phone}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[hsl(160,25%,24%)] transition-colors cursor-pointer">
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: PRIMARY }} />
                          {talent.phone}
                        </a>
                        {talent.email && (
                          <a href={`mailto:${talent.email}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[hsl(35,45%,35%)] transition-colors cursor-pointer">
                            <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(35, 45%, 42%)' }} />
                            {talent.email}
                          </a>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => openBooking(talent)}
                          className="flex-1 h-10 rounded-xl font-semibold text-white text-sm shadow-sm transition-all hover:shadow-md hover:scale-[1.01] cursor-pointer"
                          style={{ backgroundColor: PRIMARY }}
                        >
                          Book {talent.name.split(' ')[0]}
                        </Button>
                        <ShareButton
                          url={`/talent#talent-${talent.id}`}
                          title={`${talent.name} - ${categoryMeta[talent.category].label} in the community`}
                          description={`${talent.name} is a ${categoryMeta[talent.category].label.toLowerCase()} available for booking: ${talent.skills}`}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Registration Modal */}
      {showRegForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeRegForm(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Register your talent"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <button
              onClick={closeRegForm}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            <div className="p-6 md:p-8">
              <h2 className="text-xl font-bold font-serif text-gray-900 mb-1">Register Your Talent</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Create your profile so the community can discover and book you.
              </p>

              {regError && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                  {regError}
                </div>
              )}

              <form onSubmit={handleRegSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="tal-name" className="block text-sm font-medium text-gray-700">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <Input id="tal-name" type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                      required placeholder="Your full name" className="rounded-xl h-11" autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tal-phone" className="block text-sm font-medium text-gray-700">
                      Phone
                    </label>
                    <Input id="tal-phone" type="tel" value={regPhone} onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="e.g., 555-123-4567" className="rounded-xl h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="tal-email" className="block text-sm font-medium text-gray-700">
                    Email
                  </label>
                  <Input
                    id="tal-email"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-xl h-11"
                  />
                  <p className="text-xs text-gray-500">Email or phone is required</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="tal-category" className="block text-sm font-medium text-gray-700">
                    Category <span className="text-red-400">*</span>
                  </label>
                  <select id="tal-category" value={regCategory}
                    onChange={(e) => setRegCategory(e.target.value as 'freelancer' | 'musician' | 'artist')}
                    required
                    className="w-full px-3 py-2.5 h-11 text-sm border border-input bg-background rounded-xl ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
                  >
                    <option value="freelancer">Freelancer</option>
                    <option value="musician">Musician</option>
                    <option value="artist">Artist</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="tal-skills" className="block text-sm font-medium text-gray-700">
                    Skills <span className="text-red-400">*</span>
                  </label>
                  <textarea id="tal-skills" value={regSkills} onChange={(e) => setRegSkills(e.target.value)}
                    required rows={3}
                    placeholder="e.g., Guitar, vocals, live performance, studio recording"
                    className="w-full px-3 py-2.5 text-sm border border-input bg-background rounded-xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="tal-time" className="block text-sm font-medium text-gray-700">
                    Available Time <span className="text-red-400">*</span>
                  </label>
                  <Input id="tal-time" type="text" value={regAvailableTime}
                    onChange={(e) => setRegAvailableTime(e.target.value)}
                    required placeholder="e.g., Weekends, Evenings after 6pm" className="rounded-xl h-11" />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Profile Photo</label>
                  <div className="flex items-center gap-4">
                    {regPhoto ? (
                      <img src={resolveAssetUrl(regPhoto)} alt="Preview" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No photo</div>
                    )}
                    <label className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                      {regPhotoUploading ? 'Uploading...' : 'Choose Photo'}
                      <input type="file" accept="image/*" className="hidden" disabled={regPhotoUploading} onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setRegPhotoUploading(true);
                        try {
                          const { data } = await uploadApi.uploadPhoto(file);
                          setRegPhoto(data.photo_url);
                        } catch { /* silent */ }
                        setRegPhotoUploading(false);
                        e.target.value = '';
                      }} />
                    </label>
                    {regPhoto && (
                      <button type="button" onClick={() => setRegPhoto(null)} className="text-xs text-red-500 hover:underline cursor-pointer">Remove</button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="tal-rate" className="block text-sm font-medium text-gray-700">
                      Rate ($) <span className="text-red-400">*</span>
                    </label>
                    <Input id="tal-rate" type="number" value={regRate}
                      onChange={(e) => setRegRate(e.target.value)}
                      required min={0} step="0.01" placeholder="50" className="rounded-xl h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="tal-rate-unit" className="block text-sm font-medium text-gray-700">
                      Rate Unit <span className="text-red-400">*</span>
                    </label>
                    <select id="tal-rate-unit" value={regRateUnit}
                      onChange={(e) => setRegRateUnit(e.target.value as 'hr' | 'gig' | 'day')}
                      className="w-full px-3 py-2.5 h-11 text-sm border border-input bg-background rounded-xl ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
                    >
                      <option value="hr">Per Hour</option>
                      <option value="gig">Per Gig</option>
                      <option value="day">Per Day</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" onClick={closeRegForm} className="flex-1 h-11 rounded-xl cursor-pointer">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={regSubmitting}
                    className="flex-1 h-11 rounded-xl font-semibold text-white cursor-pointer"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {regSubmitting ? 'Registering...' : 'Register'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
      {bookingTalent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBooking(); }}
          role="dialog"
          aria-modal="true"
          aria-label={`Book ${bookingTalent.name}`}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={closeBooking}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            <div className="p-6 md:p-8">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ backgroundColor: categoryMeta[bookingTalent.category].bg, color: categoryMeta[bookingTalent.category].text }}
                >
                  {bookingTalent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold font-serif text-gray-900">Book {bookingTalent.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    ${bookingTalent.rate}/{rateUnitLabel[bookingTalent.rate_unit]} · {categoryMeta[bookingTalent.category].label}
                  </p>
                </div>
              </div>

              {bookingSuccess ? (
                <div
                  className="p-4 rounded-xl border text-sm font-medium flex items-start gap-3"
                  style={{
                    backgroundColor: 'hsl(35, 15%, 92%)',
                    borderColor: 'hsl(35, 25%, 70%)',
                    color: 'hsl(160, 25%, 18%)',
                  }}
                >
                  <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">Inquiry sent!</p>
                    <p>
                      Contact {bookingTalent.name} directly at{' '}
                      <a href={`tel:${bookingTalent.phone}`} className="underline font-semibold cursor-pointer">
                        {bookingTalent.phone}
                      </a>{' '}
                      to coordinate details.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {bookingError && (
                    <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                      {bookingError}
                    </div>
                  )}
                  <form onSubmit={handleBookingSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="book-name" className="block text-sm font-medium text-gray-700">
                        Your Name <span className="text-red-400">*</span>
                      </label>
                      <Input id="book-name" type="text" value={bookingForm.name}
                        onChange={(e) => setBookingForm((f) => ({ ...f, name: e.target.value }))}
                        required placeholder="Your full name" className="rounded-xl h-11" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="book-message" className="block text-sm font-medium text-gray-700">
                        Message <span className="text-red-400">*</span>
                      </label>
                      <textarea id="book-message" value={bookingForm.message}
                        onChange={(e) => setBookingForm((f) => ({ ...f, message: e.target.value }))}
                        required rows={4} placeholder="Describe your event or project..."
                        className="w-full px-3 py-2.5 text-sm border border-input bg-background rounded-xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="book-date" className="block text-sm font-medium text-gray-700">
                        Preferred Date <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <Input id="book-date" type="date" value={bookingForm.preferred_date}
                        onChange={(e) => setBookingForm((f) => ({ ...f, preferred_date: e.target.value }))}
                        className="rounded-xl h-11" />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button type="button" variant="outline" onClick={closeBooking} className="flex-1 h-11 rounded-xl cursor-pointer">
                        Cancel
                      </Button>
                      <Button type="submit" disabled={bookingSubmitting}
                        className="flex-1 h-11 rounded-xl font-semibold text-white cursor-pointer"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {bookingSubmitting ? 'Sending...' : 'Send Inquiry'}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, Clock, Heart, Users, CheckCircle, X, Plus, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { volunteerApi } from '@/services/volunteerApi';
import { uploadApi } from '@/services/uploadApi';
import { messageApi } from '@/services/messageApi';
import { useAuthStore } from '@/stores/authStore';
import { ShareButton } from '@/components/shared/ShareButton';
import { resolveAssetUrl } from '@/lib/constants';
import type { Volunteer } from '@/types/index';

const PRIMARY = 'hsl(160, 25%, 24%)';

export default function VolunteerPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [skills, setSkills] = useState('');
  const [availableTime, setAvailableTime] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  // Per-card action state
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Volunteer list state
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVolunteers = async () => {
    try {
      const res = await volunteerApi.list();
      setVolunteers(res.data.items ?? []);
    } catch (err) {
      console.error('Failed to load volunteers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVolunteers();
  }, []);

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

  // Auto-dismiss success message
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Escape to close modal
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && showForm) closeForm();
  }, [showForm]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when modal open
  useEffect(() => {
    document.body.style.overflow = showForm ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showForm]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setSkills('');
    setAvailableTime('');
    setPhoto(null);
    setEditingId(null);
  };

  const openForm = () => {
    resetForm();
    setShowForm(true);
    setSuccess(false);
    setFormError('');
  };

  const openEditForm = (v: Volunteer) => {
    setEditingId(v.id);
    setName(v.name);
    setPhone(v.phone ?? '');
    setEmail(v.email ?? '');
    setSkills(v.skills);
    setAvailableTime(v.available_time);
    setPhoto(v.photo_url ?? null);
    setShowForm(true);
    setSuccess(false);
    setFormError('');
  };

  const closeForm = () => {
    setShowForm(false);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!isAuthenticated && !phone && !email) {
      setFormError('Please provide at least an email or phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name,
        phone: phone || undefined,
        email: email || undefined,
        skills,
        available_time: availableTime,
        photo_url: photo || undefined,
      };
      if (editingId) {
        await volunteerApi.update(editingId, payload);
      } else {
        await volunteerApi.enroll(payload);
      }
      setSuccess(true);
      resetForm();
      setShowForm(false);
      await fetchVolunteers();
    } catch (err) {
      console.error('Enrollment failed:', err);
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMessage = async (recipientUserId: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setMessagingId(recipientUserId);
    try {
      const { data } = await messageApi.createDirectThread(recipientUserId);
      navigate(`/messages/${data.id}`);
    } catch (err) {
      console.error('Failed to start thread:', err);
    } finally {
      setMessagingId(null);
    }
  };

  const handleDelete = async (v: Volunteer) => {
    const confirmMsg = v.user_id === user?.id
      ? `Delete your volunteer profile? This cannot be undone.`
      : `Delete ${v.name}'s volunteer profile? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;
    setDeletingId(v.id);
    try {
      await volunteerApi.delete(v.id);
      await fetchVolunteers();
    } catch (err) {
      console.error('Failed to delete volunteer:', err);
    } finally {
      setDeletingId(null);
    }
  };

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
            <span className="text-white">Volunteer Board</span>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-white">Volunteer Board</h1>
          <p className="text-sm text-white/85 mt-1">Give your time and skills to help local shops in the community</p>
        </div>
      </section>

      {/* Success toast */}
      {success && (
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
            <span>You're signed up! Your volunteer profile is now visible to the community.</span>
          </div>
        </div>
      )}

      {/* Volunteer Listing */}
      <section className="py-8">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'hsl(35, 15%, 88%)', color: PRIMARY }}>
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-serif text-xl font-bold text-gray-900">Our Volunteers</h2>
                {!loading && (
                  <p className="text-xs text-muted-foreground">{volunteers.length} volunteer{volunteers.length !== 1 ? 's' : ''} ready to help</p>
                )}
              </div>
            </div>
            <Button
              onClick={openForm}
              size="sm"
              className="gap-1.5 rounded-xl font-semibold text-white cursor-pointer"
              style={{ backgroundColor: PRIMARY }}
            >
              <Plus className="w-4 h-4" />
              Sign Up
            </Button>
          </div>

          {loading ? (
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
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : volunteers.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
              <Heart className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 text-sm mb-4">No volunteers yet. Be the first to sign up!</p>
              <Button
                onClick={openForm}
                size="sm"
                className="text-white cursor-pointer"
                style={{ backgroundColor: PRIMARY }}
              >
                Volunteer Now
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {volunteers.map((v) => (
                <Card
                  key={v.id}
                  id={`vol-${v.id}`}
                  className="border-0 shadow-md rounded-2xl hover:shadow-xl transition-all duration-200 group"
                >
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      {v.photo_url ? (
                        <img src={resolveAssetUrl(v.photo_url)} alt={v.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0 border border-gray-200" />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
                          style={{ backgroundColor: 'hsl(35, 15%, 88%)', color: PRIMARY }}
                        >
                          {v.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-serif font-bold text-gray-900 text-base leading-tight truncate">{v.name}</h3>
                        <span className="text-xs text-muted-foreground">Volunteer</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {v.skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs rounded-full border-0"
                          style={{ backgroundColor: 'hsl(35, 15%, 88%)', color: 'hsl(160, 25%, 18%)' }}
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-start gap-1.5 text-sm text-gray-500 mb-4">
                      <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: PRIMARY }} />
                      <span>{v.available_time}</span>
                    </div>

                    {(() => {
                      const isOwner = isAuthenticated && user?.id && v.user_id === user.id;
                      const canMessage = isAuthenticated && !!v.user_id && !isOwner;
                      const isAdmin = user?.role === 'community_admin';
                      if (isOwner) {
                        return (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => openEditForm(v)}
                              variant="outline"
                              className="flex-1 h-10 rounded-xl text-sm font-semibold cursor-pointer"
                              style={{ borderColor: PRIMARY, color: PRIMARY }}
                            >
                              <Pencil className="w-4 h-4 mr-1.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              onClick={() => handleDelete(v)}
                              variant="outline"
                              disabled={deletingId === v.id}
                              className="h-10 rounded-xl text-sm font-semibold cursor-pointer border-red-200 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <ShareButton
                              url={`/volunteers#vol-${v.id}`}
                              title={`${v.name} - Community Volunteer`}
                              description={`${v.name} is volunteering: ${v.skills}`}
                            />
                          </div>
                        );
                      }
                      if (canMessage) {
                        return (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              onClick={() => handleMessage(v.user_id!)}
                              disabled={messagingId === v.user_id}
                              className="flex-1 h-10 rounded-xl text-sm font-semibold text-white cursor-pointer"
                              style={{ backgroundColor: PRIMARY }}
                            >
                              <MessageSquare className="w-4 h-4 mr-1.5" />
                              {messagingId === v.user_id ? 'Starting...' : 'Message'}
                            </Button>
                            {isAdmin && (
                              <Button
                                type="button"
                                onClick={() => handleDelete(v)}
                                variant="outline"
                                disabled={deletingId === v.id}
                                className="h-10 rounded-xl text-sm font-semibold cursor-pointer border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            <ShareButton
                              url={`/volunteers#vol-${v.id}`}
                              title={`${v.name} - Community Volunteer`}
                              description={`${v.name} is volunteering: ${v.skills}`}
                            />
                          </div>
                        );
                      }
                      // Anonymous viewer OR row without user_id — show masked phone/email as today
                      return (
                        <>
                          <div className="flex gap-2">
                            {v.phone ? (
                              <a
                                href={`tel:${v.phone}`}
                                className="flex items-center justify-center gap-2 flex-1 h-10 rounded-xl border-2 text-sm font-semibold transition-all duration-200 cursor-pointer hover:shadow-md"
                                style={{ borderColor: PRIMARY, color: PRIMARY }}
                              >
                                <Phone className="w-4 h-4" />
                                {v.phone}
                              </a>
                            ) : v.email ? (
                              <a
                                href={`mailto:${v.email}`}
                                className="flex items-center justify-center gap-2 flex-1 h-10 rounded-xl border-2 text-sm font-semibold transition-all duration-200 cursor-pointer hover:shadow-md"
                                style={{ borderColor: 'hsl(35, 45%, 42%)', color: 'hsl(35, 45%, 42%)' }}
                              >
                                <Mail className="w-4 h-4" />
                                {v.email}
                              </a>
                            ) : (
                              <div
                                className="flex-1 h-10 rounded-xl border-2 text-sm flex items-center justify-center"
                                style={{ borderColor: 'hsl(35,18%,84%)', color: 'hsl(30,10%,55%)' }}
                              >
                                Contact via in-app messages
                              </div>
                            )}
                            {isAdmin && (
                              <Button
                                type="button"
                                onClick={() => handleDelete(v)}
                                variant="outline"
                                disabled={deletingId === v.id}
                                className="h-10 rounded-xl text-sm font-semibold cursor-pointer border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            <ShareButton
                              url={`/volunteers#vol-${v.id}`}
                              title={`${v.name} - Community Volunteer`}
                              description={`${v.name} is volunteering: ${v.skills}`}
                            />
                          </div>
                          {v.phone && v.email && (
                            <a
                              href={`mailto:${v.email}`}
                              className="flex items-center justify-center gap-2 w-full h-10 rounded-xl border-2 text-sm font-semibold transition-all duration-200 cursor-pointer hover:shadow-md mt-2"
                              style={{ borderColor: 'hsl(35, 45%, 42%)', color: 'hsl(35, 45%, 42%)' }}
                            >
                              <Mail className="w-4 h-4" />
                              {v.email}
                            </a>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Sign Up Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeForm(); }}
          role="dialog"
          aria-modal="true"
          aria-label="Sign up to volunteer"
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={closeForm}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>

            <div className="p-6 md:p-8">
              <h2 className="font-serif text-xl font-bold text-gray-900 mb-1">
                {editingId ? 'Edit Your Volunteer Profile' : 'Sign Up to Volunteer'}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {editingId
                  ? 'Update your details below. Changes go live immediately.'
                  : "Fill in your details and you'll appear on the board for businesses to find you."}
              </p>

              {isAuthenticated && (
                <div
                  className="mb-5 p-3.5 rounded-xl text-xs leading-relaxed"
                  style={{
                    backgroundColor: 'hsl(35, 15%, 93%)',
                    border: '1px solid hsl(35, 18%, 84%)',
                    color: 'hsl(160, 25%, 22%)',
                  }}
                >
                  Other members will reach you via in-app messages — phone and email are optional.
                </div>
              )}

              {formError && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="vol-name" className="block text-sm font-medium text-gray-700">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <Input
                      id="vol-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Your full name"
                      className="rounded-xl h-11"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="vol-phone" className="block text-sm font-medium text-gray-700">
                      Phone {isAuthenticated && <span className="text-gray-400 font-normal">(optional)</span>}
                    </label>
                    <Input
                      id="vol-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g., 555-123-4567"
                      className="rounded-xl h-11"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vol-email" className="block text-sm font-medium text-gray-700">
                    Email {isAuthenticated && <span className="text-gray-400 font-normal">(optional)</span>}
                  </label>
                  <Input
                    id="vol-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="rounded-xl h-11"
                  />
                  {!isAuthenticated && (
                    <p className="text-xs text-gray-500">Email or phone is required</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vol-skills" className="block text-sm font-medium text-gray-700">
                    Skills <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    id="vol-skills"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    required
                    rows={3}
                    placeholder="e.g., Cooking, cleaning, customer service, inventory management"
                    className="w-full px-3 py-2.5 text-sm border border-input bg-background rounded-xl ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-gray-700">Profile Photo</label>
                  <div className="flex items-center gap-4">
                    {photo ? (
                      <img src={resolveAssetUrl(photo)} alt="Preview" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No photo</div>
                    )}
                    <label className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                      {photoUploading ? 'Uploading...' : 'Choose Photo'}
                      <input type="file" accept="image/*" className="hidden" disabled={photoUploading} onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPhotoUploading(true);
                        try {
                          const { data } = await uploadApi.uploadPhoto(file);
                          setPhoto(data.photo_url);
                        } catch { /* silent */ }
                        setPhotoUploading(false);
                        e.target.value = '';
                      }} />
                    </label>
                    {photo && (
                      <button type="button" onClick={() => setPhoto(null)} className="text-xs text-red-500 hover:underline cursor-pointer">Remove</button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="vol-time" className="block text-sm font-medium text-gray-700">
                    Available Time <span className="text-red-400">*</span>
                  </label>
                  <Input
                    id="vol-time"
                    type="text"
                    value={availableTime}
                    onChange={(e) => setAvailableTime(e.target.value)}
                    required
                    placeholder="e.g., Weekends 9am-5pm, Weekday evenings"
                    className="rounded-xl h-11"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeForm}
                    className="flex-1 h-11 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 h-11 rounded-xl font-semibold text-white cursor-pointer"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    {submitting
                      ? editingId ? 'Saving...' : 'Signing up...'
                      : editingId ? 'Save changes' : 'Sign Up'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

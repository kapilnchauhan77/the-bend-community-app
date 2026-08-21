import { useState, useEffect, useCallback } from 'react';
import { resolveAssetUrl } from '@/lib/constants';
import { timeAgo, parseServerDate, formatPrice, isVideoUrl } from '@/lib/utils';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Phone,
  MessageCircle,
  Clock,
  Package,
  Briefcase,
  Users,
  Wrench,
  Star,
  ChevronLeft,
  ChevronRight,
  Edit,
  CheckCircle,
  Trash2,
  ImageOff,
  Bookmark,
  Flag,
  Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { ShareButton } from '@/components/shared/ShareButton';
import { ShareToMessageButton } from '@/components/features/messages/ShareToMessageButton';
import { listingApi } from '@/services/listingApi';
import { messageApi } from '@/services/messageApi';
import { discountCodeApi } from '@/services/discountCodeApi';
import { DiscountCodesList } from '@/components/shared/DiscountCodesList';
import { useAuthStore } from '@/stores/authStore';
import type { ListingDetail, DiscountCode } from '@/types';
import { useOnlineMutation } from '@/hooks/useOnlineMutation';
import { OfflineBanner } from '@/components/native/OfflineBanner';
import { useCachedPublicContent } from '@/hooks/useCachedPublicContent';
import { CachedContentNotice } from '@/components/native/CachedContentNotice';
import { useNativePresentation } from '@/components/layout/NativePresentationContext';

const urgencyStyles = {
  normal: { badge: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400', label: 'Normal' },
  urgent: { badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Urgent' },
};

const categoryIcons = {
  staff: Briefcase,
  materials: Package,
  equipment: Wrench,
  volunteer: Heart,
};

const categoryLabels = {
  staff: 'Gigs',
  materials: 'Materials',
  equipment: 'Equipment',
  volunteer: 'Volunteer',
};

function formatDate(dateStr: string): string {
  return parseServerDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, shop, user } = useAuthStore();
  const native = useNativePresentation();
  const { online, run: runOnline } = useOnlineMutation();
  const cached = useCachedPublicContent<ListingDetail>(`listing:${id ?? ''}`, useCallback(async () => (await listingApi.getDetail(id!)).data, [id]));

  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [interestLoading, setInterestLoading] = useState(false);
  const [hasInterest, setHasInterest] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [interestSuccess, setInterestSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('inappropriate');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reported, setReported] = useState(false);
  const [posterDiscountCodes, setPosterDiscountCodes] = useState<DiscountCode[]>([]);
  const activeListing = listing?.id === id ? listing : null;

  const isOwner = !!(activeListing && shop && activeListing.shop && activeListing.shop.id === shop.id);
  const isVolunteer = activeListing?.category === 'volunteer';

  useEffect(() => {
    setListing(null);
    setImageIndex(0);
    setPosterDiscountCodes([]);
    setHasInterest(false);
    setHasSaved(false);
  }, [id]);

  // Fetch discount codes for community-member-posted listings only.
  // Shop-owned listings surface codes on the business profile page instead.
  useEffect(() => {
    if (!cached.data || cached.data.id !== id) return;
    setListing(cached.data); setHasInterest(cached.data.viewer_has_interest); setHasSaved(cached.data.viewer_has_saved);
  }, [cached.data, id]);

  useEffect(() => {
    if (!activeListing) return;
    let current = true;
    if (activeListing.shop) {
      setPosterDiscountCodes([]);
      return () => { current = false; };
    }
    if (!activeListing.posted_by) return () => { current = false; };
    discountCodeApi
      .listForUser(activeListing.posted_by.id)
      .then((res) => { if (current) setPosterDiscountCodes(Array.isArray(res.data) ? res.data : []); })
      .catch(() => { if (current) setPosterDiscountCodes([]); });
    return () => { current = false; };
  }, [activeListing]);

  async function handleInterest() {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    setInterestLoading(true);
    try {
      if (hasInterest) {
        await runOnline(() => listingApi.withdrawInterest(id!));
        setHasInterest(false);
      } else {
        await runOnline(() => listingApi.expressInterest(id!));
        setHasInterest(true);
        setInterestSuccess(true);
        setTimeout(() => setInterestSuccess(false), 3000);
      }
    } catch (error) {
      setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not update your interest. Please try again.');
    } finally {
      setInterestLoading(false);
    }
  }

  async function handleSave() {
    if (!isAuthenticated) { navigate('/login'); return; }
    try {
      if (hasSaved) {
        await runOnline(() => listingApi.unsaveListing(id!));
        setHasSaved(false);
      } else {
        await runOnline(() => listingApi.saveListing(id!));
        setHasSaved(true);
      }
    } catch (error) {
      setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not update this saved listing. Please try again.');
    }
  }

  async function handleFulfill() {
    setActionLoading(true);
    try {
      await runOnline(() => listingApi.fulfill(id!));
      navigate('/my-shop');
    } catch (error) {
      setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not mark this listing fulfilled. Please try again.');
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    setActionLoading(true);
    try {
      await runOnline(() => listingApi.delete(id!));
      navigate('/my-shop');
    } catch (error) {
      setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not delete this listing. Please try again.');
      setActionLoading(false);
    }
  }

  if (!activeListing && cached.status === 'loading') {
    return (
      <PageLayout embeddedClassName="native-themed-page native-listing-detail-page">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-32 bg-gray-200 rounded" />
            <div className="h-72 bg-gray-200 rounded-xl" />
            <div className="h-6 w-2/3 bg-gray-200 rounded" />
            <div className="h-4 w-full bg-gray-200 rounded" />
            <div className="h-4 w-4/5 bg-gray-200 rounded" />
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!activeListing && cached.status === 'error') {
    return (
      <PageLayout embeddedClassName="native-themed-page native-listing-detail-page">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Unable to load listing</h2>
          <p className="text-muted-foreground mb-6">We couldn't load this listing right now.</p>
          <Button onClick={() => void cached.refresh()} style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}>
            Retry listing
          </Button>
        </div>
      </PageLayout>
    );
  }

  if (!activeListing) {
    return (
      <PageLayout embeddedClassName="native-themed-page native-listing-detail-page">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Listing not found</h2>
          <p className="text-muted-foreground mb-6">This listing does not exist.</p>
          <Button onClick={() => navigate('/browse')} style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}>
            Back to Browse
          </Button>
        </div>
      </PageLayout>
    );
  }

  const urgency = urgencyStyles[activeListing.urgency];
  const CategoryIcon = categoryIcons[activeListing.category] || Package;
  const images = activeListing.images || [];
  const safeImageIndex = Math.min(imageIndex, Math.max(images.length - 1, 0));

  return (
    <PageLayout embeddedClassName="native-themed-page native-listing-detail-page">
      {!online && <OfflineBanner />}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
        <CachedContentNotice cachedAt={cached.cachedAt} />
        {actionError && <p role="alert" className="mb-4 text-sm text-red-700">{actionError}</p>}
        {/* Back button */}
        {!native && <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 mb-5 transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>}

        {/* Photo / video carousel — mixed media, single nav model */}
        <div className="relative mb-6 rounded-xl overflow-hidden bg-gray-100 aspect-[16/9]">
          {images.length > 0 ? (
            <>
              {(() => {
                const current = images[safeImageIndex];
                if (isVideoUrl(current.url)) {
                  return (
                    <video
                      // `key` forces a fresh element when navigating between
                      // clips so the previous one stops playing.
                      key={current.url}
                      src={resolveAssetUrl(current.url)}
                      poster={current.thumbnail_url ? resolveAssetUrl(current.thumbnail_url) : undefined}
                      controls
                      preload="metadata"
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  );
                }
                return (
                  <img
                    src={resolveAssetUrl(current.url)}
                    alt={activeListing.title}
                    className="w-full h-full object-cover"
                  />
                );
              })()}
              {images.length > 1 && (
                <>
                  <button
                    aria-label="Previous image"
                    onClick={() => setImageIndex((i) => (i - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow hover:bg-white transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label="Next image"
                    onClick={() => setImageIndex((i) => (i + 1) % images.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow hover:bg-white transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImageIndex(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          i === safeImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-3">
              <ImageOff size={48} />
              <span className="text-sm text-gray-400">No photos available</span>
            </div>
          )}
        </div>

        {/* Header section */}
        <div className="mb-5">
          {/* Urgency badge - prominent */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${urgency.badge}`}
            >
              <span className={`w-2 h-2 rounded-full ${urgency.dot}`} />
              {urgency.label} Priority
            </span>
            <Badge
              variant="secondary"
              className={
                listing.type === 'offer'
                  ? 'bg-[hsl(35,15%,90%)] text-[hsl(160,25%,24%)]'
                  : 'bg-blue-100 text-blue-700'
              }
            >
              {listing.category === 'volunteer'
                ? 'Seeking Volunteers'
                : listing.category === 'staff'
                  ? (listing.type === 'offer' ? 'Hiring' : 'Available')
                  : (listing.type === 'offer' ? 'Offering' : 'Requesting')}
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1">
              <CategoryIcon size={12} />
              {categoryLabels[listing.category]}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-2 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ShareButton
                url={`/listing/${id}`}
                title={listing.title}
                description={`${
                  listing.category === 'volunteer'
                    ? 'Volunteer Opportunity'
                    : listing.category === 'staff'
                      ? (listing.type === 'offer' ? 'Hiring' : 'Available')
                      : (listing.type === 'offer' ? 'Offering' : 'Requesting')
                }: ${listing.title} - Community Marketplace`}
              />
              {isAuthenticated && (
                <ShareToMessageButton
                  refType="listing"
                  refId={listing.id}
                  size="sm"
                  label="Send in a message"
                  className="text-xs text-[hsl(30,10%,45%)] hover:text-[hsl(35,45%,42%)] border-[hsl(35,18%,84%)] hover:border-[hsl(35,45%,42%)]"
                />
              )}
            </div>
          </div>

          {/* Price (or volunteer pill) */}
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            {isVolunteer ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-[hsl(35,15%,94%)] border border-[hsl(35,18%,84%)] text-[hsl(160,25%,24%)]">
                <Heart className="w-3.5 h-3.5" />
                Volunteer Opportunity · Free
              </span>
            ) : (
              <span
                className={`text-xl font-bold ${
                  (listing.pricing_type === 'free' || (!listing.pricing_type && listing.is_free))
                    ? 'text-[hsl(160,25%,28%)]'
                    : 'text-gray-900'
                }`}
              >
                {formatPrice(listing) || '—'}
              </span>
            )}
            {listing.quantity && (
              <span className="text-sm text-muted-foreground">
                {listing.quantity} {listing.unit || 'units'}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              Posted {timeAgo(listing.created_at)}
            </span>
            {listing.expiry_date && (
              <span className="flex items-center gap-1">
                <Star size={14} />
                Expires {formatDate(listing.expiry_date)}
                {(() => {
                  const expiry = new Date(listing.expiry_date.replace(' ', 'T'));
                  const diff = expiry.getTime() - Date.now();
                  if (diff <= 0) return <span className="font-semibold text-red-500">(Expired)</span>;
                  const days = Math.floor(diff / 86400000);
                  if (days > 7) return null;
                  const hours = Math.floor(diff / 3600000);
                  const label = days > 0 ? `${days}d left` : hours > 0 ? `${hours}h left` : 'Expiring soon';
                  return <span className="font-semibold text-amber-600">({label})</span>;
                })()}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users size={14} />
              {listing.interest_count} interested
            </span>
          </div>
        </div>

        <Separator className="mb-5" />

        {/* Description */}
        <div className="mb-6">
          <h2 className="font-semibold text-gray-900 mb-2">Description</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
        </div>

        <Separator className="mb-5" />

        {/* Posted-by card — business shop OR community member fallback */}
        <Card className="mb-6 border-gray-200">
          <CardContent className="p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Posted by</h2>
            {listing.shop ? (
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <Link to={`/business/${listing.shop.id}`} className="flex-shrink-0">
                  {listing.shop.avatar_url ? (
                    <img
                      src={resolveAssetUrl(listing.shop.avatar_url)}
                      alt={listing.shop.name}
                      className="w-12 h-12 rounded-full object-cover bg-[hsl(35,15%,90%)] hover:opacity-80 transition-opacity"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center text-lg font-bold text-[hsl(160,25%,24%)] hover:opacity-80 transition-opacity">
                      {listing.shop.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/business/${listing.shop.id}`}
                    className="font-semibold text-gray-900 hover:text-[hsl(35,45%,35%)] hover:underline transition-colors"
                  >
                    {listing.shop.name}
                  </Link>
                  <p className="text-sm text-muted-foreground capitalize mb-2">
                    {listing.shop.business_type}
                  </p>
                  {listing.shop.address && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-1">
                      <MapPin size={13} />
                      {listing.shop.address}
                    </p>
                  )}
                  <div className="flex gap-3 mt-2 flex-wrap">
                    {listing.shop.contact_phone && (
                      <a
                        href={`tel:${listing.shop.contact_phone}`}
                        className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-[hsl(160,25%,24%)] transition-colors"
                      >
                        <Phone size={14} />
                        {listing.shop.contact_phone}
                      </a>
                    )}
                    {listing.shop.whatsapp && (
                      <a
                        href={`https://wa.me/${listing.shop.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm font-medium text-[hsl(160,25%,24%)] hover:text-[hsl(160,25%,20%)] transition-colors"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : listing.posted_by ? (
              <div className="flex items-start gap-3">
                {listing.posted_by.avatar_url ? (
                  <img
                    src={resolveAssetUrl(listing.posted_by.avatar_url)}
                    alt={listing.posted_by.name}
                    className="w-12 h-12 rounded-full object-cover bg-[hsl(35,15%,90%)] flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center text-lg font-bold text-[hsl(160,25%,24%)] flex-shrink-0">
                    {listing.posted_by.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{listing.posted_by.name}</p>
                  <p className="text-xs font-medium uppercase tracking-wider text-[hsl(35,45%,42%)] mt-0.5">
                    Community member
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Unknown</p>
            )}
          </CardContent>
        </Card>

        {/* Discount codes from the community member who posted (no shop) */}
        {!listing.shop && listing.posted_by && posterDiscountCodes.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-[2px]" style={{ backgroundColor: 'hsl(35, 45%, 42%)' }} />
              <h2 className="text-lg font-bold font-serif text-[hsl(30,15%,18%)] tracking-wide">
                Discount Codes from {listing.posted_by.name.split(' ')[0]}
              </h2>
            </div>
            <DiscountCodesList codes={posterDiscountCodes} />
          </div>
        )}

        {/* Success alert */}
        {interestSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-[hsl(35,15%,94%)] border border-[hsl(35,18%,84%)] text-[hsl(160,25%,24%)] text-sm flex items-center gap-2">
            <CheckCircle size={16} />
            Interest expressed! The business will be notified.
          </div>
        )}

        {/* Action buttons */}
        {isOwner ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => navigate(`/listing/${id}/edit`)}
            >
              <Edit size={16} />
              Edit Listing
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-[hsl(35,18%,78%)] text-[hsl(160,25%,24%)] hover:bg-[hsl(35,15%,94%)]"
                  disabled={actionLoading}
                >
                  <CheckCircle size={16} />
                  Mark as Fulfilled
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent nativeTheme={native}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark as Fulfilled?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will close the listing and mark it as successfully fulfilled. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleFulfill}
                    style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
                  >
                    Yes, Mark Fulfilled
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-red-300 text-red-600 hover:bg-red-50"
                  disabled={actionLoading}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent nativeTheme={native}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the listing. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Yes, Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : !isAuthenticated ? (
          <div className="p-4 rounded-xl border-2 border-dashed border-gray-200 text-center">
            <p className="text-muted-foreground mb-3 text-sm">Log in to interact with this listing</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/login')}>
                Log In
              </Button>
              <Button
                onClick={() => navigate('/register')}
                style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}
              >
                Register
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="flex-1 gap-2"
              disabled={interestLoading}
              onClick={handleInterest}
              style={
                hasInterest
                  ? { backgroundColor: 'hsl(160, 25%, 14%)' }
                  : { backgroundColor: 'hsl(160, 25%, 24%)' }
              }
            >
              <Star size={16} fill={hasInterest ? 'currentColor' : 'none'} />
              {hasInterest ? "I'm Interested (withdraw)" : "I'm Interested"}
            </Button>
            {listing.shop && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={async () => {
                  if (!listing || !listing.shop) return;
                  const targetShopId = listing.shop.id;
                  try {
                    const { data } = await runOnline(() => messageApi.startThread(targetShopId, listing.id));
                    navigate(`/messages/${data.id}`);
                  } catch (error) {
                    setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not start this message. Please try again.');
                  }
                }}
              >
                <MessageCircle size={16} />
                Message Business
              </Button>
            )}
            {!listing.shop && listing.posted_by && listing.posted_by.id !== user?.id && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={async () => {
                  if (!isAuthenticated) { navigate('/login'); return; }
                  if (!listing.posted_by) return;
                  const targetUserId = listing.posted_by.id;
                  try {
                    const { data } = await runOnline(() => messageApi.createDirectThread(targetUserId));
                    navigate(`/messages/${data.id}`);
                  } catch (error) {
                    setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not start this message. Please try again.');
                  }
                }}
              >
                <MessageCircle size={16} />
                Message {listing.posted_by.name.split(' ')[0]}
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2 cursor-pointer"
              onClick={handleSave}
            >
              <Bookmark size={16} fill={hasSaved ? 'currentColor' : 'none'} />
              {hasSaved ? 'Saved' : 'Save'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-gray-500 hover:text-red-500 cursor-pointer"
              onClick={() => {
                if (!isAuthenticated) { navigate('/login'); return; }
                setShowReport(true);
              }}
            >
              <Flag size={14} />
              Report
            </Button>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowReport(false); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[hsl(40,20%,98%)] rounded-lg shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-serif font-bold text-lg text-[hsl(30,15%,18%)] mb-1">Report Listing</h3>
            <p className="text-xs text-[hsl(30,10%,50%)] mb-4">Why are you reporting this?</p>

            {reported ? (
              <div className="text-center py-4">
                <CheckCircle className="w-10 h-10 mx-auto mb-2" style={{ color: 'hsl(160, 25%, 24%)' }} />
                <p className="text-sm font-medium text-[hsl(30,15%,18%)]">Report submitted. Our team will review it.</p>
                <Button variant="outline" className="mt-4 cursor-pointer" onClick={() => { setShowReport(false); setReported(false); }}>Close</Button>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {['inappropriate', 'spam', 'misleading', 'other'].map(r => (
                    <label key={r} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="reason" value={r} checked={reportReason === r}
                        onChange={() => setReportReason(r)} className="accent-[hsl(160,25%,24%)]" />
                      <span className="text-sm capitalize text-[hsl(30,15%,25%)]">{r}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Additional details (optional)"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-[hsl(35,18%,84%)] rounded resize-none mb-4"
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 cursor-pointer" onClick={() => setShowReport(false)}>Cancel</Button>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                    disabled={reportSubmitting}
                    onClick={async () => {
                      setReportSubmitting(true);
                      try {
                        await runOnline(() => listingApi.reportListing(id!, { reason: reportReason, details: reportDetails || undefined }));
                        setReported(true);
                      } catch (error) {
                        setActionError(error instanceof Error && error.message === 'OFFLINE_ACTION_UNAVAILABLE' ? 'OFFLINE_ACTION_UNAVAILABLE' : 'Could not submit this report. Please try again.');
                      }
                      setReportSubmitting(false);
                    }}
                  >
                    {reportSubmitting ? 'Submitting...' : 'Submit Report'}
                  </Button>
                </div>
                {actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}

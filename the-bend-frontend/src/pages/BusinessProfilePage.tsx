import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapPin, Phone, MessageCircle, Store, Calendar, Package, ThumbsUp, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { ListingCard } from '@/components/shared/ListingCard';
import { ShareButton } from '@/components/shared/ShareButton';
import { shopApi } from '@/services/shopApi';
import { messageApi } from '@/services/messageApi';
import { useAuthStore } from '@/stores/authStore';
import { resolveAssetUrl } from '@/lib/constants';
import type { Shop, Listing } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

const businessTypeLabels: Record<string, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  retail: 'Retail',
  service: 'Service',
  hardware: 'Hardware',
  deli: 'Deli',
  bakery: 'Bakery',
  other: 'Other',
};

export default function BusinessProfilePage() {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, shop: myShop } = useAuthStore();

  const [shopData, setShopData] = useState<Shop | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [endorsements, setEndorsements] = useState<Array<{
    id: string;
    message: string | null;
    created_at: string;
    endorser: { id: string; name: string; business_type: string; avatar_url: string | null };
  }>>([]);
  const [hasEndorsed, setHasEndorsed] = useState(false);
  const [endorseLoading, setEndorseLoading] = useState(false);
  const [endorseMessage, setEndorseMessage] = useState('');
  const [showEndorseForm, setShowEndorseForm] = useState(false);
  const [endorsementCount, setEndorsementCount] = useState(0);

  const isOwner = myShop && shopData && myShop.id === shopData.id;

  useEffect(() => {
    if (!shopId) return;
    setLoading(true);
    setError(null);

    Promise.all([
      shopApi.getShop(shopId),
      shopApi.getShopListings(shopId),
      shopApi.getEndorsements(shopId),
    ])
      .then(([shopRes, listingsRes, endorseRes]) => {
        setShopData(shopRes.data);
        setListings(listingsRes.data.items ?? listingsRes.data ?? []);
        setEndorsements(endorseRes.data.items ?? []);
        setEndorsementCount(endorseRes.data.count ?? 0);
        setHasEndorsed(shopRes.data.viewer_has_endorsed ?? false);
      })
      .catch(() => setError('Could not load this business profile.'))
      .finally(() => setLoading(false));
  }, [shopId]);

  async function handleEndorse() {
    if (!shopId) return;
    setEndorseLoading(true);
    try {
      if (hasEndorsed) {
        await shopApi.withdrawEndorsement(shopId);
        setHasEndorsed(false);
        setEndorsementCount((c) => c - 1);
        setEndorsements((prev) => prev.filter((e) => e.endorser.id !== myShop?.id));
      } else {
        await shopApi.endorse(shopId, endorseMessage || undefined);
        setHasEndorsed(true);
        setEndorsementCount((c) => c + 1);
        setShowEndorseForm(false);
        setEndorseMessage('');
        // Reload endorsements to show the new one
        const { data } = await shopApi.getEndorsements(shopId);
        setEndorsements(data.items ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setEndorseLoading(false);
    }
  }

  async function handleMessage() {
    if (!shopId) return;
    setMessagingLoading(true);
    try {
      const { data } = await messageApi.startThread(shopId);
      navigate(`/messages/${data.id}`);
    } catch {
      // silently fail
    } finally {
      setMessagingLoading(false);
    }
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 animate-pulse space-y-6">
          <div className="h-8 w-48 bg-[hsl(35,15%,90%)] rounded" />
          <div className="h-40 bg-[hsl(35,15%,90%)] rounded" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-[hsl(35,15%,90%)] rounded" />)}
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error || !shopData) {
    return (
      <PageLayout>
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[hsl(35,15%,90%)] flex items-center justify-center mx-auto mb-4">
            <Store className="w-8 h-8 text-[hsl(30,10%,55%)]" />
          </div>
          <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)] mb-2">Business Not Found</h2>
          <p className="text-[hsl(30,10%,48%)] mb-6">{error || 'This business profile does not exist.'}</p>
          <Button onClick={() => navigate('/directory')} style={{ backgroundColor: PRIMARY }} className="text-white">
            Browse Directory
          </Button>
        </div>
      </PageLayout>
    );
  }

  const avatarUrl = resolveAssetUrl(shopData.avatar_url);
  const typeLabel = businessTypeLabels[shopData.business_type] ?? shopData.business_type;
  const activeListings = listings.filter((l) => l.status === 'active');

  return (
    <PageLayout>
      {/* Museum-themed header */}
      <div className="border-b border-[hsl(35,18%,84%)]" style={{ backgroundColor: PRIMARY }}>
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-10">
          <div className="w-8 h-[2px] mb-3" style={{ backgroundColor: BRONZE }} />
          <p className="text-xs tracking-[0.3em] uppercase text-[hsl(35,45%,65%)] mb-1 font-medium">Business Profile</p>
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-[hsl(40,20%,95%)] leading-tight">
            {shopData.name}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8">
        {/* Business card */}
        <div className="border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-6 mb-8">
          <div className="flex flex-col sm:flex-row gap-5">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={shopData.name}
                  className="w-20 h-20 rounded-full object-cover border-2 border-[hsl(35,18%,84%)]"
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold font-serif border-2 border-[hsl(35,18%,84%)] text-white"
                  style={{ backgroundColor: PRIMARY }}
                >
                  {shopData.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-start gap-3 mb-3">
                <div>
                  <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)]">{shopData.name}</h2>
                  <Badge
                    className="mt-1 text-[11px] rounded-sm border-0 px-2 py-0.5"
                    style={{ backgroundColor: 'hsl(35,15%,88%)', color: 'hsl(30,15%,35%)' }}
                  >
                    {typeLabel}
                  </Badge>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <ShareButton url={`/business/${shopId}`} title={shopData.name} />
                  {isAuthenticated && !isOwner && (
                    <>
                      <Button
                        size="sm"
                        disabled={endorseLoading}
                        onClick={() => {
                          if (hasEndorsed) {
                            handleEndorse();
                          } else {
                            setShowEndorseForm(!showEndorseForm);
                          }
                        }}
                        variant={hasEndorsed ? 'default' : 'outline'}
                        className={`text-xs tracking-wider uppercase cursor-pointer ${
                          hasEndorsed
                            ? 'text-white'
                            : 'border-[hsl(35,18%,84%)] text-[hsl(30,15%,30%)] hover:border-[hsl(35,45%,42%)]'
                        }`}
                        style={hasEndorsed ? { backgroundColor: PRIMARY } : {}}
                      >
                        <ThumbsUp className="w-3.5 h-3.5 mr-1.5" fill={hasEndorsed ? 'currentColor' : 'none'} />
                        {hasEndorsed ? 'Endorsed' : 'Endorse'}
                      </Button>
                      <Button
                        size="sm"
                        disabled={messagingLoading}
                        onClick={handleMessage}
                        className="text-white text-xs tracking-wider uppercase cursor-pointer"
                        style={{ backgroundColor: BRONZE }}
                      >
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                        Message
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-[hsl(30,10%,45%)]">
                {shopData.address && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 flex-shrink-0 text-[hsl(35,45%,42%)]" />
                    <span>{shopData.address}</span>
                  </div>
                )}
                {shopData.contact_phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4 flex-shrink-0 text-[hsl(35,45%,42%)]" />
                    <a
                      href={`tel:${shopData.contact_phone}`}
                      className="hover:text-[hsl(35,45%,35%)] transition-colors"
                    >
                      {shopData.contact_phone}
                    </a>
                  </div>
                )}
                {shopData.whatsapp && (
                  <div className="flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 flex-shrink-0 text-[hsl(35,45%,42%)]" />
                    <a
                      href={`https://wa.me/${shopData.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[hsl(35,45%,35%)] transition-colors"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Endorse form (inline) */}
          {showEndorseForm && (
            <div className="mt-4 pt-4 border-t border-[hsl(35,18%,88%)]">
              <p className="text-sm font-medium text-[hsl(30,15%,18%)] mb-2">Write an endorsement (optional)</p>
              <textarea
                value={endorseMessage}
                onChange={(e) => setEndorseMessage(e.target.value)}
                placeholder="What makes this business great?"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-[hsl(35,18%,84%)] rounded resize-none mb-2 bg-white"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleEndorse}
                  disabled={endorseLoading}
                  className="text-white text-xs tracking-wider uppercase cursor-pointer"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <ThumbsUp className="w-3.5 h-3.5 mr-1.5" />
                  {endorseLoading ? 'Endorsing...' : 'Submit Endorsement'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowEndorseForm(false); setEndorseMessage(''); }}
                  className="text-xs cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-[hsl(35,18%,88%)]">
            <div className="flex items-center gap-2 text-sm text-[hsl(30,10%,45%)]">
              <Calendar className="w-4 h-4 text-[hsl(35,45%,42%)]" />
              <span>
                Member since{' '}
                {shopData.member_since
                  ? new Date(shopData.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                  : 'recently'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[hsl(30,10%,45%)]">
              <Package className="w-4 h-4 text-[hsl(35,45%,42%)]" />
              <span>{activeListings.length} active listing{activeListings.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[hsl(30,10%,45%)]">
              <Award className="w-4 h-4 text-[hsl(35,45%,42%)]" />
              <span>{endorsementCount} endorsement{endorsementCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* Endorsements */}
        {endorsements.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-[2px]" style={{ backgroundColor: BRONZE }} />
              <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)] tracking-wide">Endorsements</h2>
              <span className="text-xs text-[hsl(30,10%,55%)] bg-[hsl(35,15%,90%)] px-2 py-0.5 rounded-full font-medium">
                {endorsementCount}
              </span>
            </div>
            <div className="space-y-3">
              {endorsements.map((e) => (
                <div
                  key={e.id}
                  className="border border-[hsl(35,18%,84%)] bg-[hsl(40,20%,98%)] p-4 flex gap-3"
                >
                  <Link to={`/business/${e.endorser.id}`} className="flex-shrink-0">
                    {e.endorser.avatar_url ? (
                      <img
                        src={resolveAssetUrl(e.endorser.avatar_url)}
                        alt={e.endorser.name}
                        className="w-10 h-10 rounded-full object-cover border border-[hsl(35,18%,84%)]"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-serif border border-[hsl(35,18%,84%)] text-white"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {e.endorser.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/business/${e.endorser.id}`}
                        className="font-semibold text-sm text-[hsl(30,15%,18%)] hover:text-[hsl(35,45%,35%)] transition-colors"
                      >
                        {e.endorser.name}
                      </Link>
                      <Badge
                        className="text-[10px] rounded-sm border-0 px-1.5 py-0"
                        style={{ backgroundColor: 'hsl(35,15%,88%)', color: 'hsl(30,15%,35%)' }}
                      >
                        {e.endorser.business_type}
                      </Badge>
                    </div>
                    {e.message && (
                      <p className="text-sm text-[hsl(30,10%,40%)] mt-1 leading-relaxed italic font-serif">
                        &ldquo;{e.message}&rdquo;
                      </p>
                    )}
                    <p className="text-[10px] text-[hsl(30,10%,55%)] mt-1.5 uppercase tracking-wider">
                      {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <ThumbsUp className="w-4 h-4 text-[hsl(35,45%,42%)] flex-shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active listings */}
        <div>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-[2px]" style={{ backgroundColor: BRONZE }} />
            <h2 className="text-xl font-bold font-serif text-[hsl(30,15%,18%)] tracking-wide">Active Listings</h2>
          </div>

          {activeListings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 border border-dashed border-[hsl(35,18%,82%)] bg-[hsl(40,20%,98%)]">
              <Package className="w-8 h-8 text-[hsl(35,15%,75%)] mb-2" />
              <p className="text-sm text-[hsl(30,10%,50%)] italic">No active listings at this time</p>
              <Link
                to="/browse"
                className="mt-3 text-xs tracking-wider uppercase font-medium transition-colors"
                style={{ color: BRONZE }}
              >
                Browse All Listings
              </Link>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

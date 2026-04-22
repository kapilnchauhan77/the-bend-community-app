import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Store, MapPin, Package, Award } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageLayout } from '@/components/layout/PageLayout';
import { shopApi } from '@/services/shopApi';
import { resolveAssetUrl } from '@/lib/constants';
import type { Shop } from '@/types';

const PRIMARY = 'hsl(160, 25%, 24%)';
const BRONZE = 'hsl(35, 45%, 42%)';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'retail', label: 'Retail' },
  { value: 'service', label: 'Service' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'deli', label: 'Deli' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'other', label: 'Other' },
];

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

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function DirectoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebounce(search, 350);

  const fetchShops = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (category) params.business_type = category;

    shopApi
      .directory(params)
      .then((res) => {
        const data = res.data;
        setShops(Array.isArray(data) ? data : (data.items ?? []));
      })
      .catch(() => setShops([]))
      .finally(() => setLoading(false));
  }, [debouncedSearch, category]);

  useEffect(() => {
    fetchShops();
  }, [fetchShops]);

  return (
    <PageLayout>
      {/* Museum-themed header */}
      <div className="border-b border-[hsl(35,18%,84%)]" style={{ backgroundColor: PRIMARY }}>
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
          <div className="w-8 h-[2px] mb-3" style={{ backgroundColor: BRONZE }} />
          <p className="text-xs tracking-[0.3em] uppercase text-[hsl(35,45%,65%)] mb-1 font-medium">Community</p>
          <h1 className="text-3xl md:text-4xl font-bold font-serif text-[hsl(40,20%,95%)] leading-tight mb-2">
            Business Directory
          </h1>
          <p className="text-sm text-[hsl(40,15%,72%)] max-w-lg">
            Find local businesses in the community
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(30,10%,55%)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search businesses..."
            className="pl-10 h-11 rounded-none bg-[hsl(40,20%,98%)] border-[hsl(35,18%,84%)] text-sm"
          />
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2 mb-7">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setCategory(cat.value)}
              className="px-3 py-1.5 text-xs font-medium tracking-wider uppercase transition-all cursor-pointer border"
              style={
                category === cat.value
                  ? { backgroundColor: BRONZE, color: 'white', borderColor: BRONZE }
                  : { backgroundColor: 'hsl(40,20%,98%)', color: 'hsl(30,10%,40%)', borderColor: 'hsl(35,18%,84%)' }
              }
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-36 bg-[hsl(35,15%,92%)] animate-pulse" />
            ))}
          </div>
        ) : shops.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shops.map((shop) => {
              const avatarUrl = resolveAssetUrl(shop.avatar_url);
              const typeLabel = businessTypeLabels[shop.business_type] ?? shop.business_type;
              return (
                <div
                  key={shop.id}
                  onClick={() => navigate(`/business/${shop.id}`)}
                  className="bg-[hsl(40,20%,98%)] border border-[hsl(35,18%,84%)] p-4 cursor-pointer group hover:border-[hsl(35,45%,42%,0.4)] hover:shadow-md transition-all duration-150"
                >
                  <div className="flex items-start gap-3 mb-3">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={shop.name}
                        className="w-12 h-12 rounded-full object-cover border border-[hsl(35,18%,84%)] flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold font-serif flex-shrink-0 text-white"
                        style={{ backgroundColor: PRIMARY }}
                      >
                        {shop.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif font-semibold text-[hsl(30,15%,18%)] group-hover:text-[hsl(35,45%,35%)] transition-colors truncate">
                        {shop.name}
                      </h3>
                      <Badge
                        className="mt-1 text-[10px] rounded-sm border-0 px-1.5 py-0.5"
                        style={{ backgroundColor: 'hsl(35,15%,88%)', color: 'hsl(30,15%,35%)' }}
                      >
                        {typeLabel}
                      </Badge>
                    </div>
                  </div>

                  {shop.address && (
                    <div className="flex items-center gap-1.5 text-xs text-[hsl(30,10%,50%)] mb-2">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-[hsl(35,45%,42%)]" />
                      <span className="truncate">{shop.address}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-xs text-[hsl(30,10%,55%)]">
                    <div className="flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-[hsl(35,45%,42%)]" />
                      <span>
                        {shop.endorsement_count ?? 0} endorsement{(shop.endorsement_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-[hsl(35,45%,42%)]" />
                      <span>
                        {shop.active_listings_count ?? 0} listing{(shop.active_listings_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 border border-dashed border-[hsl(35,18%,82%)] bg-[hsl(40,20%,98%)]">
            <Store className="w-10 h-10 text-[hsl(35,15%,75%)] mb-3" />
            <p className="text-sm text-[hsl(30,10%,50%)] italic mb-1">No businesses found</p>
            {(search || category) && (
              <button
                onClick={() => { setSearch(''); setCategory(''); }}
                className="text-xs font-medium mt-2 tracking-wider uppercase transition-colors"
                style={{ color: BRONZE }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

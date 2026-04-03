import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Package, Wrench, Clock } from 'lucide-react';
import type { Listing } from '@/types';

const urgencyStyles = {
  normal: 'bg-gray-100 text-gray-600',
  urgent: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-600',
};

const categoryIcons = {
  staff: Users,
  materials: Package,
  equipment: Wrench,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ListingCard({ listing }: { listing: Listing }) {
  const navigate = useNavigate();
  const CategoryIcon = categoryIcons[listing.category] || Package;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/listing/${listing.id}`)}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <Badge className={urgencyStyles[listing.urgency]} variant="secondary">
            <span
              className={`w-2 h-2 rounded-full mr-1 ${
                listing.urgency === 'critical'
                  ? 'bg-red-500'
                  : listing.urgency === 'urgent'
                  ? 'bg-amber-500'
                  : 'bg-gray-400'
              }`}
            />
            {listing.urgency.charAt(0).toUpperCase() + listing.urgency.slice(1)}
          </Badge>
          <Badge
            variant={listing.type === 'offer' ? 'default' : 'outline'}
            className={
              listing.type === 'offer'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
            }
          >
            {listing.type === 'offer' ? 'Offer' : 'Request'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-2">
        <h3 className="font-semibold text-sm line-clamp-1">{listing.title}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{listing.description}</p>
      </CardContent>
      <CardFooter className="px-4 pb-3 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-[10px] font-bold text-green-700">
            {listing.shop.name.charAt(0)}
          </div>
          <span className="truncate max-w-[100px]">{listing.shop.name}</span>
        </div>
        <CategoryIcon className="w-3.5 h-3.5" />
        <div className="flex items-center gap-1">
          <Badge
            variant="secondary"
            className={listing.is_free ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}
          >
            {listing.is_free ? 'FREE' : `$${listing.price}`}
          </Badge>
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {timeAgo(listing.created_at)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}

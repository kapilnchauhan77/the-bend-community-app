import { Briefcase, Package, Wrench } from 'lucide-react';
import type { ListingCategory } from '@/types';
import { CATEGORY_LABELS } from '@/lib/constants';

const icons: Record<ListingCategory, React.ElementType> = {
  staff: Briefcase,
  materials: Package,
  equipment: Wrench,
};

export function CategoryIcon({
  category,
  showLabel = false,
  size = 16,
}: {
  category: ListingCategory;
  showLabel?: boolean;
  size?: number;
}) {
  const Icon = icons[category] || Package;
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Icon size={size} />
      {showLabel && <span className="text-xs">{CATEGORY_LABELS[category]}</span>}
    </span>
  );
}

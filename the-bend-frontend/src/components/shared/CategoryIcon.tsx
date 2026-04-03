import { Users, Package, Wrench } from 'lucide-react';
import type { ListingCategory } from '@/types';

const icons: Record<ListingCategory, React.ElementType> = {
  staff: Users,
  materials: Package,
  equipment: Wrench,
};

const labels: Record<ListingCategory, string> = {
  staff: 'Staff',
  materials: 'Materials',
  equipment: 'Equipment',
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
      {showLabel && <span className="text-xs">{labels[category]}</span>}
    </span>
  );
}

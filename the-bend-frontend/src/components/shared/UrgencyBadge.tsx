import { Badge } from '@/components/ui/badge';
import type { UrgencyLevel } from '@/types';

const styles: Record<UrgencyLevel, string> = {
  normal: 'bg-gray-100 text-gray-600',
  urgent: 'bg-amber-100 text-amber-700',
};

const dotColors: Record<UrgencyLevel, string> = {
  normal: 'bg-gray-400',
  urgent: 'bg-amber-500',
};

export function UrgencyBadge({ urgency }: { urgency: UrgencyLevel }) {
  return (
    <Badge className={styles[urgency]} variant="secondary">
      <span className={`w-2 h-2 rounded-full mr-1.5 inline-block ${dotColors[urgency]}`} />
      {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
    </Badge>
  );
}

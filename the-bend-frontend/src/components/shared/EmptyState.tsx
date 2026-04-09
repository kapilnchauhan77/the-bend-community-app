import { Button } from '@/components/ui/button';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
        {icon || <PackageOpen size={32} />}
      </div>
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-muted-foreground text-sm max-w-md mb-4">{description}</p>
      {action && (
        <Button onClick={action.onClick} style={{ backgroundColor: 'hsl(160, 25%, 24%)' }}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

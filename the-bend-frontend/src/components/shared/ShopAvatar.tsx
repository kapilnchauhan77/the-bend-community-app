import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function ShopAvatar({
  name,
  size = 'default',
}: {
  name: string;
  size?: 'sm' | 'default' | 'lg';
}) {
  const sizes = {
    sm: 'h-6 w-6 text-xs',
    default: 'h-8 w-8 text-sm',
    lg: 'h-12 w-12 text-lg',
  };
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar className={sizes[size]}>
      <AvatarFallback className="bg-green-100 text-green-700 font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

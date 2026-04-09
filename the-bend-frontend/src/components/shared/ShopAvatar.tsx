import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function ShopAvatar({
  name,
  avatarUrl,
  size = 'default',
}: {
  name: string;
  avatarUrl?: string;
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

  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${sizes[size]} rounded-full object-cover`} />;
  }

  return (
    <Avatar className={sizes[size]}>
      <AvatarFallback className="bg-[hsl(35,15%,90%)] text-[hsl(160,25%,24%)] font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

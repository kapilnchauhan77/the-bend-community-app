import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

export function ListingCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-2">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3 mt-1" />
      </CardContent>
      <CardFooter className="px-4 pb-3 pt-2 border-t">
        <div className="flex items-center justify-between w-full">
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-5 w-12 rounded" />
        </div>
      </CardFooter>
    </Card>
  );
}

export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ListingCardSkeleton key={i} />
      ))}
    </div>
  );
}

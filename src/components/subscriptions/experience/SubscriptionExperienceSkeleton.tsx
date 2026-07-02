import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

export function SubscriptionExperienceSkeleton({ className }: Props) {
  return (
    <div className={cn('space-y-6 max-w-6xl pb-10 animate-in fade-in-0 duration-300', className)} aria-busy="true" aria-label="Carregando assinatura">
      <Skeleton className="h-8 w-32" />
      <Card className="overflow-hidden">
        <CardContent className="p-6 sm:p-8 space-y-4">
          <div className="flex gap-4">
            <Skeleton className="h-14 w-14 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-40" />
            </div>
            <Skeleton className="h-16 w-24 hidden sm:block" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4 px-4 space-y-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="py-4">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[280px] w-full rounded-lg" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-4">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <Skeleton className="h-48 w-full rounded-none" />
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-20 w-20 rounded-full mx-auto" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

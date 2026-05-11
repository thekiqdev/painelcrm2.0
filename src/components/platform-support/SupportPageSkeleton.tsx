import { Skeleton } from '@/components/ui/skeleton';

export function SupportPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

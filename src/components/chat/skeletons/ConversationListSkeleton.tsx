import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function ConversationListSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('min-w-0 px-1 pb-1 pt-0.5', className)} aria-busy="true" aria-label="Carregando conversas">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="my-0.5 flex items-start gap-2.5 rounded-lg px-2 py-2">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-[58%] max-w-[12rem]" />
              <Skeleton className="h-3 w-10 shrink-0" />
            </div>
            <Skeleton className="h-3 w-[85%]" />
            <Skeleton className="h-3 w-[45%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

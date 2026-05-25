import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function ChatHeaderSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-border/80 bg-muted/20 px-2 py-2 md:px-3 md:py-2.5',
        className,
      )}
      aria-busy="true"
      aria-label="Carregando cabeçalho"
    >
      <Skeleton className="h-9 w-9 shrink-0 rounded-full md:h-10 md:w-10" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-[40%] max-w-[10rem]" />
        <Skeleton className="h-3 w-[28%] max-w-[7rem]" />
      </div>
      <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
    </div>
  );
}

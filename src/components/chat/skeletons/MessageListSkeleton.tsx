import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function MessageListSkeleton({ className }: { className?: string }) {
  const rows: Array<'left' | 'right'> = ['right', 'left', 'right', 'left', 'right', 'left'];
  return (
    <div
      className={cn('flex min-h-[10rem] w-full flex-col justify-end gap-3 px-2 py-4 md:px-4', className)}
      aria-busy="true"
      aria-label="Carregando mensagens"
    >
      {rows.map((side, i) => (
        <div
          key={i}
          className={cn('flex w-full', side === 'right' ? 'justify-end' : 'justify-start')}
        >
          <Skeleton
            className={cn(
              'h-12 rounded-2xl',
              side === 'right' ? 'w-[min(72%,18rem)] rounded-br-md' : 'w-[min(68%,16rem)] rounded-bl-md',
            )}
          />
        </div>
      ))}
    </div>
  );
}

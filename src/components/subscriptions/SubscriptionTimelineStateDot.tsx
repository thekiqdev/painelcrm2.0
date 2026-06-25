import { cn } from '@/lib/utils';
import type { SubscriptionTimelineOperationalState } from '@/services/crmSubscriptions';

const stateClass: Record<SubscriptionTimelineOperationalState, string> = {
  scheduled: 'bg-sky-500',
  awaiting_generation: 'bg-sky-400',
  in_queue: 'bg-blue-400',
  processing: 'bg-blue-600 animate-pulse',
  generated: 'bg-violet-500',
  paid: 'bg-emerald-500',
  failed: 'bg-destructive',
  skipped: 'bg-muted-foreground/50',
  cancelled: 'bg-muted-foreground/40',
  gateway_failed: 'bg-amber-500',
  manual_invoice: 'bg-slate-400',
  lifecycle_event: 'bg-orange-500',
};

type Props = {
  state: SubscriptionTimelineOperationalState;
  className?: string;
  title?: string;
};

export function SubscriptionTimelineStateDot({ state, className, title }: Props) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', stateClass[state], className)}
      title={title}
      aria-hidden
    />
  );
}

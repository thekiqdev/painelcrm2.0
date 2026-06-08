import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVATION_TIMELINE_ESTIMATE, ACTIVATION_TIMELINE_STEPS, ACTIVATION_TIMELINE_TITLE } from './constants';

type Props = {
  compact?: boolean;
  className?: string;
};

/** Checklist visual — o que acontece agora. */
export function ActivationTimeline({ compact = false, className }: Props) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
          {ACTIVATION_TIMELINE_TITLE}
        </p>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {ACTIVATION_TIMELINE_ESTIMATE}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {ACTIVATION_TIMELINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className="flex items-center gap-2.5 rounded-lg px-1 py-1.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-[10px] font-mono text-muted-foreground">
                {index + 1}
              </span>
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" strokeWidth={2} />
              <span className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** @deprecated Use ActivationTimeline */
export const ActivationWhatHappensNowCard = ActivationTimeline;

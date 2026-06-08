import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ACTIVATION_JOURNEY_STEPS,
  ACTIVATION_JOURNEY_TITLE,
  type ActivationJourneyStepId,
} from './constants';

type Props = {
  completedSteps: ActivationJourneyStepId[];
  currentStepId?: ActivationJourneyStepId | null;
  compact?: boolean;
  className?: string;
};

export function ActivationJourneyCard({
  completedSteps,
  currentStepId = null,
  compact = false,
  className,
}: Props) {
  return (
    <div className={cn('space-y-3', className)}>
      <p className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
        {ACTIVATION_JOURNEY_TITLE}
      </p>
      <ul className={cn('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
        {ACTIVATION_JOURNEY_STEPS.map((step) => {
          const done = completedSteps.includes(step.id);
          const current = step.id === currentStepId;
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                current && 'bg-primary/[0.08]',
                !done && !current && 'opacity-70',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all',
                  done && 'border-primary/50 bg-primary/20 text-primary',
                  current && !done && 'border-primary bg-primary/15 text-primary',
                  !done && !current && 'border-white/10 bg-white/[0.02] text-muted-foreground',
                )}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <Icon className="h-3 w-3" strokeWidth={2} />
                )}
              </span>
              <span
                className={cn(
                  'text-sm',
                  done && 'font-medium text-foreground',
                  current && !done && 'font-medium text-foreground',
                  !done && !current && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

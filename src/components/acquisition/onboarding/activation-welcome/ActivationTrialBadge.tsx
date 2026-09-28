import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVATION_TRIAL_BADGE } from './constants';

type Props = {
  className?: string;
};

export function ActivationTrialBadge({ className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-emerald-400/95',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" strokeWidth={2} />
      {ACTIVATION_TRIAL_BADGE}
    </span>
  );
}

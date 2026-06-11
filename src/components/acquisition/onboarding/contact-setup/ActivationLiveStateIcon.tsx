import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivationLiveState } from './activationPreviewTypes';

type Props = {
  state: ActivationLiveState;
  className?: string;
};

export function ActivationLiveStateIcon({ state, className }: Props) {
  if (state === 'completed') {
    return (
      <Check
        className={cn('h-3.5 w-3.5 shrink-0 text-emerald-400', className)}
        strokeWidth={2.5}
        aria-hidden
      />
    );
  }

  if (state === 'in_progress') {
    return (
      <Loader2
        className={cn('h-3.5 w-3.5 shrink-0 animate-spin text-primary', className)}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/35 bg-muted-foreground/15',
        className,
      )}
      aria-hidden
    />
  );
}

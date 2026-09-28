import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  variant?: 'default' | 'success' | 'ai';
  className?: string;
};

export function ActivationBadge({ children, variant = 'default', className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        variant === 'default' && 'border-white/10 bg-white/5 text-muted-foreground',
        variant === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        variant === 'ai' && 'border-violet-500/30 bg-violet-500/10 text-violet-200',
        className,
      )}
    >
      {children}
    </span>
  );
}

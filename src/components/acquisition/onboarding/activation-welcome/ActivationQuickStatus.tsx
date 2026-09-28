import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVATION_QUICK_STATUS } from './constants';

type Props = {
  className?: string;
};

export function ActivationQuickStatus({ className }: Props) {
  return (
    <div className={cn('mb-5 hidden flex-wrap gap-2 lg:mb-6 lg:flex', className)}>
      {ACTIVATION_QUICK_STATUS.map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-foreground/85"
        >
          <Check className="h-3 w-3 text-primary" strokeWidth={2.5} />
          {label}
        </span>
      ))}
    </div>
  );
}

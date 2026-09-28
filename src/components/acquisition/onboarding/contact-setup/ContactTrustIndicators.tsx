import { cn } from '@/lib/utils';
import { CONTACT_TRUST_INDICATORS } from './contactSetupConstants';

type Props = {
  compact?: boolean;
  className?: string;
};

export function ContactTrustIndicators({ compact = false, className }: Props) {
  return (
    <ul className={cn('flex flex-col gap-2', compact ? 'gap-1.5' : 'gap-2.5', className)}>
      {CONTACT_TRUST_INDICATORS.map((item) => {
        const Icon = item.icon;
        return (
          <li
            key={item.text}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02]',
              compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
            )}
          >
            <Icon
              className={cn('shrink-0 text-primary/85', compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-0.5 h-4 w-4')}
              strokeWidth={2}
            />
            <span className={cn('text-muted-foreground', compact ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed')}>
              {item.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

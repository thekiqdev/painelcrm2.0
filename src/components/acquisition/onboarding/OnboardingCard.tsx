import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { activationGlassCardClass } from './activationAppStyles';

type Props = {
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'focus' | 'glass';
};

export function OnboardingCard({
  children,
  className,
  title,
  subtitle,
  variant = 'glass',
}: Props) {
  return (
    <div
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both',
        variant === 'glass' && activationGlassCardClass,
        variant === 'default' &&
          'rounded-2xl border border-white/[0.08] bg-card/90 p-5 shadow-xl shadow-black/30 backdrop-blur-xl sm:p-8',
        variant === 'focus' &&
          'space-y-6 lg:rounded-2xl lg:border lg:border-white/[0.08] lg:bg-white/[0.03] lg:p-8 lg:backdrop-blur-xl',
        className,
      )}
    >
      {(title || subtitle) && (
        <header className="mb-6 space-y-2">
          {title ? (
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground lg:text-[1.85rem]">
              {title}
            </h1>
          ) : null}
          {subtitle ? (
            <p className="text-sm leading-relaxed text-muted-foreground lg:text-[15px]">{subtitle}</p>
          ) : null}
        </header>
      )}
      {children}
    </div>
  );
}

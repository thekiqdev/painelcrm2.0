import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CheckoutStepperItem = {
  id: number;
  title: string;
  icon: LucideIcon;
};

type Props = {
  steps: CheckoutStepperItem[];
  /** Índice 0-based do passo ativo entre `steps`. */
  activeIndex: number;
};

/**
 * Stepper compacto (D3 + S4 motion/a11y): dots + label no mobile; labels no desktop.
 */
export function CheckoutCompactStepper({ steps, activeIndex }: Props) {
  if (steps.length === 0) return null;

  const safeIndex = Math.max(0, Math.min(activeIndex, steps.length - 1));
  const activeTitle = steps[safeIndex]?.title ?? '';

  return (
    <nav aria-label="Progresso do checkout" className="mx-auto w-full max-w-5xl">
      {/* Mobile: dots + passo ativo */}
      <div className="flex items-center gap-2 sm:hidden">
        <ol className="flex items-center gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                'h-2 w-2 rounded-full motion-safe:transition-[background-color,transform] motion-safe:duration-200',
                i === safeIndex && 'scale-125 bg-primary',
                i < safeIndex && i !== safeIndex && 'bg-primary/45',
                i > safeIndex && 'bg-muted'
              )}
            />
          ))}
        </ol>
        <p
          className="truncate text-xs font-medium text-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
          key={safeIndex}
          aria-live="polite"
        >
          <span className="text-muted-foreground">
            {safeIndex + 1}/{steps.length}
          </span>
          <span className="mx-1.5 text-muted-foreground/60">·</span>
          {activeTitle}
        </p>
      </div>

      {/* Desktop: labels compactas */}
      <ol className="hidden items-center gap-1 sm:flex">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const active = i === safeIndex;
          const done = i < safeIndex;
          return (
            <li key={s.id} className="inline-flex items-center gap-1">
              <div
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs',
                  'motion-safe:transition-colors motion-safe:duration-200',
                  active && 'bg-primary text-primary-foreground shadow-sm',
                  done && !active && 'bg-primary/20 text-primary',
                  !active && !done && 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{s.title}</span>
              </div>
              {i < steps.length - 1 ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

import { cn } from '@/lib/utils';
import { ONBOARDING_STEPS } from './constants';

type Props = {
  currentIndex: number;
  className?: string;
};

export function OnboardingStepper({ currentIndex, className }: Props) {
  const progress = ((currentIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <nav aria-label="Progresso do cadastro" className={cn('mb-6 sm:mb-8', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ativação</p>
        <p className="font-mono text-xs tabular-nums text-primary">{Math.round(progress)}%</p>
      </div>

      <div className="mb-4 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full bg-primary/90 transition-all duration-700 ease-out shadow-[0_0_12px_hsl(var(--primary)/0.45)]"
          style={{ width: `${Math.min(100, Math.max(progress, 4))}%` }}
        />
      </div>

      <ol className="flex items-center gap-0.5 sm:gap-1">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const Icon = step.icon;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border text-xs transition-all duration-300',
                    done && 'border-primary/40 bg-primary/15 text-primary',
                    active &&
                      'border-primary/60 bg-primary text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary)/0.55)]',
                    !done && !active && 'border-white/10 bg-white/[0.03] text-muted-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={cn(
                    'w-full truncate text-center text-[10px] font-medium',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.short}
                </span>
              </div>
              {i < ONBOARDING_STEPS.length - 1 ? (
                <div
                  className={cn(
                    'mx-0.5 h-px min-w-[6px] max-w-[20px] flex-1 transition-colors duration-300',
                    i < currentIndex ? 'bg-primary/50' : 'bg-white/10',
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

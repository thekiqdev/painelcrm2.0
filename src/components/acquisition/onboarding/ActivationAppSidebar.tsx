import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivationBadge } from './ActivationBadge';
import { ONBOARDING_STEPS } from './constants';

type Props = {
  activeStepIndex: number;
};

export function ActivationAppSidebar({ activeStepIndex }: Props) {
  const [pulse, setPulse] = useState(false);
  const progress = Math.round(((activeStepIndex + 1) / ONBOARDING_STEPS.length) * 100);
  const current = ONBOARDING_STEPS[activeStepIndex] ?? ONBOARDING_STEPS[0]!;

  useEffect(() => {
    const id = window.setInterval(() => setPulse((p) => !p), 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside
      className={cn(
        'hidden w-[min(340px,32vw)] min-w-[280px] shrink-0 flex-col',
        'border-r border-white/[0.06]',
        'bg-white/[0.02] backdrop-blur-2xl',
        'lg:flex',
        'lg:h-full',
      )}
    >
      <div className="flex flex-1 flex-col px-6 py-8 xl:px-8">
        <Link
          to="/"
          className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground/90 transition-opacity hover:opacity-80"
        >
          PainelCRM
        </Link>

        <div className="mt-8 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Status de ativação
          </p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold tabular-nums text-primary transition-all duration-500">
              {progress}%
            </span>
            <span className="text-xs text-muted-foreground">concluído</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-primary/90 shadow-[0_0_14px_hsl(var(--primary)/0.5)] transition-all duration-700 ease-out"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
        </div>

        <nav className="mt-10 flex-1" aria-label="Jornada de ativação">
          <ol className="relative space-y-0">
            <div
              className="absolute left-[15px] top-4 bottom-4 w-px bg-white/[0.08]"
              aria-hidden
            />
            {ONBOARDING_STEPS.map((step, i) => {
              const done = i < activeStepIndex;
              const active = i === activeStepIndex;
              const future = i > activeStepIndex;
              const Icon = step.icon;
              const lineActive = i < activeStepIndex;

              return (
                <li key={step.id} className="relative flex gap-4 pb-8 last:pb-0">
                  {i < ONBOARDING_STEPS.length - 1 ? (
                    <div
                      className={cn(
                        'absolute left-[15px] top-8 h-[calc(100%-8px)] w-px transition-colors duration-500',
                        lineActive ? 'bg-primary/50 shadow-[0_0_8px_hsl(var(--primary)/0.4)]' : 'bg-white/[0.06]',
                      )}
                      aria-hidden
                    />
                  ) : null}

                  <div
                    className={cn(
                      'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300',
                      done && 'border-primary/50 bg-primary/20 text-primary',
                      active &&
                        'border-primary bg-primary text-primary-foreground shadow-[0_0_24px_-4px_hsl(var(--primary)/0.65)]',
                      future && 'border-white/10 bg-white/[0.02] text-muted-foreground/50',
                    )}
                  >
                    {done ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    ) : (
                      <Icon className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div
                    className={cn(
                      'min-w-0 pt-0.5 transition-all duration-300',
                      active && 'translate-x-0.5',
                    )}
                  >
                    <p
                      className={cn(
                        'text-sm font-semibold tracking-tight transition-colors',
                        active && 'text-foreground',
                        done && !active && 'text-foreground/85',
                        future && 'text-muted-foreground/55',
                      )}
                    >
                      {step.short}
                    </p>
                    <p
                      className={cn(
                        'mt-0.5 text-xs leading-snug transition-colors',
                        active && 'text-muted-foreground',
                        done && !active && 'text-muted-foreground/80',
                        future && 'text-muted-foreground/40',
                      )}
                    >
                      {step.description}
                    </p>
                    {active ? (
                      <div className="mt-2 h-px w-12 rounded-full bg-primary/70 shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-auto space-y-3 rounded-xl border border-white/[0.07] bg-black/25 p-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span
                className={cn(
                  'absolute inline-flex h-full w-full rounded-full bg-emerald-400/50',
                  pulse && 'animate-ping opacity-60',
                )}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-xs text-muted-foreground">Ativação em andamento</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ActivationBadge variant="default">
              <Sparkles className="h-3 w-3" />
              {current.short}
            </ActivationBadge>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/90">
            Sistema operacional preparando workspace — etapa{' '}
            <span className="text-foreground/80">{current.short}</span>.
          </p>
        </div>
      </div>
    </aside>
  );
}

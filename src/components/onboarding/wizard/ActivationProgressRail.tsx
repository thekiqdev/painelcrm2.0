import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPERATIONAL_WIZARD_STEPS } from './constants';

type Props = {
  progress: number;
  currentStepId: string;
  completedSteps: string[];
  /** Anima checks quando ativação concluída (WhatsApp conectado). */
  celebrateComplete?: boolean;
};

export function ActivationProgressRail({
  progress,
  currentStepId,
  completedSteps,
  celebrateComplete = false,
}: Props) {
  const pct = Math.min(100, Math.max(progress, 0));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-foreground/90">Ativação operacional</p>
        <p className="font-mono text-sm tabular-nums text-primary transition-all duration-500">
          {Math.round(pct)}%
        </p>
      </div>

      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/90 transition-[width] duration-700 ease-out shadow-[0_0_16px_hsl(var(--primary)/0.45)]"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Etapas da ativação">
        {OPERATIONAL_WIZARD_STEPS.map((step) => {
          const done = celebrateComplete || completedSteps.includes(step.id);
          const current = !celebrateComplete && step.id === currentStepId;
          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center gap-2 transition-colors duration-300',
                done && 'text-foreground/90',
                current && !done && 'text-foreground',
                !done && !current && 'text-muted-foreground/65',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition-all duration-300',
                  done && 'border-primary/60 bg-primary/20 text-primary',
                  done && celebrateComplete && 'animate-in zoom-in-50 duration-500 fill-mode-both',
                  current && !done &&
                    'border-primary bg-primary text-primary-foreground shadow-[0_0_16px_-4px_hsl(var(--primary)/0.5)]',
                  !done && !current && 'border-white/12 bg-transparent',
                )}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
              </span>
              <span className={cn('font-medium', current && 'text-foreground')}>{step.short}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

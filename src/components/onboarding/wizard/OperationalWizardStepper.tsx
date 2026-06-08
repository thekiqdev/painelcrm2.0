import { cn } from '@/lib/utils';
import { OPERATIONAL_WIZARD_STEPS } from './constants';

type Props = {
  currentStepId: string;
  completedSteps: string[];
  progress: number;
};

export function OperationalWizardStepper({ currentStepId, completedSteps, progress }: Props) {
  const currentIndex = OPERATIONAL_WIZARD_STEPS.findIndex((s) => s.id === currentStepId);

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Ativação operacional</span>
        <span className="font-mono text-primary">{progress}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500"
          style={{ width: `${Math.max(progress, 4)}%` }}
        />
      </div>
      <nav aria-label="Etapas do onboarding" className="flex gap-1">
        {OPERATIONAL_WIZARD_STEPS.map((step, i) => {
          const done = completedSteps.includes(step.id);
          const active = step.id === currentStepId || (currentIndex < 0 && i === 0);
          const Icon = step.icon;
          return (
            <div key={step.id} className="flex flex-1 flex-col items-center gap-1.5 min-w-0">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border transition-all',
                  done && 'border-primary/50 bg-primary/20 text-primary',
                  active && !done && 'border-primary bg-primary text-primary-foreground shadow-[0_0_24px_-8px_hsl(var(--primary))]',
                  !done && !active && 'border-white/10 bg-white/[0.03] text-muted-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className={cn('text-[10px] font-medium truncate w-full text-center', active && 'text-foreground')}>
                {step.short}
              </span>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

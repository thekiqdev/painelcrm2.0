import { Building2, Check, MessageCircle, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingJourneyStepId } from '../OnboardingJourneyProgressTracker';

const STEPS: { id: OnboardingJourneyStepId; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'company', label: 'Empresa', icon: Building2 },
  { id: 'users', label: 'Equipe', icon: Users },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

type Props = {
  currentStepId: OnboardingJourneyStepId;
  completedWizardSteps?: string[];
  teamStepEnabled?: boolean;
};

export function WizardCompactStepSummary({
  currentStepId,
  completedWizardSteps = [],
  teamStepEnabled = true,
}: Props) {
  const steps = teamStepEnabled ? STEPS : STEPS.filter((s) => s.id !== 'users');
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Jornada
      </p>
      <ul className="space-y-1.5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done =
            index < currentIndex ||
            (step.id !== 'profile' && completedWizardSteps.includes(step.id));
          const current = step.id === currentStepId;

          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors',
                current && 'bg-primary/10 text-foreground',
                done && !current && 'text-foreground/85',
                !done && !current && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  done && 'border-primary/40 bg-primary/15 text-primary',
                  current && !done && 'border-primary bg-primary text-primary-foreground',
                  !done && !current && 'border-white/10 bg-transparent',
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Icon className="h-3 w-3" />}
              </span>
              <span className="font-medium">{step.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

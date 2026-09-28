import { Building2, Check, MessageCircle, User, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OnboardingJourneyStepId = 'profile' | 'company' | 'users' | 'whatsapp';

const ALL_STEPS: { id: OnboardingJourneyStepId; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'company', label: 'Empresa', icon: Building2 },
  { id: 'users', label: 'Equipe', icon: Users },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
];

type Props = {
  currentStepId?: OnboardingJourneyStepId;
  teamStepEnabled?: boolean;
  /** Todas as etapas concluídas (tela de sucesso WhatsApp). */
  allComplete?: boolean;
};

export function OnboardingJourneyProgressTracker({
  currentStepId = 'profile',
  teamStepEnabled = true,
  allComplete = false,
}: Props) {
  const steps = teamStepEnabled ? ALL_STEPS : ALL_STEPS.filter((s) => s.id !== 'users');
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  return (
    <nav aria-label="Progresso do onboarding" className="w-full">
      <ul className="flex items-start justify-between gap-1">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const done = allComplete || index < currentIndex;
          const current = !allComplete && step.id === currentStepId;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
                  done && 'border-primary/50 bg-primary/15 text-primary',
                  done && allComplete && 'animate-in zoom-in-50 duration-500 fill-mode-both',
                  current &&
                    'border-primary bg-primary text-primary-foreground shadow-[0_0_16px_-4px_hsl(var(--primary)/0.55)]',
                  !done && !current && 'border-white/12 bg-white/[0.02] text-muted-foreground',
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : (
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
              </span>
              <span
                className={cn(
                  'max-w-[4.5rem] truncate text-center text-[10px] font-medium leading-tight',
                  current ? 'text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function filterJourneySteps(teamStepEnabled: boolean) {
  return teamStepEnabled ? ALL_STEPS : ALL_STEPS.filter((s) => s.id !== 'users');
}

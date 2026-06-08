import { Building2, Check, Circle, MessageCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ACTIVATION_MOBILE_OPERATION_STATUS_TITLE,
  ACTIVATION_OPERATION_STATUS_TITLE,
  OPERATION_PILLAR_LABELS,
  type OperationPillarId,
  type OperationPillarStatus,
} from './constants';

export type OperationPillarState = {
  status: OperationPillarStatus;
  detail?: string | null;
};

type Props = {
  pillars: Record<OperationPillarId, OperationPillarState>;
  compact?: boolean;
  /** Preenche altura disponível na coluna (welcome desktop). */
  stretch?: boolean;
  /** Estilo timeline de onboarding (mobile welcome). */
  variant?: 'default' | 'onboarding';
  className?: string;
};

const PILLAR_ICONS = {
  company: Building2,
  users: Users,
  whatsapp: MessageCircle,
} as const;

const PILLAR_ORDER: OperationPillarId[] = ['company', 'users', 'whatsapp'];

function isCompleted(status: OperationPillarStatus): boolean {
  return status === 'configured';
}

/** Card vivo — status da operação (reutilizado na welcome e no wizard). */
export function OperationStatusCard({
  pillars,
  compact = false,
  stretch = false,
  variant = 'default',
  className,
}: Props) {
  const completedCount = PILLAR_ORDER.filter((id) => isCompleted(pillars[id].status)).length;
  const title =
    variant === 'onboarding' ? ACTIVATION_MOBILE_OPERATION_STATUS_TITLE : ACTIVATION_OPERATION_STATUS_TITLE;

  if (variant === 'onboarding') {
    return (
      <div
        className={cn(
          'rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-4 lg:hidden',
          className,
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {completedCount}/3
          </span>
        </div>
        <ol className="relative flex flex-col gap-0">
          {PILLAR_ORDER.map((id, index) => {
            const meta = OPERATION_PILLAR_LABELS[id];
            const state = pillars[id];
            const completed = isCompleted(state.status);
            const Icon = PILLAR_ICONS[id];
            const isLast = index === PILLAR_ORDER.length - 1;
            const hint = completed
              ? state.detail?.trim() || 'Configurado'
              : state.detail?.trim() || meta.pendingHint;

            return (
              <li key={id} className="relative flex gap-3 pb-4 last:pb-0">
                {!isLast ? (
                  <span
                    className="absolute left-[15px] top-8 h-[calc(100%-12px)] w-px bg-white/10"
                    aria-hidden
                  />
                ) : null}
                <span
                  className={cn(
                    'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                    completed
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-white/15 bg-white/[0.04] text-muted-foreground',
                  )}
                >
                  {completed ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">{meta.title}</p>
                    <span
                      className={cn(
                        'text-[10px] font-medium',
                        completed ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {completed ? 'Configurado' : 'Não configurado'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-white/[0.02]',
        compact ? 'px-3 py-3' : 'px-4 py-3.5',
        stretch && 'flex min-h-0 flex-1 flex-col',
        className,
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className={cn('font-medium text-foreground', compact ? 'text-xs' : 'text-sm')}>
          {title}
        </p>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {completedCount}/3
        </span>
      </div>

      <ul
        className={cn(
          'flex flex-col',
          compact ? 'gap-1.5' : 'gap-2',
          stretch && 'min-h-0 flex-1 justify-between',
        )}
      >
        {PILLAR_ORDER.map((id) => {
          const meta = OPERATION_PILLAR_LABELS[id];
          const state = pillars[id];
          const completed = isCompleted(state.status);
          const hint = completed
            ? state.detail?.trim() || 'Configurado'
            : state.detail?.trim() || meta.pendingHint;

          return (
            <li
              key={id}
              className={cn(
                'flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors',
                completed ? 'bg-primary/[0.05]' : 'bg-transparent',
                stretch && 'flex-1',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center',
                  completed ? 'text-primary' : 'text-muted-foreground/60',
                )}
              >
                {completed ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  <Circle className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn('font-medium text-foreground', compact ? 'text-[11px]' : 'text-xs')}>
                    {meta.title}
                  </p>
                  <span
                    className={cn(
                      'shrink-0 text-[9px] font-medium',
                      completed ? 'text-primary' : 'text-muted-foreground/70',
                    )}
                  >
                    {completed ? 'Configurado' : 'Não configurado'}
                  </span>
                </div>
                <p className={cn('truncate text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px]')}>
                  {hint}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function buildWelcomeOperationPillars(): Record<OperationPillarId, OperationPillarState> {
  return {
    company: { status: 'pending' },
    users: { status: 'pending' },
    whatsapp: { status: 'pending' },
  };
}

export function buildWizardOperationPillars(input: {
  completedSteps: string[];
  currentStep: OperationPillarId | null;
  companyName?: string | null;
  memberCount?: number;
  whatsappLabel?: string | null;
}): Record<OperationPillarId, OperationPillarState> {
  const { completedSteps, currentStep, companyName, memberCount, whatsappLabel } = input;

  const companyStatus = completedSteps.includes('company')
    ? 'configured'
    : currentStep === 'company'
      ? 'in_progress'
      : 'pending';
  const usersStatus = completedSteps.includes('users')
    ? 'configured'
    : currentStep === 'users'
      ? 'in_progress'
      : 'pending';
  const whatsappStatus = completedSteps.includes('whatsapp')
    ? 'configured'
    : currentStep === 'whatsapp'
      ? 'in_progress'
      : 'pending';

  return {
    company: {
      status: companyStatus,
      detail: companyName?.trim() || undefined,
    },
    users: {
      status: usersStatus,
      detail:
        memberCount != null && memberCount > 0
          ? `${memberCount} ${memberCount === 1 ? 'membro' : 'membros'}`
          : undefined,
    },
    whatsapp: {
      status: whatsappStatus,
      detail: whatsappLabel?.trim() || undefined,
    },
  };
}

/** @deprecated Use OperationStatusCard */
export const FutureOperationPreview = OperationStatusCard;

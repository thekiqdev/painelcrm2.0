import { ActivationCtaSection } from './ActivationCtaSection';
import { ActivationOperationCard } from './ActivationOperationCard';
import { ActivationTrialBadge } from './ActivationTrialBadge';
import { ActivationCtaButton } from './ActivationCtaButton';
import { cn } from '@/lib/utils';

type Props = {
  trialLabel: string | null;
  trialDays?: number;
  usersCount: number;
  loading: boolean;
  onContinue: () => void;
  showCta?: boolean;
  className?: string;
};

/** Coluna direita — trial, resumo e bloco final com CTA. */
export function ActivationLaunchPanel({
  trialLabel,
  trialDays,
  usersCount,
  loading,
  onContinue,
  showCta = true,
  className,
}: Props) {
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ActivationTrialBadge />
      </div>

      <ActivationOperationCard
        trialLabel={trialLabel}
        trialDays={trialDays}
        usersCount={usersCount}
        compact
        className="flex-1"
      />

      {showCta ? (
        <ActivationCtaSection loading={loading} onContinue={onContinue} className="mt-auto shrink-0" />
      ) : null}
    </div>
  );
}

export { ActivationCtaButton as ActivationWelcomeCta };

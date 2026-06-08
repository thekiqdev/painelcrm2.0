import { ActivationLaunchPanel } from './ActivationLaunchPanel';
import { ActivationMobileHeader } from './ActivationMobileHeader';
import { ActivationProfileCard } from './ActivationProfileCard';
import { ActivationProgressVisualization } from './ActivationProgressVisualization';
import { ActivationQuickStatus } from './ActivationQuickStatus';
import { ActivationTrialBadge } from './ActivationTrialBadge';
import { ActivationWelcomeSection } from './ActivationWelcomeSection';
import { buildWelcomeOperationPillars, OperationStatusCard } from './OperationStatusCard';

type Props = {
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  trialDays: number;
  usersCount: number;
  trialLabel: string | null;
  loading: boolean;
  onContinue: () => void;
  layout?: 'page' | 'mobile-footer';
};

export function ActivationWelcomeStep({
  leadName,
  leadEmail,
  leadPhone,
  trialDays,
  usersCount,
  trialLabel,
  loading,
  onContinue,
  layout = 'page',
}: Props) {
  const trialDisplay =
    trialLabel ??
    (trialDays >= 1 ? `${trialDays} ${trialDays === 1 ? 'dia' : 'dias'} para explorar` : null);

  if (layout === 'mobile-footer') {
    return null;
  }

  const pillars = buildWelcomeOperationPillars();

  return (
    <div className="animate-in fade-in duration-400 fill-mode-both">
      {/* —— Mobile —— */}
      <div className="flex flex-col gap-4 pb-4 lg:hidden">
        <ActivationMobileHeader userName={leadName} />
        <ActivationProfileCard name={leadName} email={leadEmail} phone={leadPhone} showBadges />
        <ActivationProgressVisualization />
        <OperationStatusCard pillars={pillars} variant="onboarding" />
        <div className="flex justify-center pt-1">
          <ActivationTrialBadge />
        </div>
      </div>

      {/* —— Desktop —— */}
      <div className="hidden lg:block">
        <ActivationWelcomeSection userName={leadName} />
        <ActivationQuickStatus />

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,380px)_1fr] lg:items-stretch lg:gap-6">
          <div className="flex h-full min-h-0 flex-col gap-3">
            <ActivationProfileCard name={leadName} email={leadEmail} phone={leadPhone} showBadges />
            <OperationStatusCard pillars={pillars} stretch />
          </div>

          <ActivationLaunchPanel
            trialLabel={trialDisplay}
            trialDays={trialDays}
            usersCount={usersCount}
            loading={loading}
            onContinue={onContinue}
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
}

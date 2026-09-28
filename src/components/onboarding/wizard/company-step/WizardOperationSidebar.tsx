import { ActivationProfileCard } from '@/components/acquisition/onboarding/activation-welcome/ActivationProfileCard';
import type { ActivationJourneyStepId } from '@/components/acquisition/onboarding/activation-welcome/constants';
import type { OnboardingJourneyStepId } from '@/components/onboarding/wizard/OnboardingJourneyProgressTracker';
import { WizardCompactStepSummary } from './WizardCompactStepSummary';
import { OperationalCompanyCard } from './OperationalCompanyCard';

type Props = {
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  completedWizardSteps: string[];
  currentWizardStep: ActivationJourneyStepId;
  companyName: string;
  logoLight: string | null;
  logoDark: string | null;
  teamStepEnabled?: boolean;
  /** Etapa Empresa — card ao vivo enquanto monta a operação. */
  operationLiveDraft?: boolean;
};

function mapJourneyStep(step: ActivationJourneyStepId): OnboardingJourneyStepId {
  if (step === 'profile') return 'profile';
  return step;
}

export function WizardOperationSidebar({
  leadName,
  leadEmail,
  leadPhone,
  completedWizardSteps,
  currentWizardStep,
  companyName,
  logoLight,
  logoDark,
  teamStepEnabled = true,
  operationLiveDraft = false,
}: Props) {
  const journeyStep = mapJourneyStep(currentWizardStep);
  const companySaved = completedWizardSteps.includes('company');
  const showOperationCard = operationLiveDraft || companySaved;

  return (
    <div className="flex w-full min-w-0 max-w-[300px] flex-col gap-2.5 max-lg:max-w-none">
      <ActivationProfileCard
        name={leadName}
        email={leadEmail}
        phone={leadPhone}
        compact
        allowUpload
        showBadges={false}
      />
      {showOperationCard ? (
        <OperationalCompanyCard
          companyName={companyName}
          logoLight={logoLight}
          logoDark={logoDark}
          liveDraft={operationLiveDraft && !companySaved}
          compact={operationLiveDraft}
        />
      ) : null}
      <div className="hidden lg:block">
        <WizardCompactStepSummary
          currentStepId={journeyStep}
          completedWizardSteps={completedWizardSteps}
          teamStepEnabled={teamStepEnabled}
        />
      </div>
    </div>
  );
}

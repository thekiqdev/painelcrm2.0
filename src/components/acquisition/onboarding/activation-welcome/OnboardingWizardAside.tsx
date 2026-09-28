import type { ActivationJourneyStepId } from './constants';
import { WizardOperationSidebar } from '@/components/onboarding/wizard/company-step';

type Props = {
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  completedWizardSteps: string[];
  currentWizardStep: ActivationJourneyStepId;
  companyName?: string | null;
  logoLight?: string | null;
  logoDark?: string | null;
  teamStepEnabled?: boolean;
  className?: string;
};

/** @deprecated Use WizardOperationSidebar */
export function OnboardingWizardAside(props: Props) {
  return (
    <WizardOperationSidebar
      leadName={props.leadName}
      leadEmail={props.leadEmail}
      leadPhone={props.leadPhone}
      completedWizardSteps={props.completedWizardSteps}
      currentWizardStep={props.currentWizardStep}
      companyName={props.companyName ?? ''}
      logoLight={props.logoLight ?? null}
      logoDark={props.logoDark ?? null}
      teamStepEnabled={props.teamStepEnabled}
    />
  );
}

import { OnboardingJourneyProgressTracker } from '../OnboardingJourneyProgressTracker';
import type { OnboardingJourneyStepId } from '../OnboardingJourneyProgressTracker';

type Props = {
  currentStepId?: OnboardingJourneyStepId;
};

/** @deprecated Prefer OnboardingJourneyProgressTracker */
export function ProvisionMobileProgressTracker({ currentStepId = 'profile' }: Props) {
  return <OnboardingJourneyProgressTracker currentStepId={currentStepId} />;
}

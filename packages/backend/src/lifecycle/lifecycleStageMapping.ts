import type { AcquisitionLeadStage } from '../acquisition/acquisitionTypes.js';
import type { LifecycleEventType } from './lifecycleTypes.js';

/**
 * Inferência best-effort para modo observação no sync de acquisition (não altera coluna real).
 */
export function inferLifecycleEventFromAcquisitionSync(input: {
  currentStage: AcquisitionLeadStage;
  cardCreated: boolean;
  signupStep?: string;
}): LifecycleEventType | null {
  if (input.signupStep === 'plan') return 'lead.qualified';
  if (input.signupStep === 'contact') return 'lead.created';

  switch (input.currentStage) {
    case 'pre_signup':
    case 'contact_captured':
      return input.cardCreated ? 'lead.created' : 'lead.created';
    case 'plan_selected':
      return 'lead.qualified';
    case 'trial_started':
      return 'trial.started';
    case 'activation_prepared':
    case 'onboarding_in_progress':
    case 'onboarding_kickoff':
    case 'onboarding_active':
      return 'onboarding.started';
    default:
      return null;
  }
}

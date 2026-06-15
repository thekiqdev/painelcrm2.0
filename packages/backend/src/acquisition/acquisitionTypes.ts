export type AcquisitionLeadStage =
  | 'pre_signup'
  | 'contact_captured'
  | 'qualified'
  | 'plan_selected'
  | 'checkout_started'
  | 'checkout_abandoned'
  | 'activation_prepared'
  | 'trial_started'
  | 'onboarding_in_progress'
  | 'converted'
  | 'onboarding_kickoff'
  | 'onboarding_active';

export type ActivationScore = 'low' | 'medium' | 'high' | 'at_risk';

export type ActivationEventType =
  | 'signup_started'
  | 'checkout_started'
  | 'checkout_completed'
  | 'trial_started'
  | 'first_login'
  | 'first_message'
  | 'first_team_member'
  | 'onboarding_completed';

export type AcquisitionLeadRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  source: string | null;
  campaign: string | null;
  utm_json: Record<string, unknown>;
  selected_plan_id: string | null;
  current_stage: AcquisitionLeadStage;
  activation_score: ActivationScore;
  abandoned_at: string | null;
  converted_at: string | null;
  tenant_id: string | null;
  correlation_id: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateAcquisitionLeadInput = {
  name?: string;
  email: string;
  phone?: string;
  source?: string;
  campaign?: string;
  utm?: Record<string, unknown>;
  selectedPlanId?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
  stage?: AcquisitionLeadStage;
};

export type RecoveryEligibility = {
  eligible: boolean;
  reason: string;
  suppressed: boolean;
  cooldownHoursRemaining?: number;
};

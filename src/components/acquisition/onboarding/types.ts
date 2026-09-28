export type AcquisitionOnboardingStepId = 'lead' | 'plan' | 'conversion' | 'onboarding';

export type PlanIntervalPrice = {
  billing_interval: string;
  price_per_user_cents: number;
};

export type PublicAcquisitionPlan = {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  price_cents: number;
  is_free?: boolean;
  free_access_days?: number | null;
  trial_days?: number | null;
  is_default?: boolean;
  plan_type?: string;
  billing_interval?: string;
  max_users?: number | null;
  interval_prices?: PlanIntervalPrice[];
};

/** Estado local até conversão — sem tenant, sem empresa. */
export type AcquisitionSignupFormState = {
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  signup_password: string;
  signup_password_confirm: string;
  plan_id: string;
  users_count: number;
};

export const INITIAL_SIGNUP_FORM: AcquisitionSignupFormState = {
  lead_name: '',
  lead_email: '',
  lead_phone: '',
  signup_password: '',
  signup_password_confirm: '',
  plan_id: '',
  users_count: 1,
};

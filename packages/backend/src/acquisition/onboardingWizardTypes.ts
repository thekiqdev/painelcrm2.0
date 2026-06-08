export type OnboardingWizardStepId = 'provision' | 'company' | 'users' | 'whatsapp' | 'completed';

export type OnboardingWizardStatePayload = {
  onboarding_state: 'active' | 'completed';
  current_step: OnboardingWizardStepId;
  completed_steps: OnboardingWizardStepId[];
  activation_progress: number;
  step_data: {
    company?: {
      company_name?: string;
      slug?: string;
      logo_light_url?: string | null;
      logo_dark_url?: string | null;
      workspace_name?: string;
    };
    users?: {
      members: Array<{ email: string; full_name: string; role: string; phone?: string | null }>;
    };
    whatsapp?: {
      instance_id?: string;
      connection_name?: string;
      connected_at?: string;
      connected_phone?: string | null;
      profile_name?: string | null;
      skipped?: boolean;
    };
  };
};

export const WIZARD_STEP_ORDER: OnboardingWizardStepId[] = ['company', 'users', 'whatsapp'];

export function isTeamStepEnabled(usersCount: number | null | undefined): boolean {
  return (usersCount ?? 1) > 1;
}

export function wizardProgressPercent(
  completed: OnboardingWizardStepId[],
  usersCount?: number | null,
): number {
  const order = isTeamStepEnabled(usersCount)
    ? WIZARD_STEP_ORDER
    : (['company', 'whatsapp'] as OnboardingWizardStepId[]);
  const done = order.filter((s) => completed.includes(s)).length;
  return Math.round((done / order.length) * 100);
}

export function nextWizardStep(
  current: OnboardingWizardStepId,
  usersCount?: number | null,
): OnboardingWizardStepId {
  if (current === 'provision') return 'company';
  const idx = WIZARD_STEP_ORDER.indexOf(current as (typeof WIZARD_STEP_ORDER)[number]);
  if (idx < 0) return 'company';
  if (idx >= WIZARD_STEP_ORDER.length - 1) return 'completed';
  let next = WIZARD_STEP_ORDER[idx + 1]!;
  if (next === 'users' && !isTeamStepEnabled(usersCount)) {
    next = 'whatsapp';
  }
  return next;
}

export function normalizeWizardCurrentStep(
  current: OnboardingWizardStepId,
  usersCount?: number | null,
): OnboardingWizardStepId {
  if (current === 'users' && !isTeamStepEnabled(usersCount)) return 'whatsapp';
  return current;
}

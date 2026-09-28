/**
 * E2.1 — Máquina de estados única do wizard /cadastro.
 * URL `step` é a fonte de verdade; estágio do lead é fallback.
 */

import { hasPlanId } from './acquisitionSignupResume';

export function isPendingSignupLeadEmail(email: string | null | undefined): boolean {
  const t = email?.trim().toLowerCase() ?? '';
  if (!t) return true;
  return t.includes('pending+') || t.includes('@signup.painelcrm.local');
}

export const SIGNUP_WIZARD_STEPS = [
  'identity',
  'verification',
  'admin',
  'plan',
  'conversion',
] as const;

/** Legado E2 — URLs antigas com step=credentials. */
export function normalizeSignupWizardStepParam(
  value: string | null | undefined,
): SignupWizardStep | null {
  const normalized = value?.trim() ?? '';
  if (normalized === 'credentials') return 'admin';
  return isSignupWizardStep(normalized) ? normalized : null;
}

export type SignupWizardStep = (typeof SIGNUP_WIZARD_STEPS)[number];

export const ACQUISITION_CAPTURE_NAME_PLACEHOLDER = 'Solicitante';

export type SignupWizardLeadSnapshot = {
  id?: string;
  name?: string | null;
  email?: string | null;
  selected_plan_id?: string | null;
  current_stage?: string | null;
};

export function isSignupWizardStep(value: string | null | undefined): value is SignupWizardStep {
  return SIGNUP_WIZARD_STEPS.includes(value as SignupWizardStep);
}

export function isPlaceholderLeadName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  return name.trim().toLowerCase() === ACQUISITION_CAPTURE_NAME_PLACEHOLDER.toLowerCase();
}

/** Índice visual do layout (lead | plan | conversion). */
export function layoutStepIndexFromWizard(wizardStep: SignupWizardStep): number {
  if (wizardStep === 'plan') return 1;
  if (wizardStep === 'conversion') return 2;
  return 0;
}

export function leadCaptureSubStepFromWizard(
  wizardStep: SignupWizardStep,
): 'identity' | 'verification' | 'admin' | null {
  if (wizardStep === 'identity' || wizardStep === 'verification' || wizardStep === 'admin') {
    return wizardStep;
  }
  return null;
}

export function buildCadastroSearchParams(input: {
  leadId?: string | null;
  step?: SignupWizardStep | null;
  planId?: string | null;
  users?: number | null;
}): string {
  const p = new URLSearchParams();
  const leadId = input.leadId?.trim();
  if (leadId) p.set('lead', leadId);
  if (input.step) p.set('step', input.step);
  const planId = input.planId?.trim();
  if (planId) p.set('plan', planId);
  if (typeof input.users === 'number' && Number.isFinite(input.users)) {
    p.set('users', String(input.users));
  }
  const q = p.toString();
  return q ? `?${q}` : '';
}

export function cadastroWizardPath(input: {
  leadId?: string | null;
  step?: SignupWizardStep | null;
  planId?: string | null;
  users?: number | null;
}): string {
  return `/cadastro${buildCadastroSearchParams(input)}`;
}

function leadNeedsPrincipalAdmin(lead: SignupWizardLeadSnapshot): boolean {
  const emailPending = isPendingSignupLeadEmail(lead.email);
  const namePending = isPlaceholderLeadName(lead.name);
  return emailPending || namePending;
}

function inferWizardStepFromLeadStage(
  lead: SignupWizardLeadSnapshot,
  planIdFromUrl?: string | null,
): SignupWizardStep {
  const stage = lead.current_stage;
  const planId = lead.selected_plan_id ?? planIdFromUrl ?? null;

  if (
    stage === 'plan_selected' ||
    stage === 'activation_prepared' ||
    stage === 'checkout_started'
  ) {
    return hasPlanId(planId) ? 'conversion' : 'plan';
  }

  if (stage === 'contact_captured' || stage === 'qualified') {
    return leadNeedsPrincipalAdmin(lead) ? 'admin' : 'plan';
  }

  if (lead.id) {
    return leadNeedsPrincipalAdmin(lead) ? 'admin' : 'verification';
  }

  return 'identity';
}

/**
 * Prioridade: 1) step da URL  2) estágio/dados do lead  3) identity
 */
export function resolveSignupWizardStep(
  urlStep: string | null | undefined,
  lead: SignupWizardLeadSnapshot | null | undefined,
  planIdFromUrl?: string | null,
): SignupWizardStep {
  const normalized = normalizeSignupWizardStepParam(urlStep);

  if (normalized) {
    if (normalized === 'conversion' && !hasPlanId(lead?.selected_plan_id ?? planIdFromUrl)) {
      return 'plan';
    }
    return normalized;
  }

  const rawStep = urlStep?.trim() ?? '';

  if (rawStep === 'plan') return 'plan';
  if (rawStep === 'conversion' || rawStep === 'activate') {
    return hasPlanId(lead?.selected_plan_id ?? planIdFromUrl) ? 'conversion' : 'plan';
  }

  if (lead?.id || lead?.current_stage) {
    return inferWizardStepFromLeadStage(lead, planIdFromUrl);
  }

  return 'identity';
}

export function wizardStepBackTarget(current: SignupWizardStep): SignupWizardStep | null {
  switch (current) {
    case 'verification':
      return 'identity';
    case 'admin':
      return 'verification';
    case 'plan':
      return 'admin';
    case 'conversion':
      return 'plan';
    default:
      return null;
  }
}

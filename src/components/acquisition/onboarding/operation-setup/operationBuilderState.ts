import { effectiveCheckoutTrialDays } from '@/lib/planCheckoutDisplay';
import { formatOnboardingActivationPrice, getOnboardingPlanPricing } from '../onboardingPricing';
import type { PublicAcquisitionPlan } from '../types';

export type OperationPreviewState = {
  usersCount: number;
  whatsappChannels: number;
  planName: string;
  trialLabel: string | null;
  afterActivationLabel: string | null;
  valueHint: string;
  automationsReady: number;
  aiStatus: 'preview' | 'online';
  workspaceStatus: 'preparing' | 'ready';
};

export function resolveMaxUsers(plan: PublicAcquisitionPlan | null): number {
  if (!plan) return 10;
  if (plan.plan_type === 'custom') return 50;
  if (plan.max_users != null && plan.max_users > 0) return plan.max_users;
  return 10;
}

export function clampUsersCount(count: number, plan: PublicAcquisitionPlan | null): number {
  const max = resolveMaxUsers(plan);
  return Math.min(max, Math.max(1, count));
}

export function buildOperationPreview(
  plan: PublicAcquisitionPlan | null,
  usersCount: number,
): OperationPreviewState {
  const users = clampUsersCount(usersCount, plan);
  const trialDays = plan ? effectiveCheckoutTrialDays(plan) : 0;
  const pricing = plan ? getOnboardingPlanPricing(plan, users) : null;

  const trialLabel =
    trialDays >= 1
      ? `${trialDays} ${trialDays === 1 ? 'dia' : 'dias'} para explorar`
      : pricing?.activationPeriodLabel ?? null;

  const afterActivationLabel = plan
    ? `Após ativação: ${formatOnboardingActivationPrice(plan, users)}`
    : null;

  return {
    usersCount: users,
    whatsappChannels: 1,
    planName: plan?.name ?? 'Workspace',
    trialLabel,
    afterActivationLabel,
    valueHint:
      users > 1
        ? 'Cada operador adiciona atendimento simultâneo e métricas individuais'
        : 'Estruture o tamanho da equipe — escale quando precisar',
    automationsReady: Math.min(3, 1 + Math.floor(users / 2)),
    aiStatus: 'preview',
    workspaceStatus: users >= 1 ? 'preparing' : 'preparing',
  };
}

/**
 * Prepara ativação trial sem provisionar tenant — sessão de onboarding operacional.
 */
import { pool } from '../utils/db.js';
import { isCheckoutTrialV1Enabled } from '../config/checkoutTrialFeatureFlags.js';
import { effectiveCheckoutTrialDays } from '../utils/checkoutTrialPlan.js';
import { normalizeWhatsappDigits } from '../services/userIdentityValidationService.js';
import { findAcquisitionLeadById, updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import { kickoffOnboarding } from './onboardingKickoffService.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { publishAcquisitionStageChanged } from './acquisitionOutbox.js';
import { logAcquisition } from './acquisitionLogger.js';
import {
  attachLeadSessionToken,
  createOnboardingSession,
} from './acquisitionOnboardingSessionService.js';
import { syncAcquisitionLeadToOpsKanban } from '../services/superadminOpsKanbanLeadService.js';
import { assertExtraTrialGrantAllowed } from './acquisitionContactIntelligenceService.js';
import { normalizeSessionAvatarInput } from './acquisitionSessionAvatarService.js';

export type PrepareTrialActivationInput = {
  acquisitionLeadId: string;
  usersCount?: number;
  correlationId?: string;
  grantExtraTrial?: boolean;
  avatarDataUrl?: string | null;
  avatarUrl?: string | null;
};

export type PrepareTrialActivationResult =
  | {
      ok: true;
      sessionToken: string;
      redirectPath: string;
      leadId: string;
    }
  | { ok: false; reason: string; code?: string };

function trialBlocked(lead: { metadata_json: Record<string, unknown> }): boolean {
  const tags = lead.metadata_json.operational_tags;
  if (!Array.isArray(tags)) return false;
  return tags.includes('trial_2x') && Boolean(lead.metadata_json.extra_trial_consumed_at);
}

export async function prepareAcquisitionTrialActivation(
  input: PrepareTrialActivationInput,
): Promise<PrepareTrialActivationResult> {
  if (!isCheckoutTrialV1Enabled()) {
    return {
      ok: false,
      reason: 'Trial no checkout está desligado no servidor (CHECKOUT_TRIAL_V1).',
      code: 'CHECKOUT_TRIAL_V1_DISABLED',
    };
  }

  const lead = await findAcquisitionLeadById(input.acquisitionLeadId);
  if (!lead) {
    return { ok: false, reason: 'Lead não encontrado.', code: 'LEAD_NOT_FOUND' };
  }
  if (lead.tenant_id) {
    return { ok: false, reason: 'Lead já convertido.', code: 'LEAD_ALREADY_CONVERTED' };
  }
  if (trialBlocked(lead)) {
    return {
      ok: false,
      reason: 'Período de avaliação adicional já utilizado para este contato.',
      code: 'TRIAL_BLOCKED',
    };
  }

  const planId = lead.selected_plan_id;
  if (!planId) {
    return { ok: false, reason: 'Plano não selecionado.', code: 'PLAN_REQUIRED' };
  }

  const whatsappDigits = normalizeWhatsappDigits(lead.phone ?? '');
  if (!whatsappDigits || whatsappDigits.length < 10) {
    return { ok: false, reason: 'WhatsApp inválido no lead.', code: 'INVALID_PHONE' };
  }

  const planRow = await pool.query<{
    trial_days: number | null;
    is_free: boolean;
    plan_type: string;
    free_access_days: number | null;
  }>(
    `SELECT trial_days, is_free, plan_type, free_access_days FROM plans WHERE id = $1 AND is_active = true`,
    [planId],
  );
  if (planRow.rows.length === 0) {
    return { ok: false, reason: 'Plano inválido.', code: 'PLAN_NOT_FOUND' };
  }
  const planMeta = planRow.rows[0]!;
  const trialDays = effectiveCheckoutTrialDays(planMeta);
  if (trialDays < 1 && !input.grantExtraTrial) {
    return { ok: false, reason: 'Plano sem período de avaliação.', code: 'PLAN_HAS_NO_TRIAL' };
  }

  const usersCount = input.usersCount ?? null;
  if (planMeta.plan_type === 'custom' && (usersCount == null || usersCount < 1)) {
    return { ok: false, reason: 'Informe a quantidade de usuários.', code: 'USERS_COUNT_REQUIRED' };
  }

  const tags = Array.isArray(lead.metadata_json.operational_tags)
    ? (lead.metadata_json.operational_tags as string[])
    : [];
  const extraEligible =
    input.grantExtraTrial ||
    tags.includes('extra_trial_elegivel') ||
    tags.includes('reativacao');

  if (extraEligible) {
    const check = await assertExtraTrialGrantAllowed(lead);
    if (!check.ok) {
      return { ok: false, reason: 'Trial adicional não disponível.', code: check.reason ?? 'TRIAL_BLOCKED' };
    }
  }

  const correlationId = input.correlationId ?? lead.correlation_id;
  const sessionAvatar = normalizeSessionAvatarInput({
    avatar_data_url: input.avatarDataUrl,
    avatar_url: input.avatarUrl,
  });
  const session = await createOnboardingSession({
    leadId: lead.id,
    intent: 'trial',
    planId,
    usersCount,
    correlationId,
    metadata: {
      extra_trial_prepared: extraEligible,
      trial_days_plan: trialDays,
      ...(sessionAvatar ? { avatar: sessionAvatar } : {}),
    },
  });

  if (!session) {
    return {
      ok: false,
      reason: 'Sessão de onboarding indisponível. Execute a migration 262.',
      code: 'SESSION_TABLE_MISSING',
    };
  }

  const previousStage = lead.current_stage;
  const updatedLead =
    (await updateAcquisitionLeadStage(lead.id, 'onboarding_in_progress', {
      metadata: {
        activation: 'trial_prepared',
        activation_prepared_at: new Date().toISOString(),
        operational_tags: extraEligible
          ? [...tags.filter((t) => t !== 'extra_trial_elegivel'), 'onboarding_iniciado', 'reativacao']
          : [...tags, 'onboarding_iniciado'],
      },
    })) ?? lead;

  await attachLeadSessionToken(lead.id, session.session_token);

  await trackActivationEvent({
    acquisitionLeadId: lead.id,
    eventType: 'checkout_started',
    correlationId,
    metadata: { plan_id: planId, intent: 'trial', session_id: session.id },
  });

  void publishAcquisitionStageChanged(updatedLead, previousStage);
  void syncAcquisitionLeadToOpsKanban({
    acquisitionLeadId: lead.id,
    correlationId,
    columnNameOverride: 'Onboarding incompleto',
    timelineType: 'activation_prepared',
  });

  await kickoffOnboarding({
    lead: updatedLead,
    correlationId,
    trigger: 'conversion',
    tenantId: null,
  });

  logAcquisition('trial_activation_prepared', {
    acquisition_lead_id: lead.id,
    session_token: session.session_token,
    correlation_id: correlationId,
    deferred_provisioning: true,
  });

  const redirectPath = `/onboarding/acquisition?session=${encodeURIComponent(session.session_token)}`;

  return {
    ok: true,
    sessionToken: session.session_token,
    redirectPath,
    leadId: lead.id,
  };
}

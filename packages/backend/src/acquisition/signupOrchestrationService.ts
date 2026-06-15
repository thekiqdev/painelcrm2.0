import { randomUUID } from 'crypto';
import { pool } from '../utils/db.js';
import { runWithRequestContext } from '../context/requestContext.js';
import {
  isAcquisitionPreSignupEnabled,
  isAcquisitionSignupFlowEnabled,
  isAcquisitionTrialFlowEnabled,
} from './acquisitionFlags.js';
import { insertAcquisitionLead, updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import { resolveAcquisitionContact } from './acquisitionContactIntelligenceService.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { refreshActivationScoreForLead } from './activationScoreService.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import {
  publishAcquisitionLeadCreated,
  publishAcquisitionSignupStarted,
  publishAcquisitionStageChanged,
} from './acquisitionOutbox.js';
import { logAcquisition, logSignup } from './acquisitionLogger.js';
import type { AcquisitionLeadRow, CreateAcquisitionLeadInput } from './acquisitionTypes.js';
import { resolveEffectiveSignupEntryMode } from '../platform/platformRuntimeConfig.js';
import {
  buildExclusiveSignupInactivePayload,
  isExclusiveSignupFlowActive,
} from '../platform/exclusiveSignupFlowGate.js';

export async function createPreSignupLead(
  input: CreateAcquisitionLeadInput,
): Promise<{ ok: boolean; lead?: AcquisitionLeadRow; reason?: string }> {
  const [preSignup, signupFlow, trialFlow] = await Promise.all([
    isAcquisitionPreSignupEnabled(),
    isAcquisitionSignupFlowEnabled(),
    isAcquisitionTrialFlowEnabled(),
  ]);
  if (!preSignup && !signupFlow && !trialFlow) {
    return { ok: false, reason: 'acquisition_leads_disabled' };
  }

  return runWithRequestContext({ correlationId: input.correlationId }, async () => {
    const lead = await insertAcquisitionLead({
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: input.source ?? 'web',
      campaign: input.campaign,
      utm: input.utm,
      selectedPlanId: input.selectedPlanId,
      correlationId: input.correlationId,
      metadata: input.metadata,
      stage: input.stage ?? 'contact_captured',
    });

    if (!lead) return { ok: false, reason: 'table_unavailable' };

    logAcquisition('lead_created', {
      acquisition_lead_id: lead.id,
      email: lead.email,
      source: lead.source,
      correlation_id: input.correlationId,
    });

    await trackActivationEvent({
      acquisitionLeadId: lead.id,
      eventType: 'signup_started',
      correlationId: input.correlationId,
    });

    await refreshActivationScoreForLead(lead);
    void publishAcquisitionLeadCreated(lead);
    return { ok: true, lead };
  });
}

export async function orchestrateSignupStep(input: {
  leadId?: string;
  name?: string;
  email: string;
  phone?: string;
  planId?: string;
  step: 'contact' | 'plan' | 'checkout';
  correlationId: string;
  utm?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  lead?: AcquisitionLeadRow;
  nextPath?: string;
  reason?: string;
  contact_action?: string;
  contact_message?: string;
}> {
  if (!(await isExclusiveSignupFlowActive())) {
    const denial = buildExclusiveSignupInactivePayload();
    return {
      ok: false,
      reason: denial.code,
      nextPath: denial.fallback_path,
      contact_message: denial.error,
    };
  }

  let lead: AcquisitionLeadRow | null = null;
  let contactAction: string | undefined;
  let contactMessage: string | undefined;
  let contactResumePath: string | undefined;

  if (input.step === 'contact' && input.email) {
    const resolved = await resolveAcquisitionContact({
      name: input.name,
      email: input.email,
      phone: input.phone,
      leadId: input.leadId,
      correlationId: input.correlationId,
      source: 'web',
    });
    contactAction = resolved.action;
    contactMessage = resolved.message;
    contactResumePath = resolved.resume_path;
    lead = resolved.lead;

    if (resolved.action === 'login_required') {
      return {
        ok: false,
        reason: 'login_required',
        lead: lead ?? undefined,
        nextPath: '/login',
        contact_action: contactAction,
        contact_message: contactMessage,
      };
    }
    if (resolved.action === 'trial_blocked') {
      return {
        ok: false,
        reason: 'trial_blocked',
        lead: lead ?? undefined,
        contact_action: contactAction,
        contact_message: contactMessage,
      };
    }
  } else if (input.leadId) {
    const { findAcquisitionLeadById } = await import('./acquisitionLeadRepository.js');
    lead = await findAcquisitionLeadById(input.leadId);
  }

  if (!lead) {
    const created = await createPreSignupLead({
      name: input.name,
      email: input.email,
      phone: input.phone,
      correlationId: input.correlationId,
      utm: input.utm,
      selectedPlanId: input.planId,
      stage: 'contact_captured',
    });
    if (!created.ok || !created.lead) return { ok: false, reason: created.reason };
    lead = created.lead;
  }

  const previousStage = lead.current_stage;
  const stage =
    input.step === 'plan'
      ? 'plan_selected'
      : input.step === 'checkout'
        ? 'checkout_started'
        : input.step === 'contact' && lead.current_stage === 'qualified'
          ? 'qualified'
          : 'contact_captured';

  lead =
    (await updateAcquisitionLeadStage(lead.id, stage, {
      selectedPlanId: input.planId ?? lead.selected_plan_id,
      metadata: { last_step: input.step },
    })) ?? lead;

  logSignup('step_complete', {
    acquisition_lead_id: lead.id,
    step: input.step,
    stage,
    correlation_id: input.correlationId,
  });

  await trackActivationEvent({
    acquisitionLeadId: lead.id,
    eventType: input.step === 'checkout' ? 'checkout_started' : 'signup_started',
    correlationId: input.correlationId,
    metadata: { step: input.step },
  });

  await startWorkflow({
    workflowKey: 'acquisition.signup.started',
    correlationId: input.correlationId,
    payload: { acquisition_lead_id: lead.id, step: input.step },
    triggerEventKey: 'acquisition.signup.started',
    idempotencyKey: `signup:${lead.id}:${input.step}`,
  });

  void publishAcquisitionSignupStarted(lead, input.step);
  void publishAcquisitionStageChanged(lead, previousStage);

  await refreshActivationScoreForLead(lead);

  const entryMode = await resolveEffectiveSignupEntryMode();
  const usersQ =
    input.utm && typeof input.utm === 'object' && 'users_count' in input.utm
      ? `&users=${encodeURIComponent(String((input.utm as { users_count?: number }).users_count ?? ''))}`
      : '';

  const nextPath =
    input.step === 'contact' &&
      contactResumePath &&
      (contactAction === 'continue_lead' || contactAction === 'reactivation_eligible')
      ? contactResumePath
      : input.step === 'checkout'
        ? entryMode === 'acquisition_flow'
          ? `/cadastro?lead=${lead.id}&step=conversion${lead.selected_plan_id ? `&plan=${lead.selected_plan_id}` : ''}${usersQ}`
          : `/checkout${lead.selected_plan_id ? `?plan=${lead.selected_plan_id}&lead=${lead.id}` : `?lead=${lead.id}`}`
        : input.step === 'plan'
          ? `/cadastro?lead=${lead.id}&step=plan`
          : `/cadastro?lead=${lead.id}&step=admin`;

  return {
    ok: true,
    lead,
    nextPath,
    contact_action: contactAction,
    contact_message: contactMessage,
  };
}

export async function resolveDefaultTrialPlanId(): Promise<string | null> {
  const r = await pool.query<{ id: string }>(
    `SELECT id FROM plans
     WHERE is_active = true AND is_free = true AND free_access_days IS NOT NULL AND free_access_days >= 1
     ORDER BY sort_order NULLS LAST, created_at ASC
     LIMIT 1`,
  );
  return r.rows[0]?.id ?? null;
}

export function newAcquisitionCorrelationId(): string {
  return randomUUID();
}

import { runWithRequestContext } from '../context/requestContext.js';
import { isAcquisitionTrialFlowEnabled } from './acquisitionFlags.js';
import { createPreSignupLead, resolveDefaultTrialPlanId } from './signupOrchestrationService.js';
import { updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { refreshActivationScoreForLead } from './activationScoreService.js';
import { kickoffOnboarding } from './onboardingKickoffService.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import { publishAcquisitionStageChanged } from './acquisitionOutbox.js';
import { logTrial } from './acquisitionLogger.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';

export type TesteGratisInput = {
  name: string;
  email: string;
  phone: string;
  correlationId: string;
  planId?: string;
  source?: string;
  campaign?: string;
  utm?: Record<string, unknown>;
};

export type TesteGratisResult = {
  ok: boolean;
  reason?: string;
  lead?: AcquisitionLeadRow;
  trialPlanId?: string | null;
  checkoutPath?: string;
  shadow?: boolean;
};

/**
 * /teste-gratis foundation — cria lead, registra trial_started, kickoff onboarding.
 * NÃO cria tenant; reutiliza checkout/register legado via redirect.
 */
export async function orchestrateTesteGratis(input: TesteGratisInput): Promise<TesteGratisResult> {
  const enabled = await isAcquisitionTrialFlowEnabled();
  if (!enabled) {
    return { ok: false, reason: 'trial_flow_v1_off', checkoutPath: '/checkout' };
  }

  return runWithRequestContext({ correlationId: input.correlationId }, async () => {
    const trialPlanId = input.planId ?? (await resolveDefaultTrialPlanId());

    const created = await createPreSignupLead({
      name: input.name,
      email: input.email,
      phone: input.phone,
      source: input.source ?? 'teste-gratis',
      campaign: input.campaign,
      utm: input.utm,
      selectedPlanId: trialPlanId ?? undefined,
      correlationId: input.correlationId,
      metadata: { flow: 'teste-gratis' },
      stage: 'contact_captured',
    });

    if (!created.ok || !created.lead) {
      return { ok: false, reason: created.reason };
    }

    const previousStage = created.lead.current_stage;
    let lead =
      (await updateAcquisitionLeadStage(created.lead.id, 'trial_started', {
        selectedPlanId: trialPlanId,
        metadata: { trial_foundation: true },
      })) ?? created.lead;

    void publishAcquisitionStageChanged(lead, previousStage);

    logTrial('started', {
      acquisition_lead_id: lead.id,
      plan_id: trialPlanId,
      correlation_id: input.correlationId,
    });

    await trackActivationEvent({
      acquisitionLeadId: lead.id,
      eventType: 'trial_started',
      correlationId: input.correlationId,
      metadata: { plan_id: trialPlanId, source: 'teste-gratis' },
    });

    await startWorkflow({
      workflowKey: 'acquisition.trial.recovery',
      correlationId: input.correlationId,
      payload: { acquisition_lead_id: lead.id, phase: 'trial_started' },
      triggerEventKey: 'onboarding.trial.started',
      idempotencyKey: `trial:${lead.id}`,
    });

    await kickoffOnboarding({
      lead,
      correlationId: input.correlationId,
      trigger: 'trial',
    });

    const score = await refreshActivationScoreForLead(lead);
    lead = { ...lead, activation_score: score };

    const checkoutPath = trialPlanId
      ? `/checkout?plan=${trialPlanId}&lead=${lead.id}&source=teste-gratis`
      : `/checkout?lead=${lead.id}&source=teste-gratis`;

    return {
      ok: true,
      lead,
      trialPlanId,
      checkoutPath,
      shadow: true,
    };
  });
}

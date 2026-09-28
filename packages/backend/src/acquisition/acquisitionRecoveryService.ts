import { scheduleAutomationJob } from '../automation/automationJobRepository.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import { publishAcquisitionCheckoutAbandoned, publishAcquisitionStageChanged } from './acquisitionOutbox.js';
import { isAcquisitionRecoveryEnabled } from './acquisitionFlags.js';
import { findAcquisitionLeadById, updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { logRecovery } from './acquisitionLogger.js';
import type { AcquisitionLeadRow, RecoveryEligibility } from './acquisitionTypes.js';

const RECOVERY_COOLDOWN_HOURS = Math.max(1, parseInt(process.env.ACQUISITION_RECOVERY_COOLDOWN_HOURS || '24', 10));

export function evaluateRecoveryEligibility(lead: AcquisitionLeadRow): RecoveryEligibility {
  if (lead.converted_at) {
    return { eligible: false, reason: 'already_converted', suppressed: true };
  }

  const suppressed = Boolean(lead.metadata_json?.recovery_suppressed);
  if (suppressed) {
    return { eligible: false, reason: 'suppressed', suppressed: true };
  }

  if (!lead.abandoned_at) {
    return { eligible: false, reason: 'not_abandoned', suppressed: false };
  }

  const lastRecoveryAt = lead.metadata_json?.last_recovery_at as string | undefined;
  if (lastRecoveryAt) {
    const elapsedMs = Date.now() - new Date(lastRecoveryAt).getTime();
    const cooldownMs = RECOVERY_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (elapsedMs < cooldownMs) {
      return {
        eligible: false,
        reason: 'cooldown',
        suppressed: false,
        cooldownHoursRemaining: Math.ceil((cooldownMs - elapsedMs) / 3_600_000),
      };
    }
  }

  const ineligibleStages = ['pre_signup', 'contact_captured'];
  if (ineligibleStages.includes(lead.current_stage)) {
    return { eligible: false, reason: 'stage_not_eligible', suppressed: false };
  }

  const eligibleStages = ['checkout_abandoned', 'qualified', 'plan_selected', 'checkout_started', 'trial_started'];
  if (!eligibleStages.includes(lead.current_stage)) {
    return { eligible: false, reason: 'stage_not_eligible', suppressed: false };
  }

  return { eligible: true, reason: 'eligible', suppressed: false };
}

export async function markAcquisitionAbandoned(input: {
  leadId: string;
  correlationId: string;
  stage?: 'checkout_abandoned';
}): Promise<{ ok: boolean; eligibility?: RecoveryEligibility }> {
  const enabled = await isAcquisitionRecoveryEnabled();
  const lead = await findAcquisitionLeadById(input.leadId);
  if (!lead) return { ok: false };

  const previousStage = lead.current_stage;
  const updated = await updateAcquisitionLeadStage(input.leadId, input.stage ?? 'checkout_abandoned', {
    abandonedAt: new Date(),
    metadata: { abandoned_correlation_id: input.correlationId },
  });
  if (!updated) return { ok: false };

  void publishAcquisitionStageChanged(updated, previousStage);
  void publishAcquisitionCheckoutAbandoned(updated);

  logRecovery('abandoned', {
    acquisition_lead_id: input.leadId,
    stage: updated.current_stage,
    correlation_id: input.correlationId,
  });

  await trackActivationEvent({
    acquisitionLeadId: input.leadId,
    eventType: 'checkout_started',
    correlationId: input.correlationId,
    metadata: { abandoned: true },
  });

  if (!enabled) return { ok: true };

  const eligibility = evaluateRecoveryEligibility(updated);
  if (eligibility.eligible) {
    await scheduleRecoveryForLead(updated, input.correlationId);
  }

  return { ok: true, eligibility };
}

export async function scheduleRecoveryForLead(
  lead: AcquisitionLeadRow,
  correlationId: string,
): Promise<void> {
  const enabled = await isAcquisitionRecoveryEnabled();
  if (!enabled) return;

  const eligibility = evaluateRecoveryEligibility(lead);
  if (!eligibility.eligible) {
    logRecovery('schedule_skipped', {
      acquisition_lead_id: lead.id,
      reason: eligibility.reason,
    });
    return;
  }

  const workflowKey =
    lead.current_stage === 'checkout_abandoned'
      ? 'acquisition.checkout.abandoned'
      : 'acquisition.trial.recovery';

  await startWorkflow({
    workflowKey,
    correlationId,
    payload: {
      acquisition_lead_id: lead.id,
      email: lead.email,
      stage: lead.current_stage,
    },
    triggerEventKey: workflowKey,
    idempotencyKey: `recovery:${lead.id}:${workflowKey}`,
  });

  const delayMs = RECOVERY_COOLDOWN_HOURS * 60 * 60 * 1000;
  await scheduleAutomationJob({
    jobKey: `recovery:${workflowKey}`,
    tenantId: lead.tenant_id,
    correlationId,
    scheduledFor: new Date(Date.now() + delayMs),
    payload: { acquisition_lead_id: lead.id, workflow_key: workflowKey },
    metadata: { throttled: true, cooldown_hours: RECOVERY_COOLDOWN_HOURS },
    shadowMode: true,
  });

  await updateAcquisitionLeadStage(lead.id, lead.current_stage, {
    metadata: { last_recovery_at: new Date().toISOString(), recovery_workflow: workflowKey },
  });

  logRecovery('scheduled', {
    acquisition_lead_id: lead.id,
    workflow_key: workflowKey,
    correlation_id: correlationId,
  });
}

export async function suppressRecoveryForLead(leadId: string): Promise<void> {
  await updateAcquisitionLeadStage(leadId, (await findAcquisitionLeadById(leadId))?.current_stage ?? 'checkout_abandoned', {
    metadata: { recovery_suppressed: true },
  });
  logRecovery('suppressed', { acquisition_lead_id: leadId });
}

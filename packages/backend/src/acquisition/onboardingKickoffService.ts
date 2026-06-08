import { sendTransactionalMessage } from '../communication/channelProviderGateway/channelProviderGateway.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import { isAcquisitionOnboardingKickoffEnabled } from './acquisitionFlags.js';
import { updateAcquisitionLeadStage } from './acquisitionLeadRepository.js';
import { trackActivationEvent } from './activationTrackingService.js';
import { refreshActivationScoreForLead } from './activationScoreService.js';
import { logOnboarding } from './acquisitionLogger.js';
import type { AcquisitionLeadRow } from './acquisitionTypes.js';

export type OnboardingKickoffTrigger = 'signup' | 'trial' | 'conversion';

export async function kickoffOnboarding(input: {
  lead: AcquisitionLeadRow;
  correlationId: string;
  trigger: OnboardingKickoffTrigger;
  tenantId?: string | null;
}): Promise<{ kickedOff: boolean; shadow: boolean }> {
  const enabled = await isAcquisitionOnboardingKickoffEnabled({ tenantId: input.tenantId ?? null });
  if (!enabled) {
    logOnboarding('kickoff_skipped', { reason: 'onboarding_kickoff_v1_off', trigger: input.trigger });
    return { kickedOff: false, shadow: true };
  }

  const updated = await updateAcquisitionLeadStage(input.lead.id, 'onboarding_kickoff', {
    tenantId: input.tenantId ?? input.lead.tenant_id,
    metadata: { kickoff_trigger: input.trigger, kickoff_at: new Date().toISOString() },
  });

  await trackActivationEvent({
    acquisitionLeadId: input.lead.id,
    tenantId: input.tenantId ?? input.lead.tenant_id,
    eventType: 'trial_started',
    correlationId: input.correlationId,
    metadata: { trigger: input.trigger, kickoff: true },
  });

  await startWorkflow({
    workflowKey: 'onboarding.kickoff',
    correlationId: input.correlationId,
    tenantId: input.tenantId ?? input.lead.tenant_id,
    payload: {
      acquisition_lead_id: input.lead.id,
      trigger: input.trigger,
      email: input.lead.email,
    },
    triggerEventKey: 'onboarding.kickoff',
    idempotencyKey: `kickoff:${input.lead.id}:${input.trigger}`,
  });

  await startWorkflow({
    workflowKey: 'onboarding.first_access',
    correlationId: input.correlationId,
    tenantId: input.tenantId ?? input.lead.tenant_id,
    payload: { acquisition_lead_id: input.lead.id },
    triggerEventKey: 'onboarding.first_access',
    idempotencyKey: `first_access:${input.lead.id}`,
  });

  if (input.lead.phone || input.lead.email) {
    const channel = input.lead.phone ? 'whatsapp' : 'email';
    const recipient = input.lead.phone ?? input.lead.email;
    await sendTransactionalMessage({
      channel,
      messageIntent: 'onboarding',
      recipient,
      body: '[shadow] Bem-vindo ao PainelCRM — onboarding kickoff foundation',
      correlationId: input.correlationId,
      idempotencyKey: `comm:kickoff:${input.lead.id}`,
      tenantId: input.tenantId ?? input.lead.tenant_id,
      metadata: { trigger: input.trigger, foundation: true },
    });
  }

  if (updated) {
    await refreshActivationScoreForLead(updated);
  }

  logOnboarding('kickoff_complete', {
    acquisition_lead_id: input.lead.id,
    trigger: input.trigger,
    correlation_id: input.correlationId,
    shadow: true,
  });

  return { kickedOff: true, shadow: true };
}

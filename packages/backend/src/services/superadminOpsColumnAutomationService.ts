/**
 * Primeira automação operacional: coluna "Checkout abandonado".
 */
import { pool } from '../utils/db.js';
import { findAcquisitionLeadById } from '../acquisition/acquisitionLeadRepository.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import { scheduleAutomationJob } from '../automation/automationJobRepository.js';
import { sendMessage } from '../communication/channelProviderGateway/channelProviderGateway.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { buildOpsLeadGatewaySendInput } from './opsLeadGatewaySend.js';
import { findOpsKanbanCardForLead } from './superadminOpsKanbanLeadService.js';
import {
  appendOperationalTimelineForLead,
  TIMELINE_LABELS,
} from './superadminOpsLeadTimelineService.js';

const CHECKOUT_ABANDONED_COLUMN = 'Checkout abandonado';

export function isCheckoutAbandonedColumnName(name: string): boolean {
  return name.trim().toLowerCase() === CHECKOUT_ABANDONED_COLUMN.toLowerCase();
}

export async function runOpsCheckoutAbandonedAutomation(input: {
  acquisitionLeadId: string;
  correlationId: string;
  cardId?: string;
  trigger: 'kanban_column_enter' | 'acquisition_event';
}): Promise<{ ok: boolean; reason?: string }> {
  const lead = await findAcquisitionLeadById(input.acquisitionLeadId);
  if (!lead) return { ok: false, reason: 'lead_not_found' };

  const cardRef =
    input.cardId != null
      ? { cardId: input.cardId }
      : await findOpsKanbanCardForLead(lead.id);

  const workflowResult = await startWorkflow({
    workflowKey: 'acquisition.checkout.abandoned',
    correlationId: input.correlationId,
    tenantId: null,
    payload: {
      acquisition_lead_id: lead.id,
      trigger: input.trigger,
      card_id: cardRef && 'cardId' in cardRef ? cardRef.cardId : null,
    },
    triggerEventKey: 'acquisition.checkout.abandoned',
    idempotencyKey: `ops-checkout-abandoned:${lead.id}:${input.trigger}`,
  });

  const { id: jobId } = await scheduleAutomationJob({
    jobKey: 'ops:checkout_abandoned_recovery',
    tenantId: lead.tenant_id,
    correlationId: input.correlationId,
    scheduledFor: new Date(),
    payload: { acquisition_lead_id: lead.id, shadow: true },
    metadata: { column: CHECKOUT_ABANDONED_COLUMN, trigger: input.trigger },
    shadowMode: true,
  });

  const phone = (lead.phone || '').replace(/\D/g, '');
  let communicationOutcome = 'skipped_no_phone';
  if (phone.length >= 10) {
    const sendInput = await buildOpsLeadGatewaySendInput(
      {
        channel: 'whatsapp',
        messageIntent: 'transactional',
        recipient: phone,
        correlationId: input.correlationId,
        idempotencyKey: `ops-recovery-wa:${lead.id}:${input.trigger}`,
        body: 'Olá! Notamos que você não concluiu o cadastro no PainelCRM. Posso ajudar a finalizar?',
        metadata: {
          template_key: 'acquisition.checkout_abandoned.recovery',
          trigger: input.trigger,
        },
      },
      {
        opsTenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
        acquisitionLeadId: lead.id,
        targetTenantId: lead.tenant_id,
      },
    );
    const comm = await sendMessage(sendInput);
    communicationOutcome =
      comm.outcome === 'skipped' ? 'gateway_off' : comm.shadow ? 'whatsapp_shadow' : String(comm.outcome);
  }

  await appendOperationalTimelineForLead(lead.id, {
    type: 'checkout_abandoned_automation',
    label: TIMELINE_LABELS.checkout_abandoned_automation,
    trigger: input.trigger,
    workflow_key: 'acquisition.checkout.abandoned',
    workflow_execution: workflowResult.executionId ?? null,
    automation_job_id: jobId,
    communication: communicationOutcome,
    correlation_id: input.correlationId,
  });

  if (communicationOutcome === 'whatsapp_shadow' || communicationOutcome === 'sent') {
    await appendOperationalTimelineForLead(lead.id, {
      type: 'recovery_whatsapp',
      label: TIMELINE_LABELS.recovery_whatsapp,
      correlation_id: input.correlationId,
    });
  }

  return { ok: true };
}

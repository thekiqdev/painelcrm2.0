import type { OutboxEventRow } from '../outboxTypes.js';
import type { PassiveConsumerContext } from './types.js';
import { logOutbox } from '../outboxLogger.js';
import { syncAcquisitionLeadToOpsKanban } from '../../services/superadminOpsKanbanLeadService.js';
import { runOpsCheckoutAbandonedAutomation } from '../../services/superadminOpsColumnAutomationService.js';
import { appendOperationalTimelineForLead } from '../../services/superadminOpsLeadTimelineService.js';

function leadIdFromPayload(event: OutboxEventRow): string | null {
  const p = event.payload_json as Record<string, unknown> | null;
  const id = p?.acquisition_lead_id ?? p?.acquisitionLeadId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

async function syncLead(event: OutboxEventRow, signupStep?: string, columnOverride?: string): Promise<void> {
  const leadId = leadIdFromPayload(event);
  if (!leadId) {
    logOutbox('ops_kanban_skip', { event_id: event.id, reason: 'missing_lead_id' });
    return;
  }

  const timelineType =
    event.event_key === 'acquisition.lead.created'
      ? 'lead_created'
      : event.event_key === 'acquisition.signup.started'
        ? 'signup_started'
        : event.event_key === 'acquisition.stage.changed'
          ? 'stage_changed'
          : 'kanban_sync';

  const result = await syncAcquisitionLeadToOpsKanban({
    acquisitionLeadId: leadId,
    correlationId: event.correlation_id,
    signupStep,
    columnNameOverride: columnOverride,
    timelineType,
  });

  if (result.ok && event.event_key !== 'acquisition.checkout.abandoned') {
    await appendOperationalTimelineForLead(leadId, {
      type: 'activation_event',
      label: `Evento: ${event.event_key}`,
      event_key: event.event_key,
      correlation_id: event.correlation_id,
    });
  }

  logOutbox('ops_kanban_sync', {
    event_id: event.id,
    event_key: event.event_key,
    acquisition_lead_id: leadId,
    ok: result.ok,
    card_id: result.cardId ?? null,
    column_id: result.columnId ?? null,
    created: result.created ?? false,
    moved: result.moved ?? false,
    reason: result.reason ?? null,
  });
}

export async function handleOpsKanbanAcquisitionLeadCreated(
  event: OutboxEventRow,
  _ctx: PassiveConsumerContext,
): Promise<void> {
  await syncLead(event);
}

export async function handleOpsKanbanAcquisitionSignupStarted(
  event: OutboxEventRow,
  _ctx: PassiveConsumerContext,
): Promise<void> {
  const step = (event.payload_json as Record<string, unknown> | null)?.step;
  const signupStep = typeof step === 'string' ? step : undefined;
  await syncLead(event, signupStep);
}

export async function handleOpsKanbanAcquisitionStageChanged(
  event: OutboxEventRow,
  _ctx: PassiveConsumerContext,
): Promise<void> {
  await syncLead(event);
}

export async function handleOpsKanbanAcquisitionCheckoutAbandoned(
  event: OutboxEventRow,
  _ctx: PassiveConsumerContext,
): Promise<void> {
  const leadId = leadIdFromPayload(event);
  if (!leadId) return;

  await syncLead(event, undefined, 'Checkout abandonado');

  await runOpsCheckoutAbandonedAutomation({
    acquisitionLeadId: leadId,
    correlationId: event.correlation_id,
    trigger: 'acquisition_event',
  });
}

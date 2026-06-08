import type { OutboxEventRow } from '../outbox/outboxTypes.js';
import { hashPayloadForAudit } from '../outbox/idempotency.js';
import { logWorkflow } from './workflowRuntime/workflowLogger.js';
import { isWorkflowBridgeEnabled, isWorkflowPassiveConsumersEnabled } from './workflowRuntime/workflowFlags.js';
import { startWorkflow } from './orchestration/orchestrationService.js';
import { startSagaFoundation } from './sagas/sagaFoundation.js';

const EVENT_TO_WORKFLOW: Record<string, string> = {
  'ticket.created': 'support.ticket.created.shadow',
  'support.ticket.created': 'support.ticket.created.shadow',
  'invoice.created': 'billing.invoice.created.shadow',
  'billing.invoice.created': 'billing.invoice.created.shadow',
  'communication.message.received': 'communication.inbound.shadow',
  'communication.message.failed': 'communication.failed.shadow',
  'onboarding.trial.started': 'onboarding.trial.shadow',
  'onboarding.signup.started': 'onboarding.signup.shadow',
  'acquisition.signup.started': 'acquisition.signup.started.shadow',
  'acquisition.checkout.abandoned': 'acquisition.checkout.abandoned.shadow',
  'acquisition.trial.recovery': 'acquisition.trial.recovery.shadow',
  'onboarding.kickoff': 'onboarding.kickoff.shadow',
  'onboarding.first_access': 'onboarding.first_access.shadow',
  'signup.completed': 'onboarding.signup.completed.shadow',
  'workflow.started': 'workflow.echo.shadow',
};

export function workflowKeyForOutboxEvent(eventKey: string): string | null {
  return EVENT_TO_WORKFLOW[eventKey] ?? null;
}

/**
 * Connects outbox events to workflow runtime (shadow/passive only).
 */
export async function bridgeOutboxEventToWorkflow(
  event: OutboxEventRow,
  ctx: { shadow: boolean; workerId: string },
): Promise<{ bridged: boolean; workflowKey?: string }> {
  const bridgeOn = await isWorkflowBridgeEnabled({ tenantId: event.tenant_id });
  const passiveOn = await isWorkflowPassiveConsumersEnabled({ tenantId: event.tenant_id });

  if (!bridgeOn && !passiveOn) {
    return { bridged: false };
  }

  const workflowKey = workflowKeyForOutboxEvent(event.event_key);
  if (!workflowKey) {
    return { bridged: false };
  }

  logWorkflow('event_bridge', {
    event_id: event.id,
    event_key: event.event_key,
    workflow_key: workflowKey,
    correlation_id: event.correlation_id,
    tenant_id: event.tenant_id,
    shadow: ctx.shadow,
    worker_id: ctx.workerId,
    payload_hash: hashPayloadForAudit(event.payload_json),
  });

  const executionId = `bridge:${event.idempotency_key}`;

  await startWorkflow({
    workflowKey,
    correlationId: event.correlation_id,
    tenantId: event.tenant_id,
    payload: {
      outbox_event_id: event.id,
      event_key: event.event_key,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      payload: event.payload_json,
    },
    triggerEventKey: event.event_key,
    idempotencyKey: executionId,
  });

  if (bridgeOn) {
    await startSagaFoundation({
      sagaKey: `saga:${workflowKey}`,
      correlationId: event.correlation_id,
      tenantId: event.tenant_id,
      initialState: { event_key: event.event_key, bridged: true },
    });
  }

  return { bridged: true, workflowKey };
}

import type { OutboxEventRow } from '../../outbox/outboxTypes.js';
import type { PassiveConsumerContext } from '../../outbox/passiveConsumers/types.js';
import { hashPayloadForAudit } from '../../outbox/idempotency.js';
import { logOutbox } from '../../outbox/outboxLogger.js';
import { logPassiveConsumer } from '../workflowRuntime/workflowLogger.js';
import { bridgeOutboxEventToWorkflow } from '../outboxWorkflowBridge.js';
import { isWorkflowPassiveConsumersEnabled } from '../workflowRuntime/workflowFlags.js';

async function handlePassiveWorkflowEvent(
  subscriber: string,
  event: OutboxEventRow,
  ctx: PassiveConsumerContext,
): Promise<void> {
  logOutbox('passive_consume', {
    subscriber,
    event_id: event.id,
    event_key: event.event_key,
    correlation_id: event.correlation_id,
    tenant_id: event.tenant_id,
    shadow: ctx.shadow,
    payload_hash: hashPayloadForAudit(event.payload_json),
  });

  const workflowPassiveOn = await isWorkflowPassiveConsumersEnabled({ tenantId: event.tenant_id });
  if (!workflowPassiveOn) return;

  logPassiveConsumer('observe', {
    subscriber,
    event_key: event.event_key,
    event_id: event.id,
    correlation_id: event.correlation_id,
  });

  await bridgeOutboxEventToWorkflow(event, ctx);
}

export const workflowPassiveConsumerHandlers = {
  supportTicketCreated: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('support.ticket.created', e, ctx),
  communicationMessageReceived: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('communication.message.received', e, ctx),
  communicationMessageFailed: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('communication.message.failed', e, ctx),
  billingInvoiceCreated: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('billing.invoice.created', e, ctx),
  onboardingTrialStarted: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('onboarding.trial.started', e, ctx),
  onboardingSignupStarted: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('onboarding.signup.started', e, ctx),
  acquisitionSignupStarted: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('acquisition.signup.started', e, ctx),
  acquisitionCheckoutAbandoned: (e: OutboxEventRow, ctx: PassiveConsumerContext) =>
    handlePassiveWorkflowEvent('acquisition.checkout.abandoned', e, ctx),
};

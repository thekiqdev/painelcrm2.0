import type { PassiveConsumerRegistration } from './types.js';

import { logOutbox } from '../outboxLogger.js';

import { hashPayloadForAudit } from '../idempotency.js';

import type { OutboxEventRow } from '../outboxTypes.js';

import { workflowPassiveConsumerHandlers } from '../../automation/passiveConsumers/workflowPassiveHandlers.js';
import {
  handleOpsKanbanAcquisitionCheckoutAbandoned,
  handleOpsKanbanAcquisitionLeadCreated,
  handleOpsKanbanAcquisitionSignupStarted,
  handleOpsKanbanAcquisitionStageChanged,
} from './opsKanbanAcquisitionHandlers.js';



function passiveLog(event: OutboxEventRow, subscriber: string, shadow: boolean): Promise<void> {

  logOutbox('passive_consume', {

    subscriber,

    event_id: event.id,

    event_key: event.event_key,

    aggregate_type: event.aggregate_type,

    aggregate_id: event.aggregate_id,

    correlation_id: event.correlation_id,

    tenant_id: event.tenant_id,

    shadow,

    payload_hash: hashPayloadForAudit(event.payload_json),

  });

  return Promise.resolve();

}



const REGISTRY: PassiveConsumerRegistration[] = [

  {

    name: 'shadow.signup.completed',

    eventKeys: ['signup.completed'],

    handle: (e, ctx) => passiveLog(e, 'shadow.signup.completed', ctx.shadow),

  },

  {

    name: 'shadow.invoice.created',

    eventKeys: ['invoice.created'],

    handle: (e, ctx) => passiveLog(e, 'shadow.invoice.created', ctx.shadow),

  },

  {

    name: 'shadow.ticket.created',

    eventKeys: ['ticket.created'],

    handle: (e, ctx) => passiveLog(e, 'shadow.ticket.created', ctx.shadow),

  },

  {

    name: 'shadow.workflow.started',

    eventKeys: ['workflow.started'],

    handle: (e, ctx) => passiveLog(e, 'shadow.workflow.started', ctx.shadow),

  },

  {

    name: 'shadow.communication.message.sent',

    eventKeys: ['communication.message.sent'],

    handle: (e, ctx) => passiveLog(e, 'shadow.communication.message.sent', ctx.shadow),

  },

  {

    name: 'support.ticket.created',

    eventKeys: ['ticket.created', 'support.ticket.created'],

    handle: workflowPassiveConsumerHandlers.supportTicketCreated,

  },

  {

    name: 'communication.message.received',

    eventKeys: ['communication.message.received'],

    handle: workflowPassiveConsumerHandlers.communicationMessageReceived,

  },

  {

    name: 'communication.message.failed',

    eventKeys: ['communication.message.failed'],

    handle: workflowPassiveConsumerHandlers.communicationMessageFailed,

  },

  {

    name: 'billing.invoice.created',

    eventKeys: ['invoice.created', 'billing.invoice.created'],

    handle: workflowPassiveConsumerHandlers.billingInvoiceCreated,

  },

  {

    name: 'onboarding.trial.started',

    eventKeys: ['onboarding.trial.started'],

    handle: workflowPassiveConsumerHandlers.onboardingTrialStarted,

  },

  {

    name: 'onboarding.signup.started',

    eventKeys: ['onboarding.signup.started'],

    handle: workflowPassiveConsumerHandlers.onboardingSignupStarted,

  },

  {

    name: 'ops.kanban.acquisition.lead.created',

    eventKeys: ['acquisition.lead.created'],

    handle: handleOpsKanbanAcquisitionLeadCreated,

  },

  {

    name: 'ops.kanban.acquisition.signup.started',

    eventKeys: ['acquisition.signup.started'],

    handle: handleOpsKanbanAcquisitionSignupStarted,

  },

  {

    name: 'ops.kanban.acquisition.stage.changed',

    eventKeys: ['acquisition.stage.changed'],

    handle: handleOpsKanbanAcquisitionStageChanged,

  },

  {

    name: 'ops.kanban.acquisition.checkout.abandoned',

    eventKeys: ['acquisition.checkout.abandoned'],

    handle: handleOpsKanbanAcquisitionCheckoutAbandoned,

  },

  {

    name: 'workflow.bridge.acquisition.signup.started',

    eventKeys: ['acquisition.signup.started'],

    handle: workflowPassiveConsumerHandlers.acquisitionSignupStarted,

  },

  {

    name: 'workflow.bridge.acquisition.checkout.abandoned',

    eventKeys: ['acquisition.checkout.abandoned'],

    handle: workflowPassiveConsumerHandlers.acquisitionCheckoutAbandoned,

  },

];



export function listPassiveConsumers(): PassiveConsumerRegistration[] {

  return REGISTRY;

}



export function passiveConsumersForEvent(eventKey: string): PassiveConsumerRegistration[] {

  return REGISTRY.filter((r) => r.eventKeys === '*' || r.eventKeys.includes(eventKey));

}



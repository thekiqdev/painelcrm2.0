/**
 * Catálogo mínimo P0 — foundation apenas (consumers passivos).
 */
export const DOMAIN_EVENT_KEYS = [
  'signup.completed',
  'onboarding.signup.started',
  'onboarding.trial.started',
  'acquisition.lead.created',
  'acquisition.signup.started',
  'acquisition.stage.changed',
  'acquisition.checkout.abandoned',
  'acquisition.trial.recovery',
  'onboarding.kickoff',
  'onboarding.first_access',
  'invoice.created',
  'billing.invoice.created',
  'ticket.created',
  'support.ticket.created',
  'workflow.started',
  'communication.message.sent',
  'communication.message.received',
  'communication.message.delivered',
  'communication.message.read',
  'communication.message.failed',
] as const;

export type DomainEventKey = (typeof DOMAIN_EVENT_KEYS)[number];

const KEY_SET = new Set<string>(DOMAIN_EVENT_KEYS);

export function isDomainEventKey(key: string): key is DomainEventKey {
  return KEY_SET.has(key);
}

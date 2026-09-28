/**
 * Billing Engine V2 — Sprint 2.3D: resolve payload de notificação (puro).
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import type { NormalizedNotificationPayload } from '../internal-tools/billing-migration/billingShadow/types.js';

export function resolveProjectionNotification(
  context: BillingExecutionContext,
  grandTotal: number
): NormalizedNotificationPayload | null {
  if (grandTotal <= 0) return null;
  return {
    type: 'invoice_created',
    recipient: context.notifications.recipient,
    template: context.notifications.templates[0] ?? 'crm_invoice_charge',
    payload: {
      simulated: true,
      cycle_key: context.cycle,
      language: context.notifications.language,
      ...context.notifications.variables,
    },
  };
}

/**
 * Billing Platform — domain events (contracts only; no mandatory consumers).
 */

export const BILLING_PLATFORM_EVENT_TYPES = [
  'InvoiceGenerated',
  'InvoicePaid',
  'InvoiceExpired',
  'SubscriptionRenewed',
  'SubscriptionCancelled',
  'PlanChanged',
  'ChargeSucceeded',
  'ChargeFailed',
] as const;

export type BillingPlatformEventType = (typeof BILLING_PLATFORM_EVENT_TYPES)[number];

export type BillingPlatformEventPayload = {
  tenant_id: string;
  subscription_id?: string | null;
  invoice_id?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  occurred_at: string;
  metadata?: Record<string, unknown>;
};

export type BillingPlatformEvent<T extends BillingPlatformEventType = BillingPlatformEventType> = {
  id: string;
  type: T;
  payload: BillingPlatformEventPayload;
  correlation_id?: string | null;
};

export type BillingPlatformEventHandler<T extends BillingPlatformEventType = BillingPlatformEventType> = (
  event: BillingPlatformEvent<T>
) => void | Promise<void>;

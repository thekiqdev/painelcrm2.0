/**
 * Billing Engine 3.0 — [BILLING_ENGINE] structured logs.
 */
import { billingLog } from '../services/billingLogger.js';

export function logBillingEngine(
  event: string,
  payload: {
    tenant_id?: string;
    subscription_id?: string;
    correlation_id?: string;
    duration_ms?: number;
    approved?: boolean;
    code?: string;
  }
): void {
  billingLog('job', `[BILLING_ENGINE] ${event}`, payload);
}

/**
 * Billing Engine V2 — Sprint 3.1A: structured logs.
 */
import { billingLog } from '../services/billingLogger.js';

type LogPayload = Record<string, string | number | boolean | undefined | null>;

function sanitize(payload: LogPayload): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

export function logBillingObservability(
  tag: 'BILLING_METRICS' | 'BILLING_HEALTH' | 'BILLING_AUDIT' | 'BILLING_PERFORMANCE',
  event: string,
  payload: LogPayload = {}
): void {
  billingLog('job', `[${tag}] ${event}`, sanitize(payload));
}

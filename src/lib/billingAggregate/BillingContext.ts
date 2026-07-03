import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { BillingContext, BillingContextValidationResult } from './types';

/** Assinatura determinística do payload de entrada — espelha `financialEventStoreSignature`. */
export function billingContextSourceSignature(detail: CrmSubscriptionDetailPayload): string {
  const tl = detail.timeline
    .filter((r) => r.merge_source !== 'lifecycle')
    .map((r) => `${r.cycle_id}:${r.invoice_id}:${r.operational_state}:${r.due_date}`)
    .join('|');
  return `${detail.subscription.id}:${detail.subscription.status}:${detail.subscription.next_billing_date}:${detail.latest_invoice_id ?? ''}:${tl}`;
}

export function createBillingContext(
  source: CrmSubscriptionDetailPayload,
  todayYmd?: string
): BillingContext {
  return {
    source,
    todayYmd: todayYmd ?? new Date().toISOString().slice(0, 10),
    builtAt: new Date().toISOString(),
  };
}

export function validateBillingContext(context: BillingContext): BillingContextValidationResult {
  const { source } = context;
  if (!source?.subscription?.id?.trim()) {
    return { ok: false, reason: 'subscription.id is required' };
  }
  if (!Array.isArray(source.timeline)) {
    return { ok: false, reason: 'timeline must be an array' };
  }
  if (!Array.isArray(source.cycles_raw)) {
    return { ok: false, reason: 'cycles_raw must be an array' };
  }
  if (!Array.isArray(source.recent_jobs)) {
    return { ok: false, reason: 'recent_jobs must be an array' };
  }
  if (!context.todayYmd || !/^\d{4}-\d{2}-\d{2}$/.test(context.todayYmd)) {
    return { ok: false, reason: 'todayYmd must be YYYY-MM-DD' };
  }
  return { ok: true };
}

export function assertValidBillingContext(context: BillingContext): void {
  const result = validateBillingContext(context);
  if (!result.ok) {
    throw new Error(`Invalid BillingContext: ${result.reason}`);
  }
}

/** Snapshot profundo do source para garantir imutabilidade entre stages. */
export function snapshotBillingContextSource(source: CrmSubscriptionDetailPayload): string {
  return JSON.stringify(source);
}

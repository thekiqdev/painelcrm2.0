import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { BillingCycleMetadata, BillingCycleSnapshot } from './types';

export type BillingCycleRawSource = CrmSubscriptionDetailPayload['cycles_raw'][number];

const MAPPED_CYCLE_KEYS = new Set([
  'id',
  'subscription_id',
  'cycle_date',
  'period_start',
  'period_end',
  'status',
  'invoice_id',
  'job_id',
  'processed_at',
  'skipped_reason',
  'error_message',
]);

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractCycleMetadata(raw: Record<string, unknown>): BillingCycleMetadata {
  const metadata: BillingCycleMetadata = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!MAPPED_CYCLE_KEYS.has(key)) {
      metadata[key] = value;
    }
  }
  return metadata;
}

/**
 * Mapeia um item de `cycles_raw` → `BillingCycleSnapshot` (1:1).
 * Sprint 5.0-13: sem ordenação, filtro ou interpretação de status.
 */
export function mapCycleSnapshot(
  cycle: BillingCycleRawSource,
  subscriptionId: string
): BillingCycleSnapshot {
  const raw = cycle as Record<string, unknown>;
  return {
    id: cycle.id,
    subscriptionId: optionalString(raw.subscription_id) ?? subscriptionId,
    cycleDate: cycle.cycle_date,
    periodStart: cycle.period_start,
    periodEnd: cycle.period_end,
    status: cycle.status,
    invoiceId: cycle.invoice_id,
    jobId: cycle.job_id,
    processedAt: cycle.processed_at,
    skippedReason: cycle.skipped_reason,
    errorMessage: cycle.error_message,
    metadata: extractCycleMetadata(raw),
  };
}

/** Copia todos os ciclos preservando a ordem de `cycles_raw`. */
export function mapCyclesFromSource(
  cycles: BillingCycleRawSource[],
  subscriptionId: string
): BillingCycleSnapshot[] {
  return cycles.map((cycle) => mapCycleSnapshot(cycle, subscriptionId));
}

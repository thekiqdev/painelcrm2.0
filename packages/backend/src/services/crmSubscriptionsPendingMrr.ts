/**
 * MRR atual vs MRR após mudanças agendadas (metadata.pending_crm_contract).
 * Leitura pura — sem motor paralelo.
 */
import { normalizeCrmSubscriptionAmountToMonthlyCents } from './financialReportsSubscriptionProjection.js';
import { parseCrmPendingContractMetadata } from './crmSubscriptionContractRenewalOverlay.js';

export interface ActiveSubscriptionMrrInput {
  amount_cents: number;
  billing_interval: string;
  metadata: unknown;
}

export function computeMrrWithPendingChanges(rows: ActiveSubscriptionMrrInput[]): {
  mrr_cents: number;
  mrr_after_pending_cents: number;
  mrr_pending_delta_cents: number;
} {
  let mrr_cents = 0;
  let mrr_after_pending_cents = 0;
  for (const row of rows) {
    const interval = row.billing_interval || 'monthly';
    const cur = normalizeCrmSubscriptionAmountToMonthlyCents(row.amount_cents, interval);
    mrr_cents += cur;
    const pending = parseCrmPendingContractMetadata(row.metadata);
    if (pending) {
      mrr_after_pending_cents += normalizeCrmSubscriptionAmountToMonthlyCents(
        pending.amount_cents,
        pending.billing_interval
      );
    } else {
      mrr_after_pending_cents += cur;
    }
  }
  return {
    mrr_cents,
    mrr_after_pending_cents,
    mrr_pending_delta_cents: mrr_after_pending_cents - mrr_cents,
  };
}

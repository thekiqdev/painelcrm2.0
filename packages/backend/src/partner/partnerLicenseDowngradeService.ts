/**
 * M5-W License Sprint 3 — Partner reduz seats avulsas.
 * Imediato no pool; próximo ciclo menor; sem estorno do período já pago.
 */

import { getPartnerLicenseSummary } from './partnerLicenseService.js';
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import { computeWholesaleRecurringAmountCents } from './partnerWholesaleRecurringService.js';
import { syncPartnerWholesaleRecurringAmount } from './partnerWholesaleRecurringService.js';
import { PartnerAdminError } from './partnerErrors.js';

export const LICENSE_DOWNGRADE_QTY_MIN = 1;
export const LICENSE_DOWNGRADE_QTY_MAX = 500;

export type LicenseDowngradeQuote = {
  qty: number;
  max_qty: number;
  extra_seats: number;
  extra_seats_after: number;
  included_seats: number;
  purchased_after: number;
  used_seats: number;
  current_recurring_amount_cents: number | null;
  next_recurring_amount_cents: number | null;
  recurring_delta_cents: number | null;
  refund_cents: 0;
  policy: 'next_cycle_no_refund';
};

export function maxDowngradeQty(input: {
  extra_seats: number;
  purchased_seats: number;
  used_seats: number;
}): number {
  const extra = Math.max(0, Math.floor(input.extra_seats));
  const unused = Math.max(0, Math.floor(input.purchased_seats) - Math.floor(input.used_seats));
  return Math.min(extra, unused);
}

export async function quotePartnerLicenseDowngrade(
  partnerTenantId: string,
  qty: number
): Promise<LicenseDowngradeQuote> {
  const summary = await getPartnerLicenseSummary(partnerTenantId);
  const maxQty = maxDowngradeQty({
    extra_seats: summary.extra_seats,
    purchased_seats: summary.purchased_seats,
    used_seats: summary.used_seats,
  });
  const n = Math.trunc(Number(qty));
  if (!Number.isFinite(n) || n < LICENSE_DOWNGRADE_QTY_MIN || n > LICENSE_DOWNGRADE_QTY_MAX) {
    throw new PartnerAdminError(
      `qty deve ser inteiro entre ${LICENSE_DOWNGRADE_QTY_MIN} e ${LICENSE_DOWNGRADE_QTY_MAX}`,
      'DOWNGRADE_QTY_INVALID'
    );
  }
  if (n > maxQty) {
    throw new PartnerAdminError(
      maxQty === 0
        ? 'Não há licenças avulsas livres para reduzir (não pode ficar abaixo das usadas nem do pacote)'
        : `Máximo reduzível agora: ${maxQty} avulsa(s)`,
      'DOWNGRADE_EXCEEDS_AVAILABLE',
      409
    );
  }

  const extraAfter = summary.extra_seats - n;
  const current = summary.recurring_amount_cents;
  let next: number | null = null;
  if (summary.recurring_plan_price_cents != null) {
    next = computeWholesaleRecurringAmountCents({
      planPriceCents: summary.recurring_plan_price_cents,
      extraSeats: extraAfter,
      unitOverageCents: summary.topup_unit_price_cents,
    }).recurring_amount_cents;
  }

  return {
    qty: n,
    max_qty: maxQty,
    extra_seats: summary.extra_seats,
    extra_seats_after: extraAfter,
    included_seats: summary.included_seats,
    purchased_after: summary.purchased_seats - n,
    used_seats: summary.used_seats,
    current_recurring_amount_cents: current,
    next_recurring_amount_cents: next,
    recurring_delta_cents: current != null && next != null ? next - current : null,
    refund_cents: 0,
    policy: 'next_cycle_no_refund',
  };
}

export async function downgradePartnerLicenseExtras(input: {
  partnerTenantId: string;
  qty: number;
  actorUserId?: string | null;
}): Promise<{
  quote: LicenseDowngradeQuote;
  purchased_seats: number;
  extra_seats: number;
  ledger_id: string;
}> {
  const quote = await quotePartnerLicenseDowngrade(input.partnerTenantId, input.qty);
  const summary = await getPartnerLicenseSummary(input.partnerTenantId);

  const led = await applyPartnerLicenseDelta({
    partnerTenantId: input.partnerTenantId,
    deltaSeats: -quote.qty,
    reason: 'topup_downgrade',
    actorUserId: input.actorUserId ?? null,
    wholesalePlanId: summary.wholesale_plan_id,
    note: `Downgrade avulsas ×${quote.qty}`,
    metadata: {
      policy: quote.policy,
      refund_cents: 0,
      extra_seats_before: quote.extra_seats,
      extra_seats_after: quote.extra_seats_after,
      next_recurring_amount_cents: quote.next_recurring_amount_cents,
    },
  });

  await syncPartnerWholesaleRecurringAmount(input.partnerTenantId).catch((e) => {
    console.error('[DOWNGRADE] recurring sync failed', e);
  });

  const after = await getPartnerLicenseSummary(input.partnerTenantId);
  return {
    quote,
    purchased_seats: after.purchased_seats,
    extra_seats: after.extra_seats,
    ledger_id: led.ledgerId,
  };
}

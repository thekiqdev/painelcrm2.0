/**
 * Sprint M4 / M4.1 — liquidação automática de faturas SaaS com valor zero.
 * Idempotência forte: 1 billing = 1 ativação via activatePlanFromBilling.
 */
import { findActiveCommercialOverrideCandidates } from './tenantCommercialOverrideRepository.js';
import { pickBestCommercialOverride } from './tenantCommercialOverrideService.js';
import type {
  TenantCommercialBillingInterval,
  TenantCommercialOverrideType,
} from './tenantCommercialTypes.js';
import { pool } from '../utils/db.js';
import { getInvoiceById, updateInvoiceStatus } from '../services/invoiceService.js';
import { activatePlanFromBilling } from '../services/subscriptionService.js';
import { schedulePublishPlatformBillingPaymentConfirmed } from '../services/platformNotifications/platformBusinessNotifications.js';

export type ZeroAmountSettlementSource =
  | 'checkout'
  | 'renewal'
  | 'manual_charge'
  | 'waive_reactivation';

export type ZeroAmountSettlementSkipReason = 'already_paid' | 'already_activated';

const SETTLEABLE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

export type SettleZeroAmountBillingInput = {
  billingId: string;
  source: ZeroAmountSettlementSource;
  overrideType?: TenantCommercialOverrideType | string | null;
  commercialOverride?: boolean;
};

export type SettleZeroAmountBillingResult = {
  billingId: string;
  tenantId: string;
  settled: boolean;
  reason?: ZeroAmountSettlementSkipReason | 'settled';
  activated: boolean;
};

export function isZeroAmountCents(amountCents: number): boolean {
  return Math.round(amountCents) === 0;
}

function logZeroAmountSettlementSkip(
  billingId: string,
  reason: ZeroAmountSettlementSkipReason,
  extra?: Record<string, unknown>,
): void {
  console.info('[zero_amount_settlement_skip]', {
    billingId,
    reason,
    ...extra,
  });
}

async function mergeSettlementMetadata(
  billingId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE tenant_billing
     SET gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2`,
    [JSON.stringify(metadata), billingId],
  );
}

async function loadTenantActivationBillingId(tenantId: string): Promise<string | null> {
  const r = await pool.query<{ activated_billing_id: string | null }>(
    `SELECT activated_billing_id::text FROM tenants WHERE id = $1::uuid`,
    [tenantId],
  );
  return r.rows[0]?.activated_billing_id ?? null;
}

async function resolveActiveOverrideType(
  tenantId: string,
  planId: string,
  billingInterval: string,
): Promise<TenantCommercialOverrideType | null> {
  const candidates = await findActiveCommercialOverrideCandidates({
    tenantId,
    planId,
    billingInterval: billingInterval as TenantCommercialBillingInterval,
  });
  const best = pickBestCommercialOverride(candidates, planId, billingInterval);
  return best?.override_type ?? null;
}

/**
 * Liquida fatura com amount_cents = 0 e ativa o plano via activatePlanFromBilling (no máximo uma vez).
 */
export async function settleZeroAmountBilling(
  input: SettleZeroAmountBillingInput,
): Promise<SettleZeroAmountBillingResult> {
  const billing = await getInvoiceById(input.billingId);
  if (!billing) {
    throw new Error('Fatura não encontrada');
  }

  if (!isZeroAmountCents(billing.amount_cents)) {
    throw new Error('Liquidação automática só é permitida para faturas com valor zero');
  }

  const tenantId = billing.tenant_id;

  if (billing.status === 'paid') {
    logZeroAmountSettlementSkip(billing.id, 'already_paid', { tenantId, source: input.source });
    return {
      billingId: billing.id,
      tenantId,
      settled: false,
      reason: 'already_paid',
      activated: false,
    };
  }

  if (!SETTLEABLE_STATUSES.has(billing.status)) {
    throw new Error(`Fatura em status "${billing.status}" não pode ser liquidada automaticamente`);
  }

  const activatedBillingId = await loadTenantActivationBillingId(tenantId);
  if (activatedBillingId === billing.id) {
    logZeroAmountSettlementSkip(billing.id, 'already_activated', { tenantId, source: input.source });
    return {
      billingId: billing.id,
      tenantId,
      settled: false,
      reason: 'already_activated',
      activated: false,
    };
  }

  let overrideType = input.overrideType ?? null;
  if (overrideType == null && (input.commercialOverride ?? true)) {
    overrideType = await resolveActiveOverrideType(
      tenantId,
      billing.plan_id,
      billing.billing_interval,
    );
  }

  await mergeSettlementMetadata(billing.id, {
    settlement_source: 'zero_amount',
    commercial_override: input.commercialOverride ?? true,
    override_type: overrideType,
    settlement_trigger: input.source,
  });

  const paidAt = new Date();
  // payment_method CHECK só aceita PIX|BOLETO|CREDIT_CARD|null — liquidação zero fica em gateway_metadata/gateway_status
  await updateInvoiceStatus(billing.id, 'paid', paidAt, null, 'zero_amount_settled');
  schedulePublishPlatformBillingPaymentConfirmed(billing.id);

  console.info('[zero_amount_settlement]', {
    billingId: billing.id,
    tenantId,
    amountCents: 0,
    source: input.source,
    overrideType,
  });

  const activatedBillingIdAfterPaid = await loadTenantActivationBillingId(tenantId);
  if (activatedBillingIdAfterPaid === billing.id) {
    logZeroAmountSettlementSkip(billing.id, 'already_activated', {
      tenantId,
      source: input.source,
      phase: 'post_paid',
    });
    return {
      billingId: billing.id,
      tenantId,
      settled: true,
      reason: 'settled',
      activated: false,
    };
  }

  await activatePlanFromBilling(billing.id);

  return {
    billingId: billing.id,
    tenantId,
    settled: true,
    reason: 'settled',
    activated: true,
  };
}

export async function trySettleZeroAmountBillingIfEligible(
  input: SettleZeroAmountBillingInput & { amountCents: number },
): Promise<SettleZeroAmountBillingResult | null> {
  if (!isZeroAmountCents(input.amountCents)) return null;
  const { amountCents: _drop, ...rest } = input;
  return settleZeroAmountBilling(rest);
}

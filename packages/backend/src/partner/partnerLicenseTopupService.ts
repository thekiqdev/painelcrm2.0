/**
 * M5-W Sprint 3 — compra de licenças avulsas (one-shot) via Asaas Platform.
 */

import { pool } from '../utils/db.js';
import {
  createInvoice,
  getInvoiceById,
  type TenantBillingRow,
} from '../services/invoiceService.js';
import { getActiveConfig } from '../services/paymentGatewayConfigService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { hasTenantBillingPaymentAttemptsTable } from '../services/tenantBillingPaymentAttemptsService.js';
import { ensureSaasPlanCheckoutPaymentAttemptForSwitch } from '../services/saasPlanCheckoutPaymentAttemptService.js';
import { trySettleZeroAmountBillingIfEligible } from '../commercial/zeroAmountSettlementService.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import { PartnerAdminError } from './partnerErrors.js';
import { applyPartnerLicenseDelta } from './partnerLicenseLedgerService.js';
import { getPartnerDetail, resolveDefaultPlanId } from './partnerRepository.js';
import { getWholesalePlan } from './partnerWholesalePlanService.js';

export const LICENSE_TOPUP_PACKS: Record<string, number> = {
  '10': 10,
  '50': 50,
  '100': 100,
};

export const LICENSE_TOPUP_QTY_MIN = 1;
export const LICENSE_TOPUP_QTY_MAX = 500;

export type LicenseTopupQuote = {
  qty: number;
  unit_price_cents: number;
  amount_cents: number;
  price_source: 'wholesale_overage' | 'pool_unit_cost';
  wholesale_plan_id: string | null;
  wholesale_status: string;
};

export type LicenseTopupCheckoutResult = {
  billing: TenantBillingRow;
  quote: LicenseTopupQuote;
  paymentUrls?: {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    bankSlipDigitableLine?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  };
  settled?: boolean;
};

function paymentUrlsFromMeta(meta: unknown): LicenseTopupCheckoutResult['paymentUrls'] {
  const m = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  return {
    invoiceUrl: typeof m.invoiceUrl === 'string' ? m.invoiceUrl : undefined,
    bankSlipUrl: typeof m.bankSlipUrl === 'string' ? m.bankSlipUrl : undefined,
    bankSlipDigitableLine:
      typeof m.bankSlipDigitableLine === 'string' ? m.bankSlipDigitableLine : undefined,
    pixQrCode: typeof m.pixQrCode === 'string' ? m.pixQrCode : undefined,
    pixCopyPaste: typeof m.pixCopyPaste === 'string' ? m.pixCopyPaste : undefined,
  };
}

function resolveQty(input: { qty?: number; pack_id?: string }): number {
  if (input.pack_id) {
    const fromPack = LICENSE_TOPUP_PACKS[String(input.pack_id)];
    if (!fromPack) {
      throw new PartnerAdminError(
        `pack_id inválido (use: ${Object.keys(LICENSE_TOPUP_PACKS).join(', ')})`,
        'TOPUP_PACK_INVALID'
      );
    }
    return fromPack;
  }
  const qty = Math.trunc(Number(input.qty));
  if (!Number.isFinite(qty) || qty < LICENSE_TOPUP_QTY_MIN || qty > LICENSE_TOPUP_QTY_MAX) {
    throw new PartnerAdminError(
      `qty deve ser inteiro entre ${LICENSE_TOPUP_QTY_MIN} e ${LICENSE_TOPUP_QTY_MAX}`,
      'TOPUP_QTY_INVALID'
    );
  }
  return qty;
}

/**
 * Preço unitário: unit_overage_cents do plano atacado ativo, senão unit_cost_cents do pool (W7).
 */
export async function quotePartnerLicenseTopup(
  partnerTenantId: string,
  input: { qty?: number; pack_id?: string }
): Promise<LicenseTopupQuote> {
  const detail = await getPartnerDetail(partnerTenantId);
  if (!detail) {
    throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  }

  const qty = resolveQty(input);
  let unit = detail.unit_cost_cents;
  let priceSource: LicenseTopupQuote['price_source'] = 'pool_unit_cost';
  let wholesalePlanId = detail.wholesale_plan_id;

  if (detail.wholesale_plan_id) {
    const plan = await getWholesalePlan(detail.wholesale_plan_id);
    if (plan && plan.unit_overage_cents != null && plan.unit_overage_cents >= 0) {
      unit = plan.unit_overage_cents;
      priceSource = 'wholesale_overage';
    }
  }

  if (!Number.isFinite(unit) || unit < 0) {
    throw new PartnerAdminError('Preço unitário inválido', 'TOPUP_PRICE_INVALID');
  }
  if (unit === 0) {
    // permitido (cortesia / zero) — settlement automático
  }

  return {
    qty,
    unit_price_cents: unit,
    amount_cents: unit * qty,
    price_source: priceSource,
    wholesale_plan_id: wholesalePlanId,
    wholesale_status: detail.wholesale_status,
  };
}

async function cancelOpenTopupBillings(
  partnerTenantId: string,
  exceptId: string | null
): Promise<void> {
  await pool.query(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = 'partner_license_topup'
       AND status = ANY($2::text[])
       AND ($3::uuid IS NULL OR id <> $3)`,
    [partnerTenantId, ['pending', 'waiting_payment', 'processing', 'overdue'], exceptId]
  );
}

async function resolveInvoicePlanId(partnerTenantId: string): Promise<string> {
  const detail = await getPartnerDetail(partnerTenantId);
  if (detail?.plan_id) return detail.plan_id;
  if (detail?.wholesale_plan_id) {
    const wp = await getWholesalePlan(detail.wholesale_plan_id);
    if (wp?.envelope_plan_id) return wp.envelope_plan_id;
  }
  const def = await resolveDefaultPlanId();
  if (!def) {
    throw new PartnerAdminError('Nenhum plan_id técnico disponível para fatura', 'PLAN_REQUIRED', 500);
  }
  return def;
}

/**
 * Cria fatura one-shot partner_license_topup + cobrança Platform.
 */
export async function createPartnerLicenseTopupCheckout(input: {
  partnerTenantId: string;
  qty?: number;
  pack_id?: string;
  paymentMethod?: PaymentMethod;
  actorUserId?: string | null;
}): Promise<LicenseTopupCheckoutResult> {
  const detail = await getPartnerDetail(input.partnerTenantId);
  if (!detail) {
    throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  }

  // Opcional na S3; obrigatório na S4 — já bloqueamos past_due
  if (detail.wholesale_status === 'past_due') {
    throw new PartnerAdminError(
      'Partner inadimplente (past_due) — regularize o plano atacado antes de comprar seats',
      'WHOLESALE_PAST_DUE',
      409
    );
  }

  const quote = await quotePartnerLicenseTopup(input.partnerTenantId, {
    qty: input.qty,
    pack_id: input.pack_id,
  });

  const planId = await resolveInvoicePlanId(input.partnerTenantId);
  const paymentMethod = (input.paymentMethod ?? 'PIX') as PaymentMethod;

  const existing = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
            invoice_number, gateway, payment_method,
            gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
            period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
            users_count, source, billing_reason, created_at, updated_at, platform_public_pay_token
     FROM tenant_billing
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = 'partner_license_topup'
       AND status = ANY($2::text[])
       AND COALESCE((gateway_metadata->>'topup_seats')::int, -1) = $3
       AND amount_cents = $4
     ORDER BY created_at DESC
     LIMIT 1`,
    [
      input.partnerTenantId,
      ['pending', 'waiting_payment', 'processing', 'overdue'],
      quote.qty,
      quote.amount_cents,
    ]
  );

  let billing = existing.rows[0] ?? null;
  await cancelOpenTopupBillings(input.partnerTenantId, billing?.id ?? null);

  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';

  if (!billing) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    billing = await createInvoice({
      tenant_id: input.partnerTenantId,
      plan_id: planId,
      billing_interval: 'monthly',
      amount_cents: quote.amount_cents,
      due_date: dueDate,
      source: 'self_service',
      billing_reason: 'partner_license_topup',
      users_count: quote.qty,
      gateway: gatewayKey,
      plan_name_snapshot: `Licenças avulsas ×${quote.qty}`,
      plan_price_snapshot: quote.amount_cents,
    });
  }

  await pool.query(
    `UPDATE tenant_billing
     SET gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2`,
    [
      JSON.stringify({
        topup_seats: quote.qty,
        unit_price_cents: quote.unit_price_cents,
        price_source: quote.price_source,
        wholesale_plan_id: quote.wholesale_plan_id,
        charge_scope: 'platform',
      }),
      billing.id,
    ]
  );
  billing = (await getInvoiceById(billing.id)) ?? billing;

  const zeroSettlement = await trySettleZeroAmountBillingIfEligible({
    billingId: billing.id,
    amountCents: quote.amount_cents,
    source: 'checkout',
  });
  if (zeroSettlement?.settled) {
    const settled = (await getInvoiceById(billing.id)) ?? billing;
    return { billing: settled, quote, settled: true };
  }

  const gateway = await getActiveGateway({ billingType: 'saas' });
  if (!gateway) {
    return { billing, quote };
  }
  if (!billing.invoice_number) {
    throw new PartnerAdminError('Fatura sem número', 'INVOICE_NUMBER_MISSING', 500);
  }
  if (!(await hasTenantBillingPaymentAttemptsTable())) {
    return { billing, quote };
  }

  const dueDateStr =
    yyyyMmDdFromDbDateValue(billing.due_date) ?? new Date().toISOString().slice(0, 10);

  const ensured = await ensureSaasPlanCheckoutPaymentAttemptForSwitch({
    billing,
    tenantId: input.partnerTenantId,
    requestedMethod: paymentMethod,
    gateway,
    gatewayKey,
    amountCents: billing.amount_cents,
    dueDateStr,
    invoiceNumber: billing.invoice_number,
  });

  return {
    billing: ensured.billing,
    quote,
    paymentUrls: ensured.paymentUrls ?? paymentUrlsFromMeta(ensured.billing.gateway_metadata),
  };
}

function topupSeatsFromBilling(billing: TenantBillingRow): number {
  const meta =
    billing.gateway_metadata && typeof billing.gateway_metadata === 'object'
      ? (billing.gateway_metadata as Record<string, unknown>)
      : {};
  const fromMeta = Number(meta.topup_seats);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return Math.trunc(fromMeta);
  if (billing.users_count != null && billing.users_count > 0) return Math.trunc(billing.users_count);
  return 0;
}

/**
 * Pós-pagamento — billing_reason=partner_license_topup.
 */
export async function activatePartnerLicenseTopupFromBilling(
  billing: TenantBillingRow
): Promise<void> {
  if (billing.status !== 'paid') {
    console.log('[TOPUP] activate skipped — not paid', { billingId: billing.id });
    return;
  }

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM partner_license_ledger
     WHERE billing_id = $1 AND reason = 'topup_purchase'
     LIMIT 1`,
    [billing.id]
  );
  if (existing.rows.length > 0) {
    console.log('[TOPUP] activate idempotent', { billingId: billing.id });
    return;
  }

  const seats = topupSeatsFromBilling(billing);
  if (seats <= 0) {
    console.error('[TOPUP] billing sem topup_seats', { billingId: billing.id });
    return;
  }

  const meta =
    billing.gateway_metadata && typeof billing.gateway_metadata === 'object'
      ? (billing.gateway_metadata as Record<string, unknown>)
      : {};
  const wholesalePlanId =
    typeof meta.wholesale_plan_id === 'string' ? meta.wholesale_plan_id : null;

  await applyPartnerLicenseDelta({
    partnerTenantId: billing.tenant_id,
    deltaSeats: seats,
    reason: 'topup_purchase',
    billingId: billing.id,
    wholesalePlanId,
    note: `Compra avulsa ×${seats}`,
    metadata: {
      topup_seats: seats,
      unit_price_cents: meta.unit_price_cents ?? null,
      price_source: meta.price_source ?? null,
    },
  });

  console.log('[TOPUP] seats creditados', {
    partnerTenantId: billing.tenant_id,
    billingId: billing.id,
    seats,
  });
}

/**
 * M5-W Sprint 2 — checkout plano atacado via Asaas Platform (nunca gateway do Partner).
 */

import { pool } from '../utils/db.js';
import {
  createInvoice,
  getInvoiceById,
  type BillingInterval,
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
import { getWholesalePlan, type PartnerWholesalePlan } from './partnerWholesalePlanService.js';
import { getPartnerDetail } from './partnerRepository.js';
import {
  resolveWholesaleEnvelopePlanId,
} from './partnerWholesaleActivationService.js';
import { logSuperAdminAction } from '../services/auditLogService.js';

export type WholesaleCheckoutResult = {
  billing: TenantBillingRow;
  plan: PartnerWholesalePlan;
  paymentUrls?: {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    bankSlipDigitableLine?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  };
  settled?: boolean;
};

function paymentUrlsFromMeta(meta: unknown): WholesaleCheckoutResult['paymentUrls'] {
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

async function cancelOpenWholesaleBillings(
  partnerTenantId: string,
  exceptId: string | null
): Promise<void> {
  await pool.query(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = 'partner_wholesale'
       AND status = ANY($2::text[])
       AND ($3::uuid IS NULL OR id <> $3)`,
    [partnerTenantId, ['pending', 'waiting_payment', 'processing', 'overdue'], exceptId]
  );
}

/**
 * Cria fatura partner_wholesale + cobrança no gateway Platform.
 */
export async function createPartnerWholesaleCheckout(input: {
  partnerTenantId: string;
  wholesalePlanId: string;
  paymentMethod?: PaymentMethod;
  source?: 'superadmin' | 'self_service' | 'api';
  actorUserId?: string | null;
}): Promise<WholesaleCheckoutResult> {
  const detail = await getPartnerDetail(input.partnerTenantId);
  if (!detail) {
    throw new PartnerAdminError('Partner não encontrado', 'NOT_FOUND', 404);
  }

  const plan = await getWholesalePlan(input.wholesalePlanId);
  if (!plan) {
    throw new PartnerAdminError('Plano atacado não encontrado', 'WHOLESALE_NOT_FOUND', 404);
  }
  if (plan.status !== 'active') {
    throw new PartnerAdminError(
      'Só é possível contratar planos atacado com status active',
      'WHOLESALE_NOT_ACTIVE',
      400
    );
  }

  const envelopePlanId = await resolveWholesaleEnvelopePlanId(plan, input.partnerTenantId);
  if (!envelopePlanId) {
    throw new PartnerAdminError(
      'Plano envelope técnico não configurado (defina envelope_plan_id no plano atacado)',
      'ENVELOPE_REQUIRED',
      400
    );
  }

  const paymentMethod = (input.paymentMethod ?? 'PIX') as PaymentMethod;
  const source = input.source ?? 'self_service';
  const billingInterval = plan.billing_interval as BillingInterval;

  // Reuso: mesma combinação plan envelope + wholesale metadata
  const existing = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
            invoice_number, gateway, payment_method,
            gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
            period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
            users_count, source, billing_reason, created_at, updated_at, platform_public_pay_token
     FROM tenant_billing
     WHERE tenant_id = $1
       AND COALESCE(billing_reason, '') = 'partner_wholesale'
       AND status = ANY($2::text[])
       AND COALESCE(gateway_metadata->>'wholesale_plan_id', '') = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.partnerTenantId, ['pending', 'waiting_payment', 'processing', 'overdue'], plan.id]
  );

  let billing = existing.rows[0] ?? null;
  await cancelOpenWholesaleBillings(input.partnerTenantId, billing?.id ?? null);

  const config = await getActiveConfig('saas'); // Platform (sem tenantId)
  const gatewayKey = config?.gateway_key ?? 'asaas';

  if (billing && billing.amount_cents !== plan.price_cents) {
    await pool.query(`UPDATE tenant_billing SET amount_cents = $1, updated_at = now() WHERE id = $2`, [
      plan.price_cents,
      billing.id,
    ]);
    billing = (await getInvoiceById(billing.id)) ?? billing;
  }

  if (!billing) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    billing = await createInvoice({
      tenant_id: input.partnerTenantId,
      plan_id: envelopePlanId,
      billing_interval: billingInterval,
      amount_cents: plan.price_cents,
      due_date: dueDate,
      source,
      billing_reason: 'partner_wholesale',
      users_count: plan.seats_included,
      gateway: gatewayKey,
      plan_name_snapshot: plan.name,
      plan_price_snapshot: plan.price_cents,
    });
  }

  await pool.query(
    `UPDATE tenant_billing
     SET gateway_metadata = COALESCE(gateway_metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2`,
    [
      JSON.stringify({
        wholesale_plan_id: plan.id,
        wholesale_plan_slug: plan.slug,
        seats_included: plan.seats_included,
        charge_scope: 'platform',
      }),
      billing.id,
    ]
  );
  billing = (await getInvoiceById(billing.id)) ?? billing;

  const zeroSettlement = await trySettleZeroAmountBillingIfEligible({
    billingId: billing.id,
    amountCents: plan.price_cents,
    source: source === 'superadmin' ? 'manual_charge' : 'checkout',
  });
  if (zeroSettlement?.settled) {
    const settled = (await getInvoiceById(billing.id)) ?? billing;
    return { billing: settled, plan, settled: true };
  }

  // Gateway Platform — NUNCA passar tenantId do Partner
  const gateway = await getActiveGateway({ billingType: 'saas' });
  if (!gateway) {
    return { billing, plan };
  }

  if (!billing.invoice_number) {
    throw new PartnerAdminError('Fatura sem número', 'INVOICE_NUMBER_MISSING', 500);
  }

  if (!(await hasTenantBillingPaymentAttemptsTable())) {
    return { billing, plan };
  }

  const dueDateStr =
    yyyyMmDdFromDbDateValue(billing.due_date) ??
    new Date().toISOString().slice(0, 10);

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

  if (input.actorUserId && source === 'superadmin') {
    await logSuperAdminAction(
      input.actorUserId,
      'partner_wholesale.assign_charge',
      'partner',
      input.partnerTenantId,
      { wholesale_plan_id: plan.id, billing_id: ensured.billing.id }
    );
  }

  return {
    billing: ensured.billing,
    plan,
    paymentUrls: ensured.paymentUrls ?? paymentUrlsFromMeta(ensured.billing.gateway_metadata),
  };
}

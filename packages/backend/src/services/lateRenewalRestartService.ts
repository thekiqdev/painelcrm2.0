/**
 * RC S2/S4 — restart de renovação em atraso.
 * Cancela `plan_renewal` abertas, cria uma do dia do pagamento até o próximo ciclo
 * e move `next_billing_date`. A baixa (S3) e a UI Meu Plano (S4) usam a mesma regra S1.
 */
import { pool } from '../utils/db.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { tryResolveWholesaleRenewalAmount } from '../partner/partnerWholesaleRecurringService.js';
import type { BillingInterval } from './billingService.js';
import {
  calculateSaasRenewalInvoiceAmount,
  computeWhatsAppInstanceRenewalExtrasCents,
  resolveWhatsAppInstanceUnitPriceForRenewal,
} from './billingService.js';
import {
  cancelOpenPlanRenewalBillingsForTenant,
  createInvoice,
  type CancelledOpenPlanRenewalRow,
} from './invoiceService.js';
import {
  evaluateLateRenewalRestart,
  LATE_RENEWAL_OPEN_STATUSES,
  type LateRenewalRestartDecision,
  type LateRenewalRestartIneligibleReason,
} from './lateRenewalRestartEligibility.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';

export type LateRenewalRestartErrorCode =
  | LateRenewalRestartIneligibleReason
  | 'subscription_not_found'
  | 'plan_missing';

export type LateRenewalRestartResult =
  | {
      ok: true;
      billingId: string;
      invoiceNumber: string | null;
      periodStart: string;
      periodEnd: string;
      amountCents: number;
      cancelledIds: string[];
    }
  | { ok: false; error: LateRenewalRestartErrorCode };

export type LateRenewalRestartAssessment =
  | {
      eligible: true;
      periodStart: string;
      periodEnd: string;
      openRenewalCount: number;
    }
  | { eligible: false; reason: LateRenewalRestartErrorCode };

type OpenRenewalRow = {
  period_start: string | null;
  period_end: string | null;
  status: string;
};

type SubRow = {
  id: string;
  plan_id: string | null;
  billing_interval: string;
  users_count: number | null;
  contracted_plan_price_cents: number | null;
  contracted_price_per_user_cents: number | null;
  contracted_price_per_instance_cents: number | null;
  asaas_subscription_id: string | null;
};

type RestartContext = {
  tenant: {
    plan_period_end: string | null;
    max_whatsapp_instances_override: number | null;
  };
  sub: SubRow;
  openRenewals: OpenRenewalRow[];
  decision: LateRenewalRestartDecision;
};

function todayYmd(): string {
  return yyyyMmDdFromDbDateValue(new Date());
}

async function cancelGatewayChargesBestEffort(
  rows: CancelledOpenPlanRenewalRow[],
  tenantId: string
): Promise<void> {
  for (const row of rows) {
    const ref = row.gateway_reference_id?.trim();
    if (!ref) continue;
    try {
      const gateway = await getActiveGateway({ billingType: 'saas', tenantId });
      if (gateway && typeof gateway.cancelPayment === 'function') {
        await gateway.cancelPayment(ref);
      }
    } catch (e) {
      console.warn('[RC S2] falha ao cancelar cobrança gateway de plan_renewal', {
        billingId: row.id,
        ref,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function loadLateRenewalRestartContext(params: {
  tenantId: string;
  paymentDate: string;
}): Promise<
  | { ok: true; ctx: RestartContext }
  | { ok: false; error: LateRenewalRestartErrorCode }
> {
  const tenantRes = await pool.query<{
    plan_period_end: string | null;
    max_whatsapp_instances_override: number | null;
  }>(
    `SELECT plan_period_end::text AS plan_period_end,
            max_whatsapp_instances_override
     FROM tenants WHERE id = $1::uuid`,
    [params.tenantId]
  );
  const tenant = tenantRes.rows[0];
  if (!tenant) return { ok: false, error: 'subscription_not_found' };

  const subRes = await pool.query<SubRow>(
    `SELECT id::text AS id,
            plan_id::text AS plan_id,
            billing_interval::text AS billing_interval,
            users_count,
            contracted_plan_price_cents,
            contracted_price_per_user_cents,
            contracted_price_per_instance_cents,
            asaas_subscription_id
     FROM subscriptions
     WHERE tenant_id = $1::uuid
       AND type = 'saas'
       AND status IN ('active', 'past_due')
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 ELSE 2 END,
              updated_at DESC
     LIMIT 1`,
    [params.tenantId]
  );
  const sub = subRes.rows[0];
  if (!sub) return { ok: false, error: 'subscription_not_found' };

  const openRes = await pool.query<OpenRenewalRow>(
    `SELECT period_start::text AS period_start,
            period_end::text AS period_end,
            status
     FROM tenant_billing
     WHERE tenant_id = $1::uuid
       AND subscription_id = $2::uuid
       AND COALESCE(billing_reason, '') = 'plan_renewal'
       AND status = ANY($3::text[])`,
    [params.tenantId, sub.id, [...LATE_RENEWAL_OPEN_STATUSES]]
  );

  const decision = evaluateLateRenewalRestart({
    planPeriodEnd: yyyyMmDdFromDbDateValue(tenant.plan_period_end) || null,
    billingInterval: sub.billing_interval as BillingInterval,
    paymentDate: params.paymentDate,
    openRenewals: openRes.rows,
    asaasSubscriptionId: sub.asaas_subscription_id,
  });

  return {
    ok: true,
    ctx: {
      tenant,
      sub,
      openRenewals: openRes.rows,
      decision,
    },
  };
}

/** RC S4 — só leitura: Meu Plano decide se mostra “Renovar agora”. */
export async function assessLateRenewalRestartForTenant(params: {
  tenantId: string;
  paymentDate?: string;
}): Promise<LateRenewalRestartAssessment> {
  const paymentDate = (params.paymentDate ?? todayYmd()).trim();
  const loaded = await loadLateRenewalRestartContext({
    tenantId: params.tenantId.trim(),
    paymentDate,
  });
  if (!loaded.ok) return { eligible: false, reason: loaded.error };
  if (!loaded.ctx.decision.eligible) {
    return { eligible: false, reason: loaded.ctx.decision.reason };
  }
  return {
    eligible: true,
    periodStart: loaded.ctx.decision.periodStart,
    periodEnd: loaded.ctx.decision.periodEnd,
    openRenewalCount: loaded.ctx.openRenewals.length,
  };
}

/**
 * Um ciclo para a frente. Recusa sem escrever quando a regra S1 não libera.
 * O segundo clique cai em `insufficient_backlog` (só resta a fatura nova) e não cancela de novo.
 */
export async function restartLateRenewalForTenant(params: {
  tenantId: string;
  /** YYYY-MM-DD. Default: hoje no calendário local do processo. */
  paymentDate?: string;
}): Promise<LateRenewalRestartResult> {
  const tenantId = params.tenantId.trim();
  const paymentDate = (params.paymentDate ?? todayYmd()).trim();

  const loaded = await loadLateRenewalRestartContext({ tenantId, paymentDate });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { tenant, sub, decision } = loaded.ctx;
  if (!decision.eligible) {
    return { ok: false, error: decision.reason };
  }
  if (!sub.plan_id) return { ok: false, error: 'plan_missing' };

  const planRes = await pool.query<{
    name: string | null;
    price_cents: number | null;
    plan_type: string | null;
    max_whatsapp_instances: number | null;
  }>(
    `SELECT name, price_cents, plan_type, max_whatsapp_instances
     FROM plans WHERE id = $1::uuid`,
    [sub.plan_id]
  );
  const plan = planRes.rows[0];
  const planType = plan?.plan_type ?? 'standard';
  const interval = sub.billing_interval as BillingInterval;
  const renewalPricing = await calculateSaasRenewalInvoiceAmount({
    planId: sub.plan_id,
    billingInterval: interval,
    planType,
    planListPriceCents: plan?.price_cents ?? null,
    usersForRenewal: sub.users_count,
    contracted_plan_price_cents: sub.contracted_plan_price_cents,
    contracted_price_per_user_cents: sub.contracted_price_per_user_cents,
    tenantId,
  });
  const unitPrice = await resolveWhatsAppInstanceUnitPriceForRenewal({
    planId: sub.plan_id,
    billingInterval: interval,
    contractedPricePerInstanceCents: sub.contracted_price_per_instance_cents,
  });
  const whatsappExtras = computeWhatsAppInstanceRenewalExtrasCents({
    planIncludedInstances: plan?.max_whatsapp_instances ?? null,
    contractedInstances: tenant.max_whatsapp_instances_override,
    pricePerInstanceCents: unitPrice,
  });
  let amountCents = renewalPricing.amountCents + whatsappExtras.extrasCents;
  const wholesale = await tryResolveWholesaleRenewalAmount({
    tenantId,
    subscriptionId: sub.id,
  });
  if (wholesale) amountCents = wholesale.amountCents;

  const config = await getActiveConfig('saas', tenantId);
  const billing = await createInvoice({
    tenant_id: tenantId,
    plan_id: sub.plan_id,
    billing_interval: interval,
    amount_cents: amountCents,
    due_date: decision.periodStart,
    source: 'self_service',
    billing_reason: 'plan_renewal',
    users_count: sub.users_count,
    gateway: config?.gateway_key ?? 'asaas',
    idempotency_key: `late_renewal_restart_${sub.id}_${decision.periodStart}`,
    subscription_id: sub.id,
    period_start: decision.periodStart,
    period_end: decision.periodEnd,
    plan_name_snapshot: plan?.name ?? null,
    plan_price_snapshot: renewalPricing.planPriceSnapshotForInvoice,
  });

  const moved = await pool.query(
    `UPDATE subscriptions
     SET next_billing_date = $1::date,
         billing_anchor_day = EXTRACT(DAY FROM $1::date)::int,
         updated_at = now()
     WHERE id = $2::uuid
       AND tenant_id = $3::uuid
       AND type = 'saas'`,
    [decision.periodEnd, sub.id, tenantId]
  );
  if ((moved.rowCount ?? 0) !== 1) {
    throw new Error(
      `restartLateRenewalForTenant: next_billing_date não atualizado (subscription_id=${sub.id})`
    );
  }

  const cancelled = await cancelOpenPlanRenewalBillingsForTenant(tenantId, billing.id);
  await cancelGatewayChargesBestEffort(cancelled, tenantId);

  return {
    ok: true,
    billingId: billing.id,
    invoiceNumber: billing.invoice_number,
    periodStart: decision.periodStart,
    periodEnd: decision.periodEnd,
    amountCents,
    cancelledIds: cancelled.map((row) => row.id),
  };
}

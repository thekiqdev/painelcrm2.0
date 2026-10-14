/**
 * CA S3 — pagamentos gerados pela Assinatura Asaas (`payment.subscription`)
 * → upsert `tenant_billing` do ciclo + baixa de renovação sem resetar contrato (CS).
 */
import { pool } from '../utils/db.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import {
  cancelOpenPlanRenewalBillingsForTenant,
  createInvoice,
  getInvoiceById,
  getInvoiceByGatewayReferenceId,
  updateInvoiceGatewayData,
  type TenantBillingRow,
  type BillingInterval,
} from './invoiceService.js';
import {
  getSubscriptionById,
  updateSubscriptionAfterRenewal,
  type SubscriptionRow,
} from './billingSubscriptionService.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import { billingLog } from './billingLogger.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import {
  evaluateLateRenewalRestart,
  LATE_RENEWAL_OPEN_STATUSES,
} from './lateRenewalRestartEligibility.js';

const OPEN_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue'] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AsaasSubscriptionPaymentMeta = {
  asaasSubscriptionId: string;
  paymentId: string;
  gatewayKey?: string;
  /** Status bruto Asaas (PENDING, CONFIRMED, …). */
  gatewayStatus?: string | null;
  paymentMethod?: string | null;
  /** Valor em centavos (payment.value * 100). */
  amountCents?: number | null;
  /** dueDate Asaas YYYY-MM-DD. */
  dueDate?: string | null;
  /** externalReference do payment (pode ser billingId da contratação). */
  externalReference?: string | null;
  /** Evento Asaas (PAYMENT_CREATED, PAYMENT_CREDIT_CARD_CAPTURE_REFUSED, …). */
  eventType?: string | null;
};

export async function findSaasSubscriptionByAsaasSubscriptionId(
  asaasSubscriptionId: string,
  gatewayKey = 'asaas'
): Promise<SubscriptionRow | null> {
  const id = asaasSubscriptionId.trim();
  if (!id) return null;
  const r = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM subscriptions
     WHERE type = 'saas'
       AND asaas_subscription_id = $1
       AND COALESCE(asaas_subscription_gateway, 'asaas') = $2
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 WHEN 'trialing' THEN 2 ELSE 3 END,
              updated_at DESC
     LIMIT 1`,
    [id, gatewayKey]
  );
  const subId = r.rows[0]?.id;
  if (!subId) return null;
  return getSubscriptionById(subId);
}

/**
 * Localiza ou cria `tenant_billing` para um `pay_` gerado pela Assinatura Asaas.
 * Idempotente por `gateway_reference_id = paymentId`.
 */
export async function ensureTenantBillingForAsaasSubscriptionPayment(
  meta: AsaasSubscriptionPaymentMeta
): Promise<TenantBillingRow | null> {
  const gatewayKey = (meta.gatewayKey ?? 'asaas').trim() || 'asaas';
  const paymentId = meta.paymentId.trim();
  const asaasSubId = meta.asaasSubscriptionId.trim();
  if (!paymentId || !asaasSubId) return null;

  const byRef = await getInvoiceByGatewayReferenceId(gatewayKey, paymentId);
  if (byRef) {
    await enrichBillingAsaasSubscriptionMeta(byRef.id, asaasSubId, meta);
    return (await getInvoiceById(byRef.id)) ?? byRef;
  }

  // Contratação S2: externalReference = billingId.
  const ext = (meta.externalReference ?? '').trim();
  if (ext && UUID_RE.test(ext)) {
    const byExt = await getInvoiceById(ext);
    if (byExt) {
      await updateInvoiceGatewayData(byExt.id, {
        gateway: gatewayKey,
        payment_method: meta.paymentMethod ?? byExt.payment_method ?? 'CREDIT_CARD',
        gateway_reference_id: paymentId,
        gateway_status: meta.gatewayStatus ?? byExt.gateway_status,
        gateway_metadata: {
          ...((byExt.gateway_metadata as Record<string, unknown> | null) ?? {}),
          asaas_subscription_id: asaasSubId,
          asaas_subscription_mode: true,
          card_capture_channel: 'asaas_subscription',
        },
      });
      return (await getInvoiceById(byExt.id)) ?? byExt;
    }
  }

  const sub = await findSaasSubscriptionByAsaasSubscriptionId(asaasSubId, gatewayKey);
  if (!sub) {
    billingLog('invoice', 'asaas_subscription_payment_no_local_sub', {
      asaas_subscription_id: asaasSubId,
      payment_id: paymentId,
    });
    return null;
  }

  // Cobrança aberta da contratação/upgrade já marcada com asaas_subscription_id.
  const openContract = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE tenant_id = $1::uuid
       AND status = ANY($2::text[])
       AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'manual_charge')
       AND (
         gateway_metadata->>'asaas_subscription_id' = $3
         OR subscription_id = $4::uuid
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [sub.tenant_id, [...OPEN_STATUSES], asaasSubId, sub.id]
  );
  if (openContract.rows[0]) {
    const row = openContract.rows[0];
    await updateInvoiceGatewayData(row.id, {
      gateway: gatewayKey,
      payment_method: meta.paymentMethod ?? row.payment_method ?? 'CREDIT_CARD',
      gateway_reference_id: paymentId,
      gateway_status: meta.gatewayStatus ?? row.gateway_status,
      gateway_metadata: {
        ...((row.gateway_metadata as Record<string, unknown> | null) ?? {}),
        asaas_subscription_id: asaasSubId,
        asaas_subscription_mode: true,
        card_capture_channel: 'asaas_subscription',
      },
    });
    return (await getInvoiceById(row.id)) ?? row;
  }

  // Renovação já criada pelo job (sem charge Asaas avulsa) — reutiliza.
  const openRenewal = await pool.query<TenantBillingRow>(
    `SELECT id, tenant_id, plan_id, billing_interval, amount_cents, due_date::text AS due_date, status, paid_at,
       invoice_number, gateway, payment_method,
       gateway_reference_id, gateway_metadata, gateway_status, idempotency_key,
       period_start, period_end, subscription_id, plan_name_snapshot, plan_price_snapshot,
       users_count, source, billing_reason, created_at, updated_at
     FROM tenant_billing
     WHERE subscription_id = $1::uuid
       AND COALESCE(billing_reason, '') = 'plan_renewal'
       AND status = ANY($2::text[])
       AND (gateway_reference_id IS NULL OR gateway_reference_id = $3)
     ORDER BY created_at DESC
     LIMIT 1`,
    [sub.id, [...OPEN_STATUSES], paymentId]
  );
  if (openRenewal.rows[0]) {
    const row = openRenewal.rows[0];
    await updateInvoiceGatewayData(row.id, {
      gateway: gatewayKey,
      payment_method: meta.paymentMethod ?? 'CREDIT_CARD',
      gateway_reference_id: paymentId,
      gateway_status: meta.gatewayStatus ?? row.gateway_status,
      gateway_metadata: {
        ...((row.gateway_metadata as Record<string, unknown> | null) ?? {}),
        asaas_subscription_id: asaasSubId,
        asaas_subscription_mode: true,
        card_capture_channel: 'asaas_subscription',
      },
    });
    return (await getInvoiceById(row.id)) ?? row;
  }

  // Novo ciclo — cria plan_renewal a partir do contrato local (não do catálogo).
  const dueYmd =
    yyyyMmDdFromDbDateValue(meta.dueDate) ||
    yyyyMmDdFromDbDateValue(new Date()) ||
    new Date().toISOString().slice(0, 10);
  const interval = (sub.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = calculateNextBillingDate(dueYmd, interval, null);
  const amountCents =
    typeof meta.amountCents === 'number' && Number.isFinite(meta.amountCents) && meta.amountCents > 0
      ? Math.round(meta.amountCents)
      : sub.amount_cents;

  const created = await createInvoice({
    tenant_id: sub.tenant_id,
    plan_id: sub.plan_id!,
    billing_interval: interval,
    amount_cents: amountCents,
    due_date: dueYmd,
    source: 'self_service',
    billing_reason: 'plan_renewal',
    payment_method: meta.paymentMethod ?? 'CREDIT_CARD',
    users_count: sub.users_count,
    gateway: gatewayKey,
    idempotency_key: `asaas_sub_${asaasSubId}_${paymentId}`,
    subscription_id: sub.id,
    period_start: dueYmd,
    period_end: periodEnd,
    plan_name_snapshot: null,
    plan_price_snapshot: amountCents,
  });

  await updateInvoiceGatewayData(created.id, {
    gateway: gatewayKey,
    payment_method: meta.paymentMethod ?? 'CREDIT_CARD',
    gateway_reference_id: paymentId,
    gateway_status: meta.gatewayStatus ?? 'PENDING',
    gateway_metadata: {
      asaas_subscription_id: asaasSubId,
      asaas_subscription_mode: true,
      card_capture_channel: 'asaas_subscription',
      created_from: 'asaas_subscription_webhook',
    },
    idempotency_key: `asaas_sub_${asaasSubId}_${paymentId}`,
  });

  billingLog('invoice', 'asaas_subscription_renewal_billing_created', {
    billing_id: created.id,
    subscription_id: sub.id,
    asaas_subscription_id: asaasSubId,
    payment_id: paymentId,
    amount_cents: amountCents,
    period_start: dueYmd,
    period_end: periodEnd,
  });

  return (await getInvoiceById(created.id)) ?? created;
}

async function enrichBillingAsaasSubscriptionMeta(
  billingId: string,
  asaasSubId: string,
  meta: AsaasSubscriptionPaymentMeta
): Promise<void> {
  const row = await getInvoiceById(billingId);
  if (!row) return;
  const prev = (row.gateway_metadata as Record<string, unknown> | null) ?? {};
  if (prev.asaas_subscription_id === asaasSubId && row.gateway_reference_id === meta.paymentId) {
    return;
  }
  await updateInvoiceGatewayData(billingId, {
    gateway: meta.gatewayKey ?? row.gateway ?? 'asaas',
    payment_method: meta.paymentMethod ?? row.payment_method ?? 'CREDIT_CARD',
    gateway_reference_id: meta.paymentId,
    gateway_status: meta.gatewayStatus ?? row.gateway_status,
    gateway_metadata: {
      ...prev,
      asaas_subscription_id: asaasSubId,
      asaas_subscription_mode: true,
      card_capture_channel: 'asaas_subscription',
    },
  });
}

async function cancelRenewalSiblingGatewayCharges(
  rows: Array<{ id: string; gateway_reference_id: string | null }>,
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
      console.warn('[RC S3] falha ao cancelar cobrança gateway de plan_renewal', {
        billingId: row.id,
        ref,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * RC S3 — segunda baixa de outra fatura do mesmo atraso, depois que uma já reancorou.
 * Compara o início histórico desta fatura com `renewal_period_start` gravado na que reiniciou.
 */
async function findPriorLateRenewalRestart(opts: {
  tenantId: string;
  subscriptionId: string;
  billingId: string;
  invoiceAnchorYmd: string;
}): Promise<boolean> {
  if (!opts.invoiceAnchorYmd) return false;
  const prior = await pool.query<{ renewal_period_start: string | null }>(
    `SELECT gateway_metadata->>'renewal_period_start' AS renewal_period_start
     FROM tenant_billing
     WHERE subscription_id = $1::uuid
       AND tenant_id = $2::uuid
       AND id <> $3::uuid
       AND status = 'paid'
       AND COALESCE(billing_reason, '') = 'plan_renewal'
       AND gateway_metadata->>'late_renewal_restart_at' IS NOT NULL
     ORDER BY paid_at DESC NULLS LAST
     LIMIT 1`,
    [opts.subscriptionId, opts.tenantId, opts.billingId]
  );
  const restartStart = yyyyMmDdFromDbDateValue(prior.rows[0]?.renewal_period_start);
  return Boolean(restartStart && opts.invoiceAnchorYmd < restartStart);
}

/** Limpa suspensão / past_due. Período só muda quando `periodStart` e `periodEnd` vêm preenchidos. */
async function applyRenewalPaidAccess(opts: {
  tenantId: string;
  subscriptionId: string;
  billingId: string;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<void> {
  if (opts.periodStart && opts.periodEnd) {
    await pool.query(
      `UPDATE tenants
       SET plan_period_start = $1::date,
           plan_period_end = $2::date,
           status = CASE WHEN status IN ('suspended', 'past_due') THEN 'active' ELSE status END,
           suspension_reason = CASE WHEN status IN ('suspended', 'past_due') THEN NULL ELSE suspension_reason END,
           suspended_at = CASE WHEN status IN ('suspended', 'past_due') THEN NULL ELSE suspended_at END,
           updated_at = now()
       WHERE id = $3::uuid`,
      [opts.periodStart, opts.periodEnd, opts.tenantId]
    );
  } else {
    await pool.query(
      `UPDATE tenants
       SET status = CASE WHEN status IN ('suspended', 'past_due') THEN 'active' ELSE status END,
           suspension_reason = CASE WHEN status IN ('suspended', 'past_due') THEN NULL ELSE suspension_reason END,
           suspended_at = CASE WHEN status IN ('suspended', 'past_due') THEN NULL ELSE suspended_at END,
           updated_at = now()
       WHERE id = $1::uuid`,
      [opts.tenantId]
    );
  }

  await pool.query(
    `UPDATE subscriptions
     SET status = 'active', updated_at = now()
     WHERE id = $1::uuid AND tenant_id = $2::uuid AND type = 'saas' AND status = 'past_due'`,
    [opts.subscriptionId, opts.tenantId]
  );

  try {
    const { clearSubscriptionPastDueOnPaid } = await import(
      './collectionPolicy/subscriptionPastDueWriter.js'
    );
    const { tenantBillingCorrelationId } = await import('./billing2/billingCorrelationId.js');
    await clearSubscriptionPastDueOnPaid({
      subscriptionId: opts.subscriptionId,
      billingId: opts.billingId,
      correlationId: tenantBillingCorrelationId(opts.billingId),
    });
  } catch (e) {
    console.warn('[CA S3] clear past_due skipped', e);
  }
}

/**
 * Confirma renovação paga: avança período da subscription + tenant **sem**
 * reescrever snapshot contratual / activated_billing_id como 1ª compra.
 * Idempotente por `gateway_metadata.asaas_renewal_confirmed_at`.
 * RC S3: backlog em atraso reancora uma vez a partir da data do pagamento.
 */
export async function confirmSaasRenewalFromAsaasPayment(billingId: string): Promise<{
  confirmed: boolean;
  detail: string;
}> {
  const billing = await getInvoiceById(billingId);
  if (!billing) return { confirmed: false, detail: 'billing_not_found' };
  if (billing.status !== 'paid') return { confirmed: false, detail: 'billing_not_paid' };

  const reason = billing.billing_reason ?? 'plan_purchase';
  if (reason !== 'plan_renewal') {
    return { confirmed: false, detail: 'not_plan_renewal' };
  }

  const meta = (billing.gateway_metadata as Record<string, unknown> | null) ?? {};
  if (meta.asaas_renewal_confirmed_at || meta.renewal_confirmed_at) {
    return { confirmed: true, detail: 'already_confirmed' };
  }

  try {
    const { maybeConfirmPartnerWholesaleRenewal } = await import(
      '../partner/partnerWholesaleRenewalService.js'
    );
    await maybeConfirmPartnerWholesaleRenewal(billing);
  } catch (e) {
    console.error('[CA S3] wholesale renewal confirm failed', e);
  }

  let sub: SubscriptionRow | null = null;
  if (billing.subscription_id) {
    sub = await getSubscriptionById(billing.subscription_id);
  }
  if (!sub) {
    const asaasSubId =
      typeof meta.asaas_subscription_id === 'string' ? meta.asaas_subscription_id.trim() : '';
    if (asaasSubId) {
      sub = await findSaasSubscriptionByAsaasSubscriptionId(
        asaasSubId,
        billing.gateway ?? 'asaas'
      );
    }
  }
  if (!sub) {
    return { confirmed: false, detail: 'subscription_not_found' };
  }

  const interval = (billing.billing_interval || sub.billing_interval || 'monthly') as BillingInterval;
  const paymentDate =
    yyyyMmDdFromDbDateValue(billing.paid_at) ||
    yyyyMmDdFromDbDateValue(new Date()) ||
    new Date().toISOString().slice(0, 10);
  const historicalStart =
    yyyyMmDdFromDbDateValue(billing.period_start) ||
    yyyyMmDdFromDbDateValue(billing.due_date) ||
    paymentDate;
  const historicalEnd =
    yyyyMmDdFromDbDateValue(billing.period_end) ||
    calculateNextBillingDate(historicalStart, interval, null);
  const invoiceAnchor =
    yyyyMmDdFromDbDateValue(billing.period_start) ||
    yyyyMmDdFromDbDateValue(billing.due_date) ||
    yyyyMmDdFromDbDateValue(billing.period_end);

  const backlogAlreadyRestarted = await findPriorLateRenewalRestart({
    tenantId: billing.tenant_id,
    subscriptionId: sub.id,
    billingId,
    invoiceAnchorYmd: invoiceAnchor,
  });
  if (backlogAlreadyRestarted) {
    await applyRenewalPaidAccess({
      tenantId: billing.tenant_id,
      subscriptionId: sub.id,
      billingId,
    });
    const cancelled = await cancelOpenPlanRenewalBillingsForTenant(billing.tenant_id, billingId);
    await cancelRenewalSiblingGatewayCharges(cancelled, billing.tenant_id);
    await updateInvoiceGatewayData(billingId, {
      gateway: billing.gateway ?? 'asaas',
      payment_method: billing.payment_method,
      gateway_reference_id: billing.gateway_reference_id,
      gateway_status: billing.gateway_status,
      gateway_metadata: {
        ...meta,
        asaas_renewal_confirmed_at: new Date().toISOString(),
        renewal_confirmed_at: new Date().toISOString(),
        late_renewal_restart_skipped: true,
      },
    });
    billingLog('invoice', 'late_renewal_restart_skipped', {
      billing_id: billingId,
      subscription_id: sub.id,
    });
    return { confirmed: true, detail: 'restart_already_applied' };
  }

  const coverage = await pool.query<{
    plan_period_end: string | null;
    asaas_subscription_id: string | null;
  }>(
    `SELECT t.plan_period_end::text AS plan_period_end,
            s.asaas_subscription_id
     FROM tenants t
     LEFT JOIN subscriptions s ON s.id = $2::uuid AND s.tenant_id = t.id
     WHERE t.id = $1::uuid`,
    [billing.tenant_id, sub.id]
  );
  const openRenewals = await pool.query<{
    period_start: string | null;
    period_end: string | null;
    status: string;
  }>(
    `SELECT period_start::text AS period_start,
            period_end::text AS period_end,
            status
     FROM tenant_billing
     WHERE subscription_id = $1::uuid
       AND tenant_id = $2::uuid
       AND COALESCE(billing_reason, '') = 'plan_renewal'
       AND status = ANY($3::text[])`,
    [sub.id, billing.tenant_id, [...LATE_RENEWAL_OPEN_STATUSES]]
  );
  const decision = evaluateLateRenewalRestart({
    planPeriodEnd: yyyyMmDdFromDbDateValue(coverage.rows[0]?.plan_period_end) || null,
    billingInterval: interval,
    paymentDate,
    openRenewals: [
      ...openRenewals.rows,
      {
        period_start: yyyyMmDdFromDbDateValue(billing.period_start) || null,
        period_end: yyyyMmDdFromDbDateValue(billing.period_end) || null,
        status: 'overdue',
      },
    ],
    asaasSubscriptionId: coverage.rows[0]?.asaas_subscription_id ?? null,
  });

  const periodStart = decision.eligible ? decision.periodStart : historicalStart;
  const periodEnd = decision.eligible ? decision.periodEnd : historicalEnd;

  const nextCount = Number(sub.billing_cycle_count ?? 0) + 1;
  await updateSubscriptionAfterRenewal(pool, sub.id, billing.tenant_id, {
    next_billing_date: periodEnd,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    billing_cycle_count: nextCount,
  });

  await applyRenewalPaidAccess({
    tenantId: billing.tenant_id,
    subscriptionId: sub.id,
    billingId,
    periodStart,
    periodEnd,
  });

  if (decision.eligible) {
    await pool.query(
      `UPDATE tenant_billing
       SET period_start = $1::date,
           period_end = $2::date,
           updated_at = now()
       WHERE id = $3::uuid AND tenant_id = $4::uuid`,
      [periodStart, periodEnd, billingId, billing.tenant_id]
    );
    const cancelled = await cancelOpenPlanRenewalBillingsForTenant(billing.tenant_id, billingId);
    await cancelRenewalSiblingGatewayCharges(cancelled, billing.tenant_id);
  }

  const confirmedAt = new Date().toISOString();
  await updateInvoiceGatewayData(billingId, {
    gateway: billing.gateway ?? 'asaas',
    payment_method: billing.payment_method,
    gateway_reference_id: billing.gateway_reference_id,
    gateway_status: billing.gateway_status,
    gateway_metadata: {
      ...meta,
      asaas_renewal_confirmed_at: confirmedAt,
      renewal_confirmed_at: confirmedAt,
      renewal_period_start: periodStart,
      renewal_period_end: periodEnd,
      ...(decision.eligible ? { late_renewal_restart_at: confirmedAt } : {}),
    },
  });

  billingLog('invoice', 'asaas_subscription_renewal_confirmed', {
    billing_id: billingId,
    subscription_id: sub.id,
    period_start: periodStart,
    period_end: periodEnd,
    billing_cycle_count: nextCount,
    late_renewal_restart: decision.eligible,
  });

  return { confirmed: true, detail: decision.eligible ? 'restarted' : 'confirmed' };
}

/**
 * Recusa / overdue de cartão da Assinatura: status claro, sem alterar snapshot CS.
 */
export async function markAsaasSubscriptionPaymentFailed(params: {
  billingId: string;
  gatewayStatus: string | null;
  eventType?: string | null;
}): Promise<void> {
  const billing = await getInvoiceById(params.billingId);
  if (!billing || billing.status === 'paid') return;

  const meta = (billing.gateway_metadata as Record<string, unknown> | null) ?? {};
  await updateInvoiceGatewayData(params.billingId, {
    gateway: billing.gateway ?? 'asaas',
    payment_method: billing.payment_method ?? 'CREDIT_CARD',
    gateway_reference_id: billing.gateway_reference_id,
    gateway_status: params.gatewayStatus ?? billing.gateway_status,
    gateway_metadata: {
      ...meta,
      card_capture_refused:
        params.eventType === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED' ||
        String(params.gatewayStatus ?? '')
          .toUpperCase()
          .includes('REFUSED'),
      last_card_failure_event: params.eventType ?? null,
      last_card_failure_at: new Date().toISOString(),
    },
  });

  const subId = billing.subscription_id;
  if (!subId) return;

  try {
    const { markSubscriptionPastDue } = await import(
      './collectionPolicy/subscriptionPastDueWriter.js'
    );
    const { tenantBillingCorrelationId } = await import('./billing2/billingCorrelationId.js');
    await markSubscriptionPastDue({
      subscriptionId: subId,
      reason:
        params.eventType === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'
          ? 'asaas_credit_card_capture_refused'
          : 'asaas_subscription_payment_overdue',
      correlationId: tenantBillingCorrelationId(params.billingId),
      skipEligibilityCheck: params.eventType === 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
    });
  } catch (e) {
    console.warn('[CA S3] mark past_due on card failure skipped', e);
  }
}

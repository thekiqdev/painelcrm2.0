/**
 * Assinaturas CRM (subscriptions.type = customer) — listagem e detalhe para o painel.
 * Não altera o motor de recorrência; apenas leituras e ações já suportadas (reagendar, cancelar).
 */
import { pool } from '../utils/db.js';
import {
  getSubscriptionById,
  patchSubscriptionCyclesConfig,
  type SubscriptionRow,
} from './billingSubscriptionService.js';
import { isSubscriptionCyclesReadEnabled } from './subscriptionCyclesReadFlagService.js';
import {
  listSubscriptionCyclesBySubscriptionId,
  type SubscriptionCycleDbRow,
} from './subscriptionCyclesQueryService.js';
import {
  cancelPendingRenewalJobsForSubscription,
  patchCustomerSubscriptionNextBillingFromSubscriptionId,
  type PatchNextBillingFromInvoiceResult,
} from './customerInvoiceRecurrenceNextBillingService.js';
import { billingRecurringJobsHasCompletionColumns } from './billingRecurringJobsOpsService.js';
import {
  buildSubscriptionAutomationSummary,
  buildSubscriptionTimeline,
  type CrmSubscriptionAutomationSummary,
  type CrmSubscriptionTimelineRowUx,
} from './subscriptionTimelineUx.js';
import { validateBillingRuntime, type BillingRuntimeValidationResult } from '../billingRuntime/billingRuntimeValidator.js';
import {
  getPendingCrmSubscriptionContract,
  type CrmPendingContractMetadata,
} from './crmSubscriptionsContractService.js';
import { getSubscriptionLifecycleEventsForTimeline } from './crmSubscriptionsLifecycleService.js';

export interface CrmSubscriptionListRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  /** true quando a assinatura não tem customer_id (ex.: checkout por link). */
  link_checkout: boolean;
  plan_label: string | null;
  amount_cents: number;
  billing_interval: string;
  next_billing_date: string;
  status: string;
  cancel_at_period_end: boolean;
  cycles_unlimited: boolean;
  max_cycles: number | null;
}

export interface CrmSubscriptionInvoiceRow {
  id: string;
  invoice_number: string | null;
  amount_cents: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  invoice_type: string;
  description: string | null;
  created_at: string;
  gateway_status: string | null;
  gateway_reference_id: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
}

export interface CrmSubscriptionStats {
  total_invoiced_cents: number;
  total_paid_cents: number;
  total_pending_cents: number;
  charge_count: number;
}

/** Timeline operacional (UX); ver `subscriptionTimelineUx.ts`. */
export type CrmSubscriptionTimelineRow = CrmSubscriptionTimelineRowUx;

export type { CrmSubscriptionAutomationSummary };

export interface CrmSubscriptionJobRow {
  id: string;
  cycle_key: string;
  status: string;
  scheduled_at: string;
  retry_at: string | null;
  attempts: number;
  max_attempts: number;
  result_invoice_id: string | null;
  error_message: string | null;
  completion_outcome: string | null;
  completion_detail: string | null;
  updated_at: string;
}

export interface CrmSubscriptionTenantBillingPrefs {
  timezone: string | null;
  recurring_generate_time_local: string | null;
  invoice_notify_same_as_generation: boolean | null;
  invoice_notify_time_local: string | null;
  /** Dias antes de `next_billing_date` para enfileirar geração (0 = no dia do vencimento). */
  recurring_invoice_generate_days_before_due: number | null;
}

export interface CrmSubscriptionDetail {
  subscription: SubscriptionRow;
  client_name: string | null;
  plan_label: string | null;
  latest_invoice_id: string | null;
  latest_invoice_status: string | null;
  latest_paid_invoice_id: string | null;
  stats: CrmSubscriptionStats;
  timeline: CrmSubscriptionTimelineRow[];
  automation_summary: CrmSubscriptionAutomationSummary;
  cycles_raw: SubscriptionCycleDbRow[];
  cycles_read_enabled: boolean;
  invoices: Array<{
    id: string;
    subscription_cycle_id: string | null;
    amount_cents: number;
    due_date: string;
    period_start: string | null;
    period_end: string | null;
    status: string;
    created_at: string;
    gateway_status: string | null;
    gateway_reference_id: string | null;
    invoice_type: string | null;
    paid_at: string | null;
    refunded_at: string | null;
  }>;
  tenant_billing: CrmSubscriptionTenantBillingPrefs;
  recent_jobs: CrmSubscriptionJobRow[];
  pending_contract: CrmPendingContractMetadata | null;
  runtime_validation: BillingRuntimeValidationResult;
}

function billingIntervalLabelPt(interval: string): string {
  const m: Record<string, string> = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semi_annual: 'Semestral',
    yearly: 'Anual',
  };
  return m[interval] ?? interval;
}

export async function listCrmCustomerSubscriptions(tenantId: string): Promise<CrmSubscriptionListRow[]> {
  try {
    const r = await pool.query<CrmSubscriptionListRow>(
      `SELECT s.id::text,
              crm.client_pk::text AS client_id,
              crm.display_name AS client_name,
              (s.customer_id IS NULL) AS link_checkout,
              s.amount_cents,
              s.billing_interval::text,
              s.status::text,
              s.next_billing_date::text AS next_billing_date,
              s.cancel_at_period_end,
              COALESCE(s.cycles_unlimited, true) AS cycles_unlimited,
              s.max_cycles,
              (SELECT ci.description FROM customer_invoices ci
               WHERE ci.tenant_id = s.tenant_id AND ci.subscription_id = s.id AND ci.origin = 'subscription'
                 AND ci.invoice_type IS DISTINCT FROM 'child'
               ORDER BY ci.created_at DESC LIMIT 1) AS plan_label
       FROM subscriptions s
       LEFT JOIN LATERAL (
         SELECT c.id AS client_pk,
                TRIM(COALESCE(
                  NULLIF(TRIM(c.name), ''),
                  NULLIF(TRIM(c.company), ''),
                  NULLIF(TRIM(c.email), '')
                )) AS display_name
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = s.tenant_id
         WHERE c.id = s.customer_id
         LIMIT 1
       ) crm ON true
       WHERE s.tenant_id = $1 AND s.type = 'customer'
       ORDER BY s.created_at DESC`,
      [tenantId]
    );
    return r.rows;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/cycles_unlimited|max_cycles/.test(msg)) throw e;
    const r = await pool.query<CrmSubscriptionListRow>(
      `SELECT s.id::text,
              crm.client_pk::text AS client_id,
              crm.display_name AS client_name,
              (s.customer_id IS NULL) AS link_checkout,
              s.amount_cents,
              s.billing_interval::text,
              s.status::text,
              s.next_billing_date::text AS next_billing_date,
              s.cancel_at_period_end,
              true AS cycles_unlimited,
              NULL::int AS max_cycles,
              (SELECT ci.description FROM customer_invoices ci
               WHERE ci.tenant_id = s.tenant_id AND ci.subscription_id = s.id AND ci.origin = 'subscription'
                 AND ci.invoice_type IS DISTINCT FROM 'child'
               ORDER BY ci.created_at DESC LIMIT 1) AS plan_label
       FROM subscriptions s
       LEFT JOIN LATERAL (
         SELECT c.id AS client_pk,
                TRIM(COALESCE(
                  NULLIF(TRIM(c.name), ''),
                  NULLIF(TRIM(c.company), ''),
                  NULLIF(TRIM(c.email), '')
                )) AS display_name
         FROM clients c
         INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = s.tenant_id
         WHERE c.id = s.customer_id
         LIMIT 1
       ) crm ON true
       WHERE s.tenant_id = $1 AND s.type = 'customer'
       ORDER BY s.created_at DESC`,
      [tenantId]
    );
    return r.rows;
  }
}

export async function patchCrmSubscriptionCyclesConfig(params: {
  tenantId: string;
  subscriptionId: string;
  cycles_unlimited: boolean;
  max_cycles: number | null;
}): Promise<SubscriptionRow | null> {
  const sub = await getSubscriptionById(params.subscriptionId);
  if (!sub || sub.tenant_id !== params.tenantId || sub.type !== 'customer') {
    return null;
  }
  return patchSubscriptionCyclesConfig({
    tenantId: params.tenantId,
    subscriptionId: params.subscriptionId,
    cycles_unlimited: params.cycles_unlimited,
    max_cycles: params.max_cycles,
  });
}

async function listInvoicesForSubscription(
  tenantId: string,
  subscriptionId: string
): Promise<CrmSubscriptionInvoiceRow[]> {
  const r = await pool.query<CrmSubscriptionInvoiceRow>(
    `SELECT id::text, invoice_number, amount_cents, due_date::text, period_start::text, period_end::text,
            status::text, invoice_type::text, description, created_at::text,
            gateway_status::text, gateway_reference_id::text,
            paid_at::text, NULL::text AS refunded_at
     FROM customer_invoices
     WHERE tenant_id = $1 AND subscription_id = $2
       AND invoice_type IS DISTINCT FROM 'child'
     ORDER BY COALESCE(period_start, due_date::date) DESC NULLS LAST, created_at DESC`,
    [tenantId, subscriptionId]
  );
  return r.rows;
}

function mapInvoicesWire(
  invRows: CrmSubscriptionInvoiceRow[],
  cycles: SubscriptionCycleDbRow[]
): CrmSubscriptionDetail['invoices'] {
  const cycleByInvoice = new Map<string, string>();
  for (const c of cycles) {
    if (c.invoice_id) cycleByInvoice.set(c.invoice_id, c.id);
  }
  return invRows.map((inv) => ({
    id: inv.id,
    subscription_cycle_id: cycleByInvoice.get(inv.id) ?? null,
    amount_cents: inv.amount_cents,
    due_date: inv.due_date,
    period_start: inv.period_start,
    period_end: inv.period_end,
    status: inv.status,
    created_at: inv.created_at,
    gateway_status: inv.gateway_status,
    gateway_reference_id: inv.gateway_reference_id,
    invoice_type: inv.invoice_type,
    paid_at: inv.paid_at ?? null,
    refunded_at: inv.refunded_at ?? null,
  }));
}

async function computeStats(tenantId: string, subscriptionId: string): Promise<CrmSubscriptionStats> {
  const r = await pool.query<{
    total_invoiced: string;
    total_paid: string;
    total_pending: string;
    charge_count: string;
  }>(
    `SELECT
       COALESCE(SUM(amount_cents), 0)::text AS total_invoiced,
       COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0)::text AS total_paid,
       COALESCE(SUM(amount_cents) FILTER (
         WHERE status IN ('pending', 'waiting_payment', 'processing', 'overdue')
       ), 0)::text AS total_pending,
       COUNT(*)::text AS charge_count
     FROM customer_invoices
     WHERE tenant_id = $1 AND subscription_id = $2
       AND invoice_type IS DISTINCT FROM 'child'`,
    [tenantId, subscriptionId]
  );
  const row = r.rows[0];
  return {
    total_invoiced_cents: parseInt(row?.total_invoiced ?? '0', 10),
    total_paid_cents: parseInt(row?.total_paid ?? '0', 10),
    total_pending_cents: parseInt(row?.total_pending ?? '0', 10),
    charge_count: parseInt(row?.charge_count ?? '0', 10),
  };
}

async function listRecentJobsForSubscription(
  tenantId: string,
  subscriptionId: string
): Promise<CrmSubscriptionJobRow[]> {
  const has = await billingRecurringJobsHasCompletionColumns();
  if (has) {
    const r = await pool.query<CrmSubscriptionJobRow>(
      `SELECT id::text, cycle_key::text, status::text, scheduled_at::text, retry_at::text,
              attempts, max_attempts, result_invoice_id::text, error_message::text,
              completion_outcome::text, completion_detail::text, updated_at::text
       FROM billing_recurring_jobs
       WHERE tenant_id = $1 AND subscription_id = $2
       ORDER BY updated_at DESC
       LIMIT 40`,
      [tenantId, subscriptionId]
    );
    return r.rows;
  }
  const r = await pool.query<CrmSubscriptionJobRow>(
    `SELECT id::text, cycle_key::text, status::text, scheduled_at::text, retry_at::text,
            attempts, max_attempts, result_invoice_id::text, error_message::text,
            NULL::text AS completion_outcome, NULL::text AS completion_detail, updated_at::text
     FROM billing_recurring_jobs
     WHERE tenant_id = $1 AND subscription_id = $2
     ORDER BY updated_at DESC
     LIMIT 40`,
    [tenantId, subscriptionId]
  );
  return r.rows;
}

export async function getCrmSubscriptionDetail(
  tenantId: string,
  subscriptionId: string
): Promise<CrmSubscriptionDetail | null> {
  const sub = await getSubscriptionById(subscriptionId);
  if (!sub || sub.tenant_id !== tenantId || sub.type !== 'customer') {
    return null;
  }

  const [clientRow, invRows, stats, cyclesRead, tenantRow] = await Promise.all([
    sub.customer_id
      ? pool.query<{ name: string | null }>(
          `SELECT TRIM(COALESCE(
               NULLIF(TRIM(c.name), ''),
               NULLIF(TRIM(c.company), ''),
               NULLIF(TRIM(c.email), '')
             )) AS name
           FROM clients c
           INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
           WHERE c.id = $1
           LIMIT 1`,
          [sub.customer_id, tenantId]
        )
      : Promise.resolve({ rows: [{ name: null }] } as { rows: { name: string | null }[] }),
    listInvoicesForSubscription(tenantId, subscriptionId),
    computeStats(tenantId, subscriptionId),
    isSubscriptionCyclesReadEnabled(),
    pool.query<CrmSubscriptionTenantBillingPrefs>(
      `SELECT timezone::text, recurring_generate_time_local::text, invoice_notify_same_as_generation,
              invoice_notify_time_local::text,
              recurring_invoice_generate_days_before_due
       FROM tenants WHERE id = $1 LIMIT 1`,
      [tenantId]
    ),
  ]);

  const cycles = cyclesRead ? await listSubscriptionCyclesBySubscriptionId(tenantId, subscriptionId, 120) : [];

  const planLabel =
    invRows.find((i) => i.description && i.description.trim())?.description?.trim() ?? null;

  const latestInvoice = invRows[0] ?? null;
  const paidInv = [...invRows].sort((a, b) => {
    if (a.status === 'paid' && b.status !== 'paid') return -1;
    if (b.status === 'paid' && a.status !== 'paid') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const latestPaid = paidInv.find((i) => i.status === 'paid') ?? null;

  const recent_jobs = await listRecentJobsForSubscription(tenantId, subscriptionId);
  const pending_contract = await getPendingCrmSubscriptionContract(subscriptionId);
  const lifecycle_events = await getSubscriptionLifecycleEventsForTimeline(tenantId, subscriptionId);

  const runtime_validation = await validateBillingRuntime(tenantId, subscriptionId);

  const timeline = buildSubscriptionTimeline(
    cycles,
    invRows,
    sub.amount_cents,
    cyclesRead,
    recent_jobs,
    lifecycle_events,
    sub.status
  );
  const tenant_billing = tenantRow.rows[0] ?? {
    timezone: null,
    recurring_generate_time_local: null,
    invoice_notify_same_as_generation: null,
    invoice_notify_time_local: null,
    recurring_invoice_generate_days_before_due: 0,
  };
  const automation_summary = buildSubscriptionAutomationSummary({
    subscriptionStatus: sub.status,
    nextBillingDate: sub.next_billing_date,
    billingInterval: sub.billing_interval,
    lastJobAt: sub.last_job_at,
    recurringInvoiceGenerateDaysBeforeDue: tenant_billing.recurring_invoice_generate_days_before_due,
    recentJobs: recent_jobs,
    timeline,
  });
  const invoices = mapInvoicesWire(invRows, cycles);

  return {
    subscription: sub,
    client_name: clientRow.rows[0]?.name ?? null,
    plan_label: planLabel,
    latest_invoice_id: latestInvoice?.id ?? null,
    latest_invoice_status: latestInvoice?.status ?? null,
    latest_paid_invoice_id: latestPaid?.id ?? null,
    stats,
    timeline,
    automation_summary,
    cycles_raw: cycles,
    cycles_read_enabled: cyclesRead,
    invoices,
    tenant_billing,
    recent_jobs,
    pending_contract,
    runtime_validation,
  };
}

/** Expõe rótulos PT para a UI sem duplicar mapas no front. */
export function crmSubscriptionMeta(sub: SubscriptionRow) {
  return {
    periodicity_label_pt: billingIntervalLabelPt(sub.billing_interval),
  };
}

export async function cancelCrmCustomerSubscription(params: {
  tenantId: string;
  subscriptionId: string;
  mode: 'immediate' | 'end_of_period';
}): Promise<{ ok: boolean; error?: string; subscription?: SubscriptionRow }> {
  const sub = await getSubscriptionById(params.subscriptionId);
  if (!sub || sub.tenant_id !== params.tenantId) {
    return { ok: false, error: 'Assinatura não encontrada' };
  }
  if (sub.type !== 'customer') {
    return { ok: false, error: 'Operação disponível apenas para assinaturas de cliente' };
  }
  if (sub.status !== 'active') {
    return { ok: false, error: 'Assinatura não está ativa' };
  }

  if (params.mode === 'immediate') {
    await pool.query(
      `UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = now(), cancel_at_period_end = false, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [params.subscriptionId, params.tenantId]
    );
    await cancelPendingRenewalJobsForSubscription(params.subscriptionId, {
      detail: { reason: 'subscription_cancelled_immediate_crm', subscription_id: params.subscriptionId },
    });
  } else {
    await pool.query(
      `UPDATE subscriptions SET cancel_at_period_end = true, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [params.subscriptionId, params.tenantId]
    );
  }

  const updated = await getSubscriptionById(params.subscriptionId);
  return { ok: true, subscription: updated ?? undefined };
}

export async function patchCrmSubscriptionNextBilling(params: {
  tenantId: string;
  subscriptionId: string;
  nextBillingDateYmd: string;
  actorUserId?: string | null;
}): Promise<PatchNextBillingFromInvoiceResult> {
  return patchCustomerSubscriptionNextBillingFromSubscriptionId({
    tenantId: params.tenantId,
    subscriptionId: params.subscriptionId,
    nextBillingDateYmd: params.nextBillingDateYmd,
    actorUserId: params.actorUserId,
  });
}

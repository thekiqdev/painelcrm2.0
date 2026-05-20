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
}

export interface CrmSubscriptionStats {
  total_invoiced_cents: number;
  total_paid_cents: number;
  total_pending_cents: number;
  charge_count: number;
}

export interface CrmSubscriptionTimelineRow {
  month_ref: string;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  status_pt: string;
  amount_cents: number | null;
  invoice_id: string | null;
  cycle_status: string | null;
  cycle_id: string | null;
  job_id: string | null;
  invoice_status: string | null;
  gateway_status: string | null;
  gateway_reference_id: string | null;
}

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
  cycles_raw: SubscriptionCycleDbRow[];
  cycles_read_enabled: boolean;
  tenant_billing: CrmSubscriptionTenantBillingPrefs;
  recent_jobs: CrmSubscriptionJobRow[];
}

function billingIntervalLabelPt(interval: string): string {
  const m: Record<string, string> = {
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semi_annual: 'Semestral',
    yearly: 'Anual',
  };
  return m[interval] ?? interval;
}

function invoiceStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Pendente',
    waiting_payment: 'Aguardando pagamento',
    processing: 'Processando',
    paid: 'Pago',
    overdue: 'Vencido',
    cancelled: 'Cancelado',
    failed: 'Falhou',
    refunded: 'Reembolsado',
  };
  return m[status] ?? status;
}

function cycleStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Aguardando geração automática',
    queued: 'Processamento agendado',
    processing: 'Processando cobrança',
    invoiced: 'Fatura gerada',
    skipped: 'Sem nova fatura',
    failed: 'Falha na geração',
    cancelled: 'Cancelado',
  };
  return m[status] ?? status;
}

function formatPeriodPt(start: string | null, end: string | null): string {
  if (start && end) return `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)} – ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`;
  if (start) return start.slice(0, 10);
  return '—';
}

function monthRefFromYmd(ymd: string | null | undefined): string {
  if (!ymd || ymd.length < 7) return '—';
  return `${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}

function buildTimeline(
  cycles: SubscriptionCycleDbRow[],
  invoices: CrmSubscriptionInvoiceRow[],
  subscriptionAmountCents: number,
  cyclesReadEnabled: boolean
): CrmSubscriptionTimelineRow[] {
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const rows: CrmSubscriptionTimelineRow[] = [];
  const usedInvoiceIds = new Set<string>();

  if (cyclesReadEnabled && cycles.length > 0) {
    for (const c of cycles) {
      const inv = c.invoice_id ? invById.get(c.invoice_id) : undefined;
      if (inv) usedInvoiceIds.add(inv.id);
      const ps = c.period_start?.slice(0, 10) ?? inv?.period_start?.slice(0, 10) ?? null;
      const pe = c.period_end?.slice(0, 10) ?? inv?.period_end?.slice(0, 10) ?? null;
      const due = inv?.due_date?.slice(0, 10) ?? ps;
      const amount = inv?.amount_cents ?? subscriptionAmountCents;
      let status_pt: string;
      if (inv) {
        status_pt = invoiceStatusLabelPt(inv.status);
      } else {
        status_pt = cycleStatusLabelPt(c.status);
      }
      rows.push({
        month_ref: monthRefFromYmd(c.cycle_date?.slice(0, 10) ?? ps),
        period_label: formatPeriodPt(ps, pe),
        period_start: ps,
        period_end: pe,
        due_date: due,
        status_pt,
        amount_cents: amount,
        invoice_id: c.invoice_id,
        cycle_status: c.status,
        cycle_id: c.id,
        job_id: c.job_id,
        invoice_status: inv?.status ?? null,
        gateway_status: inv?.gateway_status ?? null,
        gateway_reference_id: inv?.gateway_reference_id ?? null,
      });
    }
  }

  for (const inv of invoices) {
    if (usedInvoiceIds.has(inv.id)) continue;
    const ps = inv.period_start?.slice(0, 10) ?? null;
    const pe = inv.period_end?.slice(0, 10) ?? null;
    rows.push({
      month_ref: monthRefFromYmd(ps ?? inv.due_date?.slice(0, 10)),
      period_label: formatPeriodPt(ps, pe),
      period_start: ps,
      period_end: pe,
      due_date: inv.due_date?.slice(0, 10) ?? null,
      status_pt: invoiceStatusLabelPt(inv.status),
      amount_cents: inv.amount_cents,
      invoice_id: inv.id,
      cycle_status: null,
      cycle_id: null,
      job_id: null,
      invoice_status: inv.status,
      gateway_status: inv.gateway_status ?? null,
      gateway_reference_id: inv.gateway_reference_id ?? null,
    });
  }

  rows.sort((a, b) => {
    const da = a.period_start ?? a.due_date ?? '';
    const db = b.period_start ?? b.due_date ?? '';
    return db.localeCompare(da);
  });

  return rows;
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
            gateway_status::text, gateway_reference_id::text
     FROM customer_invoices
     WHERE tenant_id = $1 AND subscription_id = $2
       AND invoice_type IS DISTINCT FROM 'child'
     ORDER BY COALESCE(period_start, due_date::date) DESC NULLS LAST, created_at DESC`,
    [tenantId, subscriptionId]
  );
  return r.rows;
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

  const timeline = buildTimeline(cycles, invRows, sub.amount_cents, cyclesRead);
  const recent_jobs = await listRecentJobsForSubscription(tenantId, subscriptionId);

  return {
    subscription: sub,
    client_name: clientRow.rows[0]?.name ?? null,
    plan_label: planLabel,
    latest_invoice_id: latestInvoice?.id ?? null,
    latest_invoice_status: latestInvoice?.status ?? null,
    latest_paid_invoice_id: latestPaid?.id ?? null,
    stats,
    timeline,
    cycles_raw: cycles,
    cycles_read_enabled: cyclesRead,
    tenant_billing: tenantRow.rows[0] ?? {
      timezone: null,
      recurring_generate_time_local: null,
      invoice_notify_same_as_generation: null,
      invoice_notify_time_local: null,
      recurring_invoice_generate_days_before_due: 0,
    },
    recent_jobs,
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

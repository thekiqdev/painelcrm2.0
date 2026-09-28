/**
 * Leitura Super Admin — Assinaturas SaaS (Billing 2.0 Sprint 5).
 */
import { pool } from '../../utils/db.js';
import { SQL_T_IS_PLATFORM_CUSTOMER } from '../../partner/superadminTenantListScope.js';

export type SaasSubscriptionListItem = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_status: string;
  plan_id: string | null;
  plan_name: string | null;
  amount_cents: number;
  contracted_amount_cents: number | null;
  billing_interval: string;
  status: string;
  next_billing_date: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  default_payment_method: string | null;
  grace_period_days: number | null;
  last_job_at: string | null;
  created_at: string;
  /** Open overdue invoice count (não confundir com tenant pending) */
  overdue_invoices_count: number;
};

export type SaasSubscriptionInvoiceSummary = {
  id: string;
  status: string;
  amount_cents: number;
  due_date: string;
  paid_at: string | null;
  payment_method: string | null;
  invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

export type SaasSubscriptionAuditSummary = {
  id: string;
  action: string;
  actor: string;
  reason: string | null;
  created_at: string;
};

export type SaasSubscriptionDetail = SaasSubscriptionListItem & {
  users_count: number | null;
  gateway: string | null;
  contracted_at: string | null;
  contracted_billing_interval: string | null;
  contract_currency: string | null;
  updated_at: string;
  /** Sprint 10 */
  pix_automatic_auth_status: string | null;
  pix_automatic_authorized_at: string | null;
  recent_invoices: SaasSubscriptionInvoiceSummary[];
  recent_audit: SaasSubscriptionAuditSummary[];
};

const LIST_SELECT = `
  s.id, s.tenant_id, s.plan_id, s.amount_cents, s.billing_interval, s.status,
  s.next_billing_date::text AS next_billing_date,
  s.current_period_start::text AS current_period_start,
  s.current_period_end::text AS current_period_end,
  s.cancel_at_period_end, s.default_payment_method, s.grace_period_days,
  s.last_job_at, s.created_at,
  s.contracted_plan_price_cents,
  t.name AS tenant_name,
  t.status AS tenant_status,
  p.name AS plan_name,
  (
    SELECT COUNT(*)::int FROM tenant_billing tb
    WHERE tb.subscription_id = s.id AND tb.status = 'overdue'
  ) AS overdue_invoices_count
`;

function mapListRow(row: Record<string, unknown>): SaasSubscriptionListItem {
  const amount = Number(row.amount_cents ?? 0);
  const contracted =
    row.contracted_plan_price_cents != null ? Number(row.contracted_plan_price_cents) : null;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    tenant_name: String(row.tenant_name ?? ''),
    tenant_status: String(row.tenant_status ?? ''),
    plan_id: row.plan_id != null ? String(row.plan_id) : null,
    plan_name: row.plan_name != null ? String(row.plan_name) : null,
    amount_cents: amount,
    contracted_amount_cents: contracted,
    billing_interval: String(row.billing_interval ?? ''),
    status: String(row.status ?? ''),
    next_billing_date: String(row.next_billing_date ?? ''),
    current_period_start: row.current_period_start != null ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end != null ? String(row.current_period_end) : null,
    cancel_at_period_end: row.cancel_at_period_end === true,
    default_payment_method: row.default_payment_method != null ? String(row.default_payment_method) : null,
    grace_period_days: row.grace_period_days != null ? Number(row.grace_period_days) : null,
    last_job_at: row.last_job_at != null ? String(row.last_job_at) : null,
    created_at: String(row.created_at ?? ''),
    overdue_invoices_count: Number(row.overdue_invoices_count ?? 0),
  };
}

export type ListSaasSubscriptionsQuery = {
  status?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

export async function listSaasSubscriptionsForSuperadmin(
  query: ListSaasSubscriptionsQuery = {}
): Promise<{ subscriptions: SaasSubscriptionListItem[]; total: number }> {
  const limit = Math.min(200, Math.max(1, query.limit ?? 100));
  const offset = Math.max(0, query.offset ?? 0);
  const status = query.status?.trim() || null;
  const q = query.q?.trim() || null;

  const params: unknown[] = [];
  const where: string[] = [`s.type = 'saas'`, SQL_T_IS_PLATFORM_CUSTOMER];

  if (status && status !== 'all') {
    params.push(status);
    where.push(`s.status = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(t.name ILIKE $${params.length} OR p.name ILIKE $${params.length} OR s.id::text ILIKE $${params.length})`
    );
  }

  const whereSql = where.join(' AND ');

  const countR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE ${whereSql}`,
    params
  );
  const total = parseInt(countR.rows[0]?.c ?? '0', 10) || 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const r = await pool.query(
    `SELECT ${LIST_SELECT}
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE ${whereSql}
     ORDER BY
       CASE s.status
         WHEN 'past_due' THEN 0
         WHEN 'active' THEN 1
         WHEN 'paused' THEN 2
         WHEN 'trialing' THEN 3
         ELSE 4
       END,
       s.next_billing_date ASC NULLS LAST
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  return {
    subscriptions: r.rows.map((row) => mapListRow(row as Record<string, unknown>)),
    total,
  };
}

export async function getSaasSubscriptionDetailForSuperadmin(
  subscriptionId: string
): Promise<SaasSubscriptionDetail | null> {
  const r = await pool.query(
    `SELECT ${LIST_SELECT},
            s.users_count, s.gateway, s.updated_at,
            s.contracted_at::text AS contracted_at,
            s.contracted_billing_interval,
            s.contract_currency,
            s.pix_automatic_auth_status,
            s.pix_automatic_authorized_at::text AS pix_automatic_authorized_at
     FROM subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.id = $1 AND s.type = 'saas'`,
    [subscriptionId]
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const base = mapListRow(row);

  const invoices = await pool.query(
    `SELECT id, status, amount_cents, due_date::text AS due_date, paid_at,
            payment_method, invoice_number,
            period_start::text AS period_start, period_end::text AS period_end,
            created_at
     FROM tenant_billing
     WHERE subscription_id = $1
     ORDER BY COALESCE(due_date, created_at::date) DESC, created_at DESC
     LIMIT 20`,
    [subscriptionId]
  );

  let recent_audit: SaasSubscriptionAuditSummary[] = [];
  try {
    const audit = await pool.query(
      `SELECT id::text AS id, action, actor, reason, created_at
       FROM billing_audit_events
       WHERE (entity_type = 'subscription' AND entity_id = $1)
          OR (entity_type = 'tenant_billing' AND entity_id IN (
                SELECT id::text FROM tenant_billing WHERE subscription_id = $1::uuid LIMIT 50
              ))
       ORDER BY created_at DESC
       LIMIT 20`,
      [subscriptionId]
    );
    recent_audit = audit.rows.map((a) => ({
      id: String(a.id),
      action: String(a.action),
      actor: String(a.actor),
      reason: a.reason != null ? String(a.reason) : null,
      created_at: String(a.created_at),
    }));
  } catch {
    recent_audit = [];
  }

  return {
    ...base,
    users_count: row.users_count != null ? Number(row.users_count) : null,
    gateway: row.gateway != null ? String(row.gateway) : null,
    contracted_at: row.contracted_at != null ? String(row.contracted_at) : null,
    contracted_billing_interval:
      row.contracted_billing_interval != null ? String(row.contracted_billing_interval) : null,
    contract_currency: row.contract_currency != null ? String(row.contract_currency) : null,
    updated_at: String(row.updated_at ?? ''),
    pix_automatic_auth_status:
      row.pix_automatic_auth_status != null ? String(row.pix_automatic_auth_status) : null,
    pix_automatic_authorized_at:
      row.pix_automatic_authorized_at != null ? String(row.pix_automatic_authorized_at) : null,
    recent_invoices: invoices.rows.map((inv) => ({
      id: String(inv.id),
      status: String(inv.status),
      amount_cents: Number(inv.amount_cents ?? 0),
      due_date: String(inv.due_date ?? ''),
      paid_at: inv.paid_at != null ? String(inv.paid_at) : null,
      payment_method: inv.payment_method != null ? String(inv.payment_method) : null,
      invoice_number: inv.invoice_number != null ? String(inv.invoice_number) : null,
      period_start: inv.period_start != null ? String(inv.period_start) : null,
      period_end: inv.period_end != null ? String(inv.period_end) : null,
      created_at: String(inv.created_at ?? ''),
    })),
    recent_audit,
  };
}

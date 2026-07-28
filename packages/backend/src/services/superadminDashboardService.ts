import { pool } from '../utils/db.js';
import { getGatewaysStatus } from './paymentGatewayConfigService.js';
import { getSmtpSuperadminSettings } from './smtpSuperadminSettingsService.js';
import { getDashboardMrrSnapshot } from './billing2/dashboardMrr.js';

type DashboardSeverity = 'info' | 'warning' | 'critical';
type DashboardGatewayStatus = 'configured' | 'not_configured' | 'unknown';

type DayCountRow = { date: string; count: number };

export type SuperadminDashboardPayload = {
  generated_at: string;
  financial: {
    mrr_cents: number;
    /** Sempre calculado — preço de lista × tenants active */
    mrr_catalog_cents: number;
    /** Sempre calculado — subscriptions SaaS active+past_due */
    mrr_contracted_cents: number;
    /** Fonte efetiva de `mrr_cents` (flag dashboard_mrr_contracted) */
    mrr_source: 'catalog' | 'contracted';
    arr_cents: number;
    received_this_month_cents: number;
    pending_cents: number;
    overdue_cents: number;
    failed_cents: number;
    refunded_cents: number;
    open_billing_count: number;
    overdue_billing_count: number;
    paid_this_month_count: number;
    value_at_risk_cents: number;
    renewals_due_30d_count: number;
    renewals_due_30d_cents: number;
    /** Sprint 8 — pagos após vencimento nos últimos 30d (proxy de recuperação) */
    recovered_30d_cents: number;
    recovered_30d_count: number;
    definitions?: Record<string, string>;
  };
  subscriptions: {
    active_tenants: number;
    trial_tenants: number;
    suspended_tenants: number;
    cancelled_tenants: number;
    total_tenants: number;
    trials_expiring_soon: number;
    trial_expired: number;
    /** Contratos SaaS (subscriptions), não tenants */
    saas_active_count: number;
    saas_past_due_count: number;
  };
  growth: {
    new_tenants_30d: number;
    new_users_30d: number;
    tenants_by_day_30d: Array<{ date: string; count: number }>;
    users_by_day_30d: Array<{ date: string; count: number }>;
  };
  plans: {
    total_plans: number;
    by_plan: Array<{
      plan_id: string;
      plan_name: string;
      tenants_count: number;
      active_tenants_count: number;
      estimated_mrr_cents: number;
    }>;
  };
  operational: {
    gateways: Array<{
      gateway: string;
      status: DashboardGatewayStatus;
    }>;
    whatsapp_instances: {
      total: number;
      connected: number;
      disconnected: number;
    };
    smtp: {
      configured: boolean;
      enabled: boolean;
    };
    failed_jobs_count?: number;
  };
  recent: {
    tenants: Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      created_at: string;
      plan_name: string | null;
    }>;
    users: Array<{
      id: string;
      email: string;
      name: string | null;
      created_at: string;
      tenant_name: string | null;
    }>;
    payments: Array<{
      id: string;
      tenant_id: string;
      tenant_name: string | null;
      amount_cents: number;
      status: string;
      gateway: string | null;
      paid_at: string | null;
      created_at: string;
    }>;
  };
  alerts: Array<{
    type: string;
    severity: DashboardSeverity;
    title: string;
    description: string;
    count?: number;
  }>;
  // Compatibilidade com dashboard atual
  totals: {
    plans: number;
    tenants: number;
    active_tenants: number;
    users: number;
  };
  recent_tenants: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    plan_name: string | null;
  }>;
  recent_users: Array<{
    id: string;
    email: string;
    created_at: string;
    tenant_name: string | null;
  }>;
};

function safeInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

function toGatewayStatus(configured: boolean | null | undefined): DashboardGatewayStatus {
  if (configured === true) return 'configured';
  if (configured === false) return 'not_configured';
  return 'unknown';
}

export async function getSuperadminDashboardSnapshot(): Promise<SuperadminDashboardPayload> {
  const currentMonthStart = new Date();
  currentMonthStart.setUTCDate(1);
  currentMonthStart.setUTCHours(0, 0, 0, 0);

  const [financialAgg, tenantStatusAgg, growthAgg, planAgg, recentTenants, recentUsers, recentPayments, usersTotalR] =
    await Promise.all([
      pool.query<{
        received_this_month_cents: string;
        pending_cents: string;
        overdue_cents: string;
        failed_cents: string;
        refunded_cents: string;
        open_billing_count: string;
        overdue_billing_count: string;
        paid_this_month_count: string;
        recovered_30d_cents: string;
        recovered_30d_count: string;
      }>(
        `SELECT
           COALESCE(SUM(tb.amount_cents) FILTER (WHERE tb.status = 'paid' AND tb.paid_at >= date_trunc('month', now())), 0)::text AS received_this_month_cents,
           COALESCE(SUM(tb.amount_cents) FILTER (WHERE tb.status IN ('pending','waiting_payment','processing')), 0)::text AS pending_cents,
           COALESCE(SUM(tb.amount_cents) FILTER (WHERE tb.status = 'overdue' OR (tb.status IN ('pending','waiting_payment','processing') AND tb.due_date < CURRENT_DATE)), 0)::text AS overdue_cents,
           COALESCE(SUM(tb.amount_cents) FILTER (WHERE tb.status = 'failed'), 0)::text AS failed_cents,
           COALESCE(SUM(tb.amount_cents) FILTER (WHERE tb.status = 'refunded'), 0)::text AS refunded_cents,
           COUNT(*) FILTER (WHERE tb.status IN ('pending','waiting_payment','processing','overdue'))::text AS open_billing_count,
           COUNT(*) FILTER (WHERE tb.status = 'overdue' OR (tb.status IN ('pending','waiting_payment','processing') AND tb.due_date < CURRENT_DATE))::text AS overdue_billing_count,
           COUNT(*) FILTER (WHERE tb.status = 'paid' AND tb.paid_at >= date_trunc('month', now()))::text AS paid_this_month_count,
           COALESCE(SUM(tb.amount_cents) FILTER (
             WHERE tb.status = 'paid'
               AND tb.paid_at >= now() - interval '30 days'
               AND tb.due_date IS NOT NULL
               AND tb.paid_at::date > tb.due_date
           ), 0)::text AS recovered_30d_cents,
           COUNT(*) FILTER (
             WHERE tb.status = 'paid'
               AND tb.paid_at >= now() - interval '30 days'
               AND tb.due_date IS NOT NULL
               AND tb.paid_at::date > tb.due_date
           )::text AS recovered_30d_count
         FROM tenant_billing tb`,
      ),
      pool.query<{
        total_tenants: string;
        active_tenants: string;
        trial_tenants: string;
        suspended_tenants: string;
        trials_expiring_soon: string;
        trial_expired: string;
      }>(
        `SELECT
           COUNT(*)::text AS total_tenants,
           COUNT(*) FILTER (WHERE t.status = 'active')::text AS active_tenants,
           COUNT(*) FILTER (WHERE t.status = 'trial')::text AS trial_tenants,
           COUNT(*) FILTER (WHERE t.status = 'suspended')::text AS suspended_tenants,
           COUNT(*) FILTER (WHERE t.status = 'trial' AND t.trial_ends_at IS NOT NULL AND t.trial_ends_at > now() AND t.trial_ends_at <= now() + interval '7 days')::text AS trials_expiring_soon,
           COUNT(*) FILTER (WHERE t.status = 'trial' AND t.trial_ends_at IS NOT NULL AND t.trial_ends_at <= now())::text AS trial_expired
         FROM tenants t`,
      ),
      Promise.all([
        pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c
           FROM tenants
           WHERE created_at >= now() - interval '30 days'`,
        ),
        pool.query<{ c: string }>(
          `SELECT COUNT(*)::text AS c
           FROM users
           WHERE created_at >= now() - interval '30 days'`,
        ),
        pool.query<DayCountRow>(
          `WITH series AS (
             SELECT generate_series(
               (CURRENT_DATE - interval '29 days')::date,
               CURRENT_DATE::date,
               interval '1 day'
             )::date AS d
           ),
           agg AS (
             SELECT created_at::date AS d, COUNT(*)::int AS c
             FROM tenants
             WHERE created_at >= CURRENT_DATE - interval '29 days'
             GROUP BY created_at::date
           )
           SELECT to_char(series.d, 'YYYY-MM-DD') AS date, COALESCE(agg.c, 0)::int AS count
           FROM series
           LEFT JOIN agg ON agg.d = series.d
           ORDER BY series.d ASC`,
        ),
        pool.query<DayCountRow>(
          `WITH series AS (
             SELECT generate_series(
               (CURRENT_DATE - interval '29 days')::date,
               CURRENT_DATE::date,
               interval '1 day'
             )::date AS d
           ),
           agg AS (
             SELECT created_at::date AS d, COUNT(*)::int AS c
             FROM users
             WHERE created_at >= CURRENT_DATE - interval '29 days'
             GROUP BY created_at::date
           )
           SELECT to_char(series.d, 'YYYY-MM-DD') AS date, COALESCE(agg.c, 0)::int AS count
           FROM series
           LEFT JOIN agg ON agg.d = series.d
           ORDER BY series.d ASC`,
        ),
      ]),
      Promise.all([
        pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM plans`),
        pool.query<{
          plan_id: string;
          plan_name: string;
          tenants_count: string;
          active_tenants_count: string;
          estimated_mrr_cents: string;
        }>(
          `SELECT
             p.id::text AS plan_id,
             p.name AS plan_name,
             COUNT(t.id)::text AS tenants_count,
             COUNT(t.id) FILTER (WHERE t.status = 'active')::text AS active_tenants_count,
             COALESCE(
               SUM(
                 CASE
                   WHEN t.status = 'active' THEN
                     CASE
                       WHEN COALESCE(p.billing_interval, 'monthly') = 'yearly' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 12)
                       WHEN COALESCE(p.billing_interval, 'monthly') = 'quarterly' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 3)
                       WHEN COALESCE(p.billing_interval, 'monthly') = 'semi_annual' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 6)
                       ELSE COALESCE(p.price_cents, 0)::numeric
                     END
                   ELSE 0::numeric
                 END
               ),
               0
             )::bigint::text AS estimated_mrr_cents
           FROM plans p
           LEFT JOIN tenants t ON t.plan_id = p.id
           GROUP BY p.id, p.name, p.billing_interval, p.price_cents
           ORDER BY COUNT(t.id) DESC, p.name ASC`,
        ),
        pool.query<{ mrr_cents: string }>(
          `SELECT
             COALESCE(
               SUM(
                 CASE
                   WHEN COALESCE(p.billing_interval, 'monthly') = 'yearly' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 12)
                   WHEN COALESCE(p.billing_interval, 'monthly') = 'quarterly' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 3)
                   WHEN COALESCE(p.billing_interval, 'monthly') = 'semi_annual' THEN FLOOR(COALESCE(p.price_cents, 0)::numeric / 6)
                   ELSE COALESCE(p.price_cents, 0)::numeric
                 END
               ),
               0
             )::bigint::text AS mrr_cents
           FROM tenants t
           INNER JOIN plans p ON p.id = t.plan_id
           WHERE t.status = 'active'`,
        ),
        pool.query<{ cancelled_tenants: string }>(
          `SELECT COUNT(DISTINCT s.tenant_id)::text AS cancelled_tenants
           FROM subscriptions s
           WHERE s.type = 'saas'
             AND s.status = 'cancelled'
             AND NOT EXISTS (
               SELECT 1
               FROM subscriptions s2
               WHERE s2.type = 'saas'
                 AND s2.tenant_id = s.tenant_id
                 AND s2.status IN ('active', 'trialing')
             )`,
        ),
      ]),
      pool.query<{
        id: string;
        name: string;
        slug: string;
        status: string;
        created_at: string;
        plan_name: string | null;
      }>(
        `SELECT t.id::text, t.name, t.slug, t.status, t.created_at::text, p.name AS plan_name
         FROM tenants t
         LEFT JOIN plans p ON p.id = t.plan_id
         ORDER BY t.created_at DESC
         LIMIT 8`,
      ),
      pool.query<{
        id: string;
        email: string;
        name: string | null;
        created_at: string;
        tenant_name: string | null;
      }>(
        `SELECT
           u.id::text,
           u.email,
           NULLIF(TRIM(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')), '') AS name,
           u.created_at::text,
           t.name AS tenant_name
         FROM users u
         LEFT JOIN profiles pr ON pr.id = u.id
         LEFT JOIN tenants t ON t.id = u.tenant_id
         ORDER BY u.created_at DESC
         LIMIT 8`,
      ),
      pool.query<{
        id: string;
        tenant_id: string;
        tenant_name: string | null;
        amount_cents: string;
        status: string;
        gateway: string | null;
        paid_at: string | null;
        created_at: string;
      }>(
        `SELECT
           tb.id::text,
           tb.tenant_id::text,
           t.name AS tenant_name,
           tb.amount_cents::text,
           tb.status,
           tb.gateway,
           tb.paid_at::text,
           tb.created_at::text
         FROM tenant_billing tb
         LEFT JOIN tenants t ON t.id = tb.tenant_id
         ORDER BY tb.created_at DESC
         LIMIT 8`,
      ),
      pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM users'),
    ]);

  const [totalPlansR, byPlanR, mrrR, cancelledTenantsR] = planAgg;
  const [newTenants30dR, newUsers30dR, tenantsByDayR, usersByDayR] = growthAgg;

  const overdueCents = safeInt(financialAgg.rows[0]?.overdue_cents);
  const mrrSnap = await getDashboardMrrSnapshot(overdueCents).catch(async () => {
    // Fail-open: mantém catálogo legado se módulo MRR falhar
    const catalog = safeInt(mrrR.rows[0]?.mrr_cents);
    return {
      mrr_cents: catalog,
      mrr_catalog_cents: catalog,
      mrr_contracted_cents: catalog,
      arr_cents: catalog * 12,
      mrr_source: 'catalog' as const,
      saas_active_count: 0,
      saas_past_due_count: 0,
      renewals_due_30d_count: 0,
      renewals_due_30d_cents: 0,
      value_at_risk_cents: overdueCents,
      definitions: {},
    };
  });

  const financial = {
    mrr_cents: mrrSnap.mrr_cents,
    mrr_catalog_cents: mrrSnap.mrr_catalog_cents,
    mrr_contracted_cents: mrrSnap.mrr_contracted_cents,
    mrr_source: mrrSnap.mrr_source,
    arr_cents: mrrSnap.arr_cents,
    received_this_month_cents: safeInt(financialAgg.rows[0]?.received_this_month_cents),
    pending_cents: safeInt(financialAgg.rows[0]?.pending_cents),
    overdue_cents: overdueCents,
    failed_cents: safeInt(financialAgg.rows[0]?.failed_cents),
    refunded_cents: safeInt(financialAgg.rows[0]?.refunded_cents),
    open_billing_count: safeInt(financialAgg.rows[0]?.open_billing_count),
    overdue_billing_count: safeInt(financialAgg.rows[0]?.overdue_billing_count),
    paid_this_month_count: safeInt(financialAgg.rows[0]?.paid_this_month_count),
    value_at_risk_cents: mrrSnap.value_at_risk_cents,
    renewals_due_30d_count: mrrSnap.renewals_due_30d_count,
    renewals_due_30d_cents: mrrSnap.renewals_due_30d_cents,
    recovered_30d_cents: safeInt(financialAgg.rows[0]?.recovered_30d_cents),
    recovered_30d_count: safeInt(financialAgg.rows[0]?.recovered_30d_count),
    definitions: {
      ...mrrSnap.definitions,
      recovered_30d:
        'Receita recuperada (proxy 30d) = soma de faturas paid com paid_at nos últimos 30 dias e paid_at > due_date. Não exige dunning_enabled; aproximação do funil PRD §12.',
    },
  };

  const subscriptions = {
    active_tenants: safeInt(tenantStatusAgg.rows[0]?.active_tenants),
    trial_tenants: safeInt(tenantStatusAgg.rows[0]?.trial_tenants),
    suspended_tenants: safeInt(tenantStatusAgg.rows[0]?.suspended_tenants),
    cancelled_tenants: safeInt(cancelledTenantsR.rows[0]?.cancelled_tenants),
    total_tenants: safeInt(tenantStatusAgg.rows[0]?.total_tenants),
    trials_expiring_soon: safeInt(tenantStatusAgg.rows[0]?.trials_expiring_soon),
    trial_expired: safeInt(tenantStatusAgg.rows[0]?.trial_expired),
    saas_active_count: mrrSnap.saas_active_count,
    saas_past_due_count: mrrSnap.saas_past_due_count,
  };

  const growth = {
    new_tenants_30d: safeInt(newTenants30dR.rows[0]?.c),
    new_users_30d: safeInt(newUsers30dR.rows[0]?.c),
    tenants_by_day_30d: tenantsByDayR.rows.map((r) => ({ date: r.date, count: safeInt(r.count) })),
    users_by_day_30d: usersByDayR.rows.map((r) => ({ date: r.date, count: safeInt(r.count) })),
  };

  const plans = {
    total_plans: safeInt(totalPlansR.rows[0]?.c),
    by_plan: byPlanR.rows.map((r) => ({
      plan_id: r.plan_id,
      plan_name: r.plan_name,
      tenants_count: safeInt(r.tenants_count),
      active_tenants_count: safeInt(r.active_tenants_count),
      estimated_mrr_cents: safeInt(r.estimated_mrr_cents),
    })),
  };

  const [gatewaysStatus, smtpSettings, whatsappStats, failedJobsR] = await Promise.all([
    getGatewaysStatus('global').catch(() => []),
    getSmtpSuperadminSettings().catch(() => null),
    pool.query<{ total: string; connected: string; disconnected: string }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE ci.status IN ('connected','open'))::text AS connected,
         COUNT(*) FILTER (WHERE ci.status NOT IN ('connected','open'))::text AS disconnected
       FROM chat_instances ci
       INNER JOIN users u ON u.id = ci.user_id
       WHERE u.is_super_admin = true`,
    ),
    pool
      .query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM billing_recurring_jobs WHERE status = 'failed'`
      )
      .catch(() => ({ rows: [{ c: '0' }] })),
  ]);

  const failedJobsCount = safeInt(failedJobsR.rows[0]?.c);

  const operational = {
    gateways: gatewaysStatus.map((g) => ({
      gateway: g.key,
      status: toGatewayStatus(g.configured),
    })),
    whatsapp_instances: {
      total: safeInt(whatsappStats.rows[0]?.total),
      connected: safeInt(whatsappStats.rows[0]?.connected),
      disconnected: safeInt(whatsappStats.rows[0]?.disconnected),
    },
    smtp: {
      configured: Boolean(
        smtpSettings &&
          smtpSettings.smtp_host &&
          smtpSettings.smtp_from_email &&
          smtpSettings.smtp_password_configured,
      ),
      enabled: Boolean(smtpSettings?.smtp_enabled),
    },
    failed_jobs_count: failedJobsCount,
  };

  const recent = {
    tenants: recentTenants.rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      created_at: r.created_at,
      plan_name: r.plan_name,
    })),
    users: recentUsers.rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      created_at: r.created_at,
      tenant_name: r.tenant_name,
    })),
    payments: recentPayments.rows.map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      tenant_name: r.tenant_name,
      amount_cents: safeInt(r.amount_cents),
      status: r.status,
      gateway: r.gateway,
      paid_at: r.paid_at,
      created_at: r.created_at,
    })),
  };

  const alerts: SuperadminDashboardPayload['alerts'] = [];
  if (financial.overdue_billing_count > 0) {
    alerts.push({
      type: 'overdue_billings',
      severity: financial.overdue_billing_count >= 20 ? 'critical' : 'warning',
      title: 'Cobranças vencidas em aberto',
      description: `Há ${financial.overdue_billing_count} cobranças vencidas.`,
      count: financial.overdue_billing_count,
    });
  }
  if (failedJobsCount > 0) {
    alerts.push({
      type: 'billing_jobs_failed',
      severity: failedJobsCount >= 10 ? 'critical' : 'warning',
      title: 'Jobs de renovação com falha',
      description: `${failedJobsCount} job(s) em billing_recurring_jobs com status failed.`,
      count: failedJobsCount,
    });
  }
  if (subscriptions.saas_past_due_count > 0) {
    alerts.push({
      type: 'saas_past_due',
      severity: 'warning',
      title: 'Assinaturas past_due',
      description: `${subscriptions.saas_past_due_count} contrato(s) SaaS em past_due (não confundir com fatura overdue).`,
      count: subscriptions.saas_past_due_count,
    });
  }
  if (subscriptions.trials_expiring_soon > 0) {
    alerts.push({
      type: 'trials_expiring_soon',
      severity: 'info',
      title: 'Trials próximos do vencimento',
      description: `${subscriptions.trials_expiring_soon} tenants em trial vencem em até 7 dias.`,
      count: subscriptions.trials_expiring_soon,
    });
  }
  if (subscriptions.suspended_tenants > 0) {
    alerts.push({
      type: 'suspended_tenants',
      severity: subscriptions.suspended_tenants >= 10 ? 'critical' : 'warning',
      title: 'Tenants suspensos',
      description: `${subscriptions.suspended_tenants} tenants estão com status suspenso.`,
      count: subscriptions.suspended_tenants,
    });
  }
  if (operational.smtp.enabled && !operational.smtp.configured) {
    alerts.push({
      type: 'smtp_misconfigured',
      severity: 'warning',
      title: 'SMTP habilitado com configuração incompleta',
      description: 'SMTP está habilitado, mas host/remetente/senha não estão completos.',
    });
  }
  if (operational.whatsapp_instances.total > 0 && operational.whatsapp_instances.connected === 0) {
    alerts.push({
      type: 'whatsapp_disconnected',
      severity: 'warning',
      title: 'WhatsApp da plataforma desconectado',
      description: 'Existem instâncias, porém nenhuma está conectada.',
    });
  }
  const notConfiguredGateways = operational.gateways.filter((g) => g.status === 'not_configured').length;
  if (notConfiguredGateways > 0) {
    alerts.push({
      type: 'gateway_not_configured',
      severity: 'warning',
      title: 'Gateway sem configuração ativa',
      description: `${notConfiguredGateways} gateway(s) sem configuração local.`,
      count: notConfiguredGateways,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    financial,
    subscriptions,
    growth,
    plans,
    operational,
    recent,
    alerts,
    totals: {
      plans: plans.total_plans,
      tenants: subscriptions.total_tenants,
      active_tenants: subscriptions.active_tenants,
      users: safeInt(usersTotalR.rows[0]?.c),
    },
    recent_tenants: recent.tenants.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      created_at: r.created_at,
      plan_name: r.plan_name,
    })),
    recent_users: recent.users.map((r) => ({
      id: r.id,
      email: r.email,
      created_at: r.created_at,
      tenant_name: r.tenant_name,
    })),
  };
}


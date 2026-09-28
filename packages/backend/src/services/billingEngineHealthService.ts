/**
 * Billing Engine 3.0 — auditoria interna do motor (somente diagnóstico).
 */
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { getBillingHealthSnapshot, type BillingHealthSnapshot } from './billingRecoveryService.js';
import { safeParseYmd } from '../utils/billingSafeDate.js';
import { getBillingShadowHealthStats } from '../internal-tools/billing-migration/billingShadow/billingShadowReportService.js';
import { getBillingConsistencyHealthStats } from '../billingConsistency/billingConsistencyReportService.js';
import { getBillingExecutionContextHealthStats } from '../billingExecutionContext/billingExecutionContextService.js';
import { getBillingProjectionHealthStats } from '../billingProjection/projectionService.js';
import { getBillingMigrationReadinessHealthStats } from '../internal-tools/billing-migration/billingMigrationReadiness/billingMigrationReadinessService.js';
import { getBillingMigrationSimulatorHealthStats } from '../internal-tools/billing-migration/billingMigrationSimulator/billingMigrationSimulatorService.js';
import { getBillingCutoverHealthStats } from '../internal-tools/billing-migration/billingCutover/billingCutoverService.js';
import { getBillingCertificationHealthStats } from '../internal-tools/billing-migration/billingCertification/billingCertificationService.js';

export type BillingEngineHealthIssue = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  count: number;
  sample_ids: string[];
  detail: string | null;
};

export type BillingEngineHealthReport = BillingHealthSnapshot & {
  engine_version: 'v3_billing_engine_ga';
  shadow: {
    enabled: boolean;
    last_execution: string | null;
    average_score: number | null;
    approved_reports: number;
    failed_reports: number;
    critical_reports: number;
  };
  consistency: {
    healthy: boolean;
    average_confidence: number | null;
    average_score: number | null;
    plans_validated: number;
    invalid_plans: number;
    critical_plans: number;
    last_validation: string | null;
  };
  context: {
    healthy: boolean;
    builder_time_avg: number | null;
    cache_hit_rate: number | null;
    last_failure: string | null;
    last_build: string | null;
    contexts_built: number;
    builder_errors: number;
    builder_warnings: number;
  };
  projection: {
    healthy: boolean;
    average_projection_time: number | null;
    projection_cache_hit: number | null;
    projection_failures: number;
    last_projection: string | null;
    projection_hash_mismatch: number;
  };
  migration_readiness: {
    ready_tenants: number;
    not_ready_tenants: number;
    average_score: number | null;
    critical_tenants: number;
    last_evaluation: string | null;
    migration_candidates: number;
  };
  migration_simulator: {
    healthy: boolean;
    simulations: number;
    average_duration: number | null;
    average_score: number | null;
    high_risk: number;
    critical: number;
    last_simulation: string | null;
  };
  cutover: {
    healthy: boolean;
    ready_tenants: number;
    blocked_tenants: number;
    average_approval: number | null;
    last_evaluation: string | null;
    rollback_safe: number;
    cutover_candidates: number;
  };
  certification: {
    healthy: boolean;
    total_subscriptions: number;
    certified: number;
    failed: number;
    average_score: number | null;
    engine_certified: boolean;
    last_evaluation: string | null;
  };
  issues: BillingEngineHealthIssue[];
  checks: {
    orphan_jobs: BillingEngineHealthIssue;
    orphan_invoices: BillingEngineHealthIssue;
    inconsistent_subscriptions: BillingEngineHealthIssue;
    invalid_dates: BillingEngineHealthIssue;
    stuck_retries: BillingEngineHealthIssue;
    orphan_locks: BillingEngineHealthIssue;
    pending_notifications: BillingEngineHealthIssue;
    gateway_inconsistent: BillingEngineHealthIssue;
    timeline_gaps: BillingEngineHealthIssue;
    customer_inconsistent: BillingEngineHealthIssue;
    template_inconsistent: BillingEngineHealthIssue;
  };
};

async function scanOrphanJobs(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT j.id::text
     FROM billing_recurring_jobs j
     LEFT JOIN subscriptions s ON s.id = j.subscription_id
     WHERE s.id IS NULL
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'orphan_jobs',
    severity: r.rows.length > 0 ? 'critical' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Jobs sem assinatura correspondente' : null,
  };
}

async function scanInvalidSubscriptionDates(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string; next_billing_date: string }>(
    `SELECT id::text, next_billing_date::text
     FROM subscriptions
     WHERE status = 'active' AND type = 'customer'
     LIMIT $1`,
    [limit]
  );
  const bad = r.rows.filter((row) => !safeParseYmd(row.next_billing_date));
  return {
    code: 'invalid_dates',
    severity: bad.length > 0 ? 'warning' : 'info',
    count: bad.length,
    sample_ids: bad.map((x) => x.id),
    detail: bad.length ? 'Assinaturas ativas com next_billing_date inválido' : null,
  };
}

async function scanStuckRetries(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM billing_recurring_jobs
     WHERE status = 'pending'
       AND retry_at IS NOT NULL
       AND retry_at < now() - interval '24 hours'
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'stuck_retries',
    severity: r.rows.length > 0 ? 'warning' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Jobs com retry_at vencido há mais de 24h' : null,
  };
}

async function scanOrphanLocks(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM billing_recurring_jobs
     WHERE status = 'processing'
       AND locked_at IS NOT NULL
       AND locked_at < now() - interval '2 hours'
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'orphan_locks',
    severity: r.rows.length > 0 ? 'warning' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Jobs processing com lock antigo' : null,
  };
}

async function scanCustomerInconsistent(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT s.id::text
     FROM subscriptions s
     WHERE s.status = 'active' AND s.type = 'customer'
       AND s.customer_id IS NULL
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'customer_inconsistent',
    severity: r.rows.length > 0 ? 'warning' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Assinaturas customer sem customer_id' : null,
  };
}

async function scanGatewayInconsistent(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT ci.id::text
     FROM customer_invoices ci
     INNER JOIN subscriptions s ON s.id = ci.subscription_id
     WHERE ci.gateway_status = 'failed'
       AND ci.created_at > now() - interval '7 days'
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'gateway_inconsistent',
    severity: r.rows.length > 0 ? 'warning' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Faturas recentes com gateway_status failed' : null,
  };
}

async function scanPendingNotifications(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT id::text FROM platform_notification_outbound
     WHERE status IN ('queued', 'retry')
     LIMIT $1`,
    [limit]
  ).catch(() => ({ rows: [] as { id: string }[] }));
  return {
    code: 'pending_notifications',
    severity: r.rows.length > 0 ? 'info' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Notificações outbound pendentes na fila' : null,
  };
}

async function scanTimelineGaps(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT s.id::text
     FROM subscriptions s
     WHERE s.status = 'active' AND s.type = 'customer'
       AND NOT EXISTS (
         SELECT 1 FROM customer_invoices ci
         WHERE ci.subscription_id = s.id
       )
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'timeline_gaps',
    severity: r.rows.length > 0 ? 'info' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Assinaturas ativas sem nenhuma fatura (template ausente)' : null,
  };
}

async function scanTemplateInconsistent(limit: number): Promise<BillingEngineHealthIssue> {
  const r = await pool.query<{ id: string }>(
    `SELECT s.id::text
     FROM subscriptions s
     WHERE s.status = 'active' AND s.type = 'customer'
       AND s.customer_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM customer_invoices ci
         WHERE ci.subscription_id = s.id AND ci.client_id = s.customer_id
       )
     LIMIT $1`,
    [limit]
  );
  return {
    code: 'template_inconsistent',
    severity: r.rows.length > 0 ? 'warning' : 'info',
    count: r.rows.length,
    sample_ids: r.rows.map((x) => x.id),
    detail: r.rows.length ? 'Assinatura com customer mas sem fatura template' : null,
  };
}

/** Diagnóstico interno completo — não corrige, apenas reporta. */
export async function billingEngineHealth(): Promise<BillingEngineHealthReport> {
  return withBillingWorkerRlsBypass(async () => {
    const base = await getBillingHealthSnapshot();
    const limit = 25;
    const [
      orphanJobs,
      invalidDates,
      stuckRetries,
      orphanLocks,
      customerInconsistent,
      gatewayInconsistent,
      pendingNotifications,
      timelineGaps,
      templateInconsistent,
    ] = await Promise.all([
      scanOrphanJobs(limit),
      scanInvalidSubscriptionDates(limit),
      scanStuckRetries(limit),
      scanOrphanLocks(limit),
      scanCustomerInconsistent(limit),
      scanGatewayInconsistent(limit),
      scanPendingNotifications(limit),
      scanTimelineGaps(limit),
      scanTemplateInconsistent(limit),
    ]);

    const orphanInvoices: BillingEngineHealthIssue = {
      code: 'orphan_invoices',
      severity: base.counts.orphan_invoices > 0 ? 'warning' : 'info',
      count: base.counts.orphan_invoices,
      sample_ids: base.samples.orphan_invoices.map((r) => String((r as { id?: string }).id ?? '')),
      detail: base.counts.orphan_invoices > 0 ? 'Faturas órfãs detectadas' : null,
    };

    const inconsistentSubscriptions: BillingEngineHealthIssue = {
      code: 'inconsistent_subscriptions',
      severity:
        customerInconsistent.count > 0 || invalidDates.count > 0 ? 'warning' : 'info',
      count: customerInconsistent.count + invalidDates.count,
      sample_ids: [...customerInconsistent.sample_ids, ...invalidDates.sample_ids].slice(0, limit),
      detail: null,
    };

    const checks = {
      orphan_jobs: orphanJobs,
      orphan_invoices: orphanInvoices,
      inconsistent_subscriptions: inconsistentSubscriptions,
      invalid_dates: invalidDates,
      stuck_retries: stuckRetries,
      orphan_locks: orphanLocks,
      pending_notifications: pendingNotifications,
      gateway_inconsistent: gatewayInconsistent,
      timeline_gaps: timelineGaps,
      customer_inconsistent: customerInconsistent,
      template_inconsistent: templateInconsistent,
    };

    const issues = Object.values(checks).filter((c) => c.count > 0);
    const shadow = await getBillingShadowHealthStats();
    const consistency = await getBillingConsistencyHealthStats();
    const context = await getBillingExecutionContextHealthStats();
    const projection = getBillingProjectionHealthStats();
    const migration_readiness = getBillingMigrationReadinessHealthStats();
    const migration_simulator = getBillingMigrationSimulatorHealthStats();
    const cutover = getBillingCutoverHealthStats();
    const certification = getBillingCertificationHealthStats();

    return {
      ...base,
      engine_version: 'v3_billing_engine_ga',
      shadow,
      consistency,
      context,
      projection,
      migration_readiness,
      migration_simulator,
      cutover,
      certification,
      issues,
      checks,
    };
  });
}

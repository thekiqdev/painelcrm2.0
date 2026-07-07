/**
 * Billing Recovery + Auto-Healing (Fase 3).
 * Observabilidade, diagnóstico e reparação leve — sem alterar cycle_key, valores, next_billing_date ou gateway logic.
 */
import crypto from 'node:crypto';
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { getBillingOpsHeartbeats } from './billingOpsHeartbeatService.js';
import { getBillingRecurringJobsStatusSummary } from './billingRecurringJobsOpsService.js';
import { getBillingStaleProcessingReclaimMinutes } from '../config/billingEnv.js';
import { notifyInvoiceCreated } from './invoiceNotificationsService.js';
import { flushBillingNotificationSideEffects } from './notificationsEngine/billingNotificationFlush.js';
import { subscriptionCyclesMarkQueued } from './subscriptionCyclesDualWriteService.js';

export type BillingHealthScore = 'healthy' | 'warning' | 'critical';

export type BillingRecoveryIssueKind =
  | 'orphan_cycle'
  | 'orphan_invoice'
  | 'notification_failed'
  | 'notification_stuck_queued'
  | 'notification_excessive_retries'
  | 'gateway_missing_reference'
  | 'job_stuck_processing'
  | 'job_pending_stale'
  | 'heartbeat_stale';

export interface BillingRecoveryIssueRow {
  kind: BillingRecoveryIssueKind;
  entity_type: string;
  entity_id: string;
  tenant_id: string | null;
  subscription_id: string | null;
  detail: string;
  detected_at: string;
  meta?: Record<string, unknown>;
}

export interface BillingHealthSnapshot {
  score: BillingHealthScore;
  score_reasons: string[];
  generated_at: string;
  dry_run_default: boolean;
  heartbeats: Awaited<ReturnType<typeof getBillingOpsHeartbeats>>;
  jobs_summary: Awaited<ReturnType<typeof getBillingRecurringJobsStatusSummary>>;
  counts: {
    pending_jobs: number;
    failed_jobs: number;
    stuck_processing_jobs: number;
    orphan_cycles: number;
    orphan_invoices: number;
    failed_notifications: number;
    stuck_notification_queue: number;
    notification_excessive_retries: number;
    gateway_failures: number;
    retry_queue_due: number;
  };
  samples: {
    orphan_cycles: BillingRecoveryIssueRow[];
    orphan_invoices: BillingRecoveryIssueRow[];
    failed_notifications: BillingRecoveryIssueRow[];
    stuck_processing_jobs: BillingRecoveryIssueRow[];
    gateway_failures: BillingRecoveryIssueRow[];
    recent_recovery_audit: Array<{
      id: string;
      action_type: string;
      entity_type: string | null;
      entity_id: string | null;
      dry_run: boolean;
      detail: Record<string, unknown> | null;
      created_at: string;
    }>;
  };
}

export interface BillingRecoveryRepairResult {
  action: string;
  applied: boolean;
  dry_run: boolean;
  count: number;
  entity_ids: string[];
  error?: string;
}

export interface BillingRecoveryRunReport {
  run_id: string;
  dry_run: boolean;
  started_at: string;
  finished_at: string;
  health_before: BillingHealthScore;
  health_after: BillingHealthScore;
  issues_found: number;
  repairs: BillingRecoveryRepairResult[];
  audit_table_present: boolean;
}

const SCAN_LIMIT = 80;
const REPAIR_BATCH_LIMIT = 40;
const STUCK_PROCESSING_MINUTES = () => getBillingStaleProcessingReclaimMinutes() || 20;
const STALE_PENDING_JOB_DAYS = 2;
const ORPHAN_CYCLE_STALE_HOURS = 48;
const NOTIFICATION_STUCK_HOURS = 2;
const NOTIFICATION_MISSING_MINUTES = 15;
const MAX_RETRY_COUNT_WARN = 5;

let cachedAuditTable: boolean | undefined;

export function isBillingRecoveryDryRun(): boolean {
  return process.env.BILLING_RECOVERY_DRY_RUN !== 'false';
}

function logBilling(tag: string, payload: Record<string, unknown>): void {
  console.log(tag, JSON.stringify({ ...payload, ts: new Date().toISOString() }));
}

async function auditTableExists(): Promise<boolean> {
  if (cachedAuditTable !== undefined) return cachedAuditTable;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'billing_recovery_audit'`
  );
  cachedAuditTable = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return cachedAuditTable;
}

async function recordRecoveryAudit(params: {
  runId: string;
  actionType: string;
  entityType?: string | null;
  entityId?: string | null;
  dryRun: boolean;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (!(await auditTableExists())) return;
  try {
    await pool.query(
      `INSERT INTO billing_recovery_audit (run_id, action_type, entity_type, entity_id, dry_run, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        params.runId,
        params.actionType,
        params.entityType ?? null,
        params.entityId ?? null,
        params.dryRun,
        params.detail ? JSON.stringify(params.detail) : null,
      ]
    );
  } catch (e) {
    logBilling('[BILLING_RECOVERY]', {
      step: 'audit_insert_failed',
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function subscriptionCyclesTableExists(): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'subscription_cycles'`
  );
  return parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
}

export async function scanOrphanCycles(limit = SCAN_LIMIT): Promise<{
  rows: BillingRecoveryIssueRow[];
  total: number;
}> {
  if (!(await subscriptionCyclesTableExists())) {
    return { rows: [], total: 0 };
  }
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    subscription_id: string;
    cycle_date: string;
    status: string;
    invoice_id: string | null;
    job_id: string | null;
    job_status: string | null;
    updated_at: string;
    reason: string;
  }>(
    `WITH base AS (
       SELECT sc.id::text, sc.tenant_id::text, sc.subscription_id::text, sc.cycle_date::text,
              sc.status, sc.invoice_id::text, sc.job_id::text, sc.updated_at::text,
              j.status AS job_status
       FROM subscription_cycles sc
       LEFT JOIN billing_recurring_jobs j ON j.id = sc.job_id
       WHERE sc.status IN ('pending', 'queued', 'processing', 'invoiced')
     )
     SELECT *, reason FROM (
       SELECT b.*,
              CASE
                WHEN b.status = 'invoiced' AND b.invoice_id IS NULL THEN 'invoiced_sem_fatura'
                WHEN b.status IN ('pending','queued','processing') AND b.job_id IS NULL THEN 'sem_job'
                WHEN b.status IN ('pending','queued','processing')
                     AND b.job_status IS NOT NULL AND b.job_status NOT IN ('pending','processing') THEN 'job_terminal'
                WHEN b.status = 'processing' AND b.updated_at < now() - ($2::int * interval '1 hour') THEN 'processing_antigo'
                WHEN b.status IN ('pending','queued') AND b.updated_at < now() - ($3::int * interval '1 hour') THEN 'ciclo_parado'
                ELSE NULL
              END AS reason
       FROM base b
     ) x
     WHERE reason IS NOT NULL
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit, ORPHAN_CYCLE_STALE_HOURS, ORPHAN_CYCLE_STALE_HOURS]
  );
  const countR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM subscription_cycles sc
     LEFT JOIN billing_recurring_jobs j ON j.id = sc.job_id
     WHERE sc.status IN ('pending', 'queued', 'processing', 'invoiced')
       AND (
         (sc.status = 'invoiced' AND sc.invoice_id IS NULL)
         OR (sc.status IN ('pending','queued','processing') AND sc.job_id IS NULL)
         OR (sc.status IN ('pending','queued','processing') AND j.status IS NOT NULL AND j.status NOT IN ('pending','processing'))
         OR (sc.status = 'processing' AND sc.updated_at < now() - ($1::int * interval '1 hour'))
         OR (sc.status IN ('pending','queued') AND sc.updated_at < now() - ($1::int * interval '1 hour'))
       )`,
    [ORPHAN_CYCLE_STALE_HOURS]
  );
  const rows: BillingRecoveryIssueRow[] = r.rows.map((row) => ({
    kind: 'orphan_cycle',
    entity_type: 'subscription_cycle',
    entity_id: row.id,
    tenant_id: row.tenant_id,
    subscription_id: row.subscription_id,
    detail: row.reason,
    detected_at: row.updated_at,
    meta: {
      cycle_date: row.cycle_date,
      status: row.status,
      job_id: row.job_id,
      job_status: row.job_status,
      invoice_id: row.invoice_id,
    },
  }));
  return { rows, total: parseInt(countR.rows[0]?.c ?? '0', 10) };
}

export async function scanOrphanInvoices(limit = SCAN_LIMIT): Promise<{
  rows: BillingRecoveryIssueRow[];
  total: number;
}> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    subscription_id: string;
    invoice_number: string | null;
    status: string;
    created_at: string;
    has_cycle: boolean;
    has_notify: boolean;
    gateway_reference_id: string | null;
    issues: string[];
  }>(
    `SELECT ci.id::text, ci.tenant_id::text, ci.subscription_id::text, ci.invoice_number,
            ci.status::text, ci.created_at::text, ci.gateway_reference_id::text,
            EXISTS (
              SELECT 1 FROM subscription_cycles sc
              WHERE sc.invoice_id = ci.id
            ) AS has_cycle,
            EXISTS (
              SELECT 1 FROM notification_outbound_deliveries d
              WHERE d.entity_type = 'customer_invoice' AND d.entity_id = ci.id::text
                AND d.event_key = 'invoice.created'
            ) AS has_notify,
            ARRAY_REMOVE(ARRAY[
              CASE WHEN NOT EXISTS (
                SELECT 1 FROM subscription_cycles sc WHERE sc.invoice_id = ci.id
              ) THEN 'sem_ciclo' END,
              CASE WHEN NOT EXISTS (
                SELECT 1 FROM notification_outbound_deliveries d
                WHERE d.entity_type = 'customer_invoice' AND d.entity_id = ci.id::text
                  AND d.event_key = 'invoice.created'
              ) AND ci.created_at < now() - ($2::int * interval '1 minute') THEN 'sem_notificacao' END
            ], NULL) AS issues
     FROM customer_invoices ci
     WHERE ci.subscription_id IS NOT NULL
       AND ci.invoice_type IS DISTINCT FROM 'child'
       AND (ci.origin = 'subscription' OR ci.origin IS NULL)
       AND ci.created_at >= now() - interval '90 days'
       AND (
         NOT EXISTS (SELECT 1 FROM subscription_cycles sc WHERE sc.invoice_id = ci.id)
         OR (
           NOT EXISTS (
             SELECT 1 FROM notification_outbound_deliveries d
             WHERE d.entity_type = 'customer_invoice' AND d.entity_id = ci.id::text
               AND d.event_key = 'invoice.created'
           )
           AND ci.created_at < now() - ($2::int * interval '1 minute')
         )
       )
     ORDER BY ci.created_at DESC
     LIMIT $1`,
    [limit, NOTIFICATION_MISSING_MINUTES]
  );
  const countR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM customer_invoices ci
     WHERE ci.subscription_id IS NOT NULL
       AND ci.invoice_type IS DISTINCT FROM 'child'
       AND (ci.origin = 'subscription' OR ci.origin IS NULL)
       AND ci.created_at >= now() - interval '90 days'
       AND (
         NOT EXISTS (SELECT 1 FROM subscription_cycles sc WHERE sc.invoice_id = ci.id)
         OR (
           NOT EXISTS (
             SELECT 1 FROM notification_outbound_deliveries d
             WHERE d.entity_type = 'customer_invoice' AND d.entity_id = ci.id::text
               AND d.event_key = 'invoice.created'
           )
           AND ci.created_at < now() - ($1::int * interval '1 minute')
         )
       )`,
    [NOTIFICATION_MISSING_MINUTES]
  );
  const rows: BillingRecoveryIssueRow[] = r.rows.flatMap((row) => {
    const issueList = row.issues ?? [];
    if (issueList.length === 0) return [];
    return [
      {
        kind: 'orphan_invoice',
        entity_type: 'customer_invoice',
        entity_id: row.id,
        tenant_id: row.tenant_id,
        subscription_id: row.subscription_id,
        detail: issueList.join(','),
        detected_at: row.created_at,
        meta: {
          invoice_number: row.invoice_number,
          status: row.status,
          has_cycle: row.has_cycle,
          has_notify: row.has_notify,
          gateway_reference_id: row.gateway_reference_id,
        },
      },
    ];
  });
  return { rows, total: parseInt(countR.rows[0]?.c ?? '0', 10) };
}

export async function scanNotificationFailures(limit = SCAN_LIMIT): Promise<{
  failed: BillingRecoveryIssueRow[];
  stuck_queued: BillingRecoveryIssueRow[];
  excessive_retries: BillingRecoveryIssueRow[];
  counts: { failed: number; stuck_queued: number; excessive_retries: number; retry_queue_due: number };
}> {
  const failedR = await pool.query<{
    id: string;
    tenant_id: string;
    event_key: string;
    status: string;
    entity_id: string | null;
    error_message: string | null;
    updated_at: string;
    retry_count: number;
  }>(
    `SELECT id::text, tenant_id::text, event_key, status, entity_id::text, error_message,
            updated_at::text, COALESCE(retry_count, 0)::int AS retry_count
     FROM notification_outbound_deliveries
     WHERE status = 'failed'
       AND event_key LIKE 'invoice.%'
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit]
  );
  const stuckR = await pool.query<{
    id: string;
    tenant_id: string;
    event_key: string;
    dispatch_not_before: string | null;
    updated_at: string;
  }>(
    `SELECT id::text, tenant_id::text, event_key, dispatch_not_before::text, updated_at::text
     FROM notification_outbound_deliveries
     WHERE status = 'queued'
       AND (
         (dispatch_not_before IS NOT NULL AND dispatch_not_before < now() - ($2::int * interval '1 hour'))
         OR (updated_at < now() - ($2::int * interval '1 hour'))
       )
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit, NOTIFICATION_STUCK_HOURS]
  );
  const retryR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM notification_outbound_deliveries
     WHERE status = 'queued'
       AND (dispatch_not_before IS NULL OR dispatch_not_before <= now())
       AND (next_retry_at IS NULL OR next_retry_at <= now())`
  );
  const excessiveR = await pool.query<{
    id: string;
    tenant_id: string;
    event_key: string;
    retry_count: number;
    updated_at: string;
  }>(
    `SELECT id::text, tenant_id::text, event_key, COALESCE(retry_count, 0)::int AS retry_count, updated_at::text
     FROM notification_outbound_deliveries
     WHERE COALESCE(retry_count, 0) >= $2
       AND status IN ('failed', 'queued')
     ORDER BY retry_count DESC
     LIMIT $1`,
    [limit, MAX_RETRY_COUNT_WARN]
  );

  const mapDelivery = (
    row: {
      id: string;
      tenant_id: string;
      event_key: string;
      updated_at: string;
      error_message?: string | null;
      retry_count?: number;
    },
    kind: BillingRecoveryIssueKind
  ): BillingRecoveryIssueRow => ({
    kind,
    entity_type: 'notification_delivery',
    entity_id: row.id,
    tenant_id: row.tenant_id,
    subscription_id: null,
    detail: row.error_message?.slice(0, 200) ?? row.event_key,
    detected_at: row.updated_at,
    meta: { event_key: row.event_key, retry_count: row.retry_count },
  });

  return {
    failed: failedR.rows.map((r) => mapDelivery(r, 'notification_failed')),
    stuck_queued: stuckR.rows.map((r) => mapDelivery(r, 'notification_stuck_queued')),
    excessive_retries: excessiveR.rows.map((r) => mapDelivery(r, 'notification_excessive_retries')),
    counts: {
      failed: failedR.rowCount ?? 0,
      stuck_queued: stuckR.rowCount ?? 0,
      excessive_retries: excessiveR.rowCount ?? 0,
      retry_queue_due: parseInt(retryR.rows[0]?.c ?? '0', 10),
    },
  };
}

export async function scanStuckProcessingJobs(limit = SCAN_LIMIT): Promise<{
  rows: BillingRecoveryIssueRow[];
  total: number;
}> {
  const minutes = STUCK_PROCESSING_MINUTES();
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    subscription_id: string;
    cycle_key: string;
    locked_by: string | null;
    locked_at: string | null;
    updated_at: string;
  }>(
    `SELECT id::text, tenant_id::text, subscription_id::text, cycle_key::text,
            locked_by, locked_at::text, updated_at::text
     FROM billing_recurring_jobs
     WHERE status = 'processing'
       AND (
         (locked_at IS NOT NULL AND locked_at < now() - ($2::int * interval '1 minute'))
         OR (locked_at IS NULL AND updated_at < now() - ($2::int * interval '1 minute'))
       )
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit, minutes]
  );
  const countR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM billing_recurring_jobs
     WHERE status = 'processing'
       AND (
         (locked_at IS NOT NULL AND locked_at < now() - ($1::int * interval '1 minute'))
         OR (locked_at IS NULL AND updated_at < now() - ($1::int * interval '1 minute'))
       )`,
    [minutes]
  );
  return {
    rows: r.rows.map((row) => ({
      kind: 'job_stuck_processing',
      entity_type: 'billing_recurring_job',
      entity_id: row.id,
      tenant_id: row.tenant_id,
      subscription_id: row.subscription_id,
      detail: `processing travado > ${minutes}min`,
      detected_at: row.updated_at,
      meta: { cycle_key: row.cycle_key, locked_by: row.locked_by, locked_at: row.locked_at },
    })),
    total: parseInt(countR.rows[0]?.c ?? '0', 10),
  };
}

export async function scanGatewayFailures(limit = SCAN_LIMIT): Promise<{
  rows: BillingRecoveryIssueRow[];
  total: number;
}> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    subscription_id: string;
    invoice_number: string | null;
    status: string;
    gateway_status: string | null;
    created_at: string;
  }>(
    `SELECT id::text, tenant_id::text, subscription_id::text, invoice_number, status::text,
            gateway_status::text, created_at::text
     FROM customer_invoices
     WHERE subscription_id IS NOT NULL
       AND invoice_type IS DISTINCT FROM 'child'
       AND status IN ('pending', 'waiting_payment', 'processing', 'failed')
       AND (
         gateway_status IN ('failed', 'refused', 'chargeback')
         OR (gateway_reference_id IS NULL AND created_at < now() - interval '3 hours'
             AND status IN ('pending', 'waiting_payment'))
       )
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  const countR = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM customer_invoices
     WHERE subscription_id IS NOT NULL
       AND invoice_type IS DISTINCT FROM 'child'
       AND status IN ('pending', 'waiting_payment', 'processing', 'failed')
       AND (
         gateway_status IN ('failed', 'refused', 'chargeback')
         OR (gateway_reference_id IS NULL AND created_at < now() - interval '3 hours'
             AND status IN ('pending', 'waiting_payment'))
       )`
  );
  return {
    rows: r.rows.map((row) => ({
      kind: 'gateway_missing_reference',
      entity_type: 'customer_invoice',
      entity_id: row.id,
      tenant_id: row.tenant_id,
      subscription_id: row.subscription_id,
      detail: row.gateway_status ?? 'sem_gateway_reference',
      detected_at: row.created_at,
      meta: { invoice_number: row.invoice_number, status: row.status },
    })),
    total: parseInt(countR.rows[0]?.c ?? '0', 10),
  };
}

function computeHealthScore(input: {
  heartbeats: Awaited<ReturnType<typeof getBillingOpsHeartbeats>>;
  jobs_summary: Awaited<ReturnType<typeof getBillingRecurringJobsStatusSummary>>;
  stuck_processing: number;
  orphan_cycles: number;
  orphan_invoices: number;
  failed_notifications: number;
  gateway_failures: number;
}): { score: BillingHealthScore; reasons: string[] } {
  const reasons: string[] = [];
  const staleHb = input.heartbeats.heartbeats.filter((h) => h.stale);
  if (staleHb.length > 0) {
    reasons.push(`Heartbeat stale: ${staleHb.map((h) => h.process_key).join(', ')}`);
  }
  if (input.jobs_summary.failed >= 10) {
    reasons.push(`Jobs failed (janela ${input.jobs_summary.window_days}d): ${input.jobs_summary.failed}`);
  }
  if (input.stuck_processing >= 5) {
    reasons.push(`Jobs processing travados: ${input.stuck_processing}`);
  }
  if (input.orphan_cycles >= 15) {
    reasons.push(`Ciclos órfãos/parados: ${input.orphan_cycles}`);
  }

  let score: BillingHealthScore = 'healthy';
  if (
    staleHb.length > 0 ||
    input.jobs_summary.failed >= 10 ||
    input.stuck_processing >= 5 ||
    input.orphan_cycles >= 15
  ) {
    score = 'critical';
  } else if (
    input.orphan_cycles > 0 ||
    input.orphan_invoices > 0 ||
    input.failed_notifications > 0 ||
    input.gateway_failures > 0 ||
    input.jobs_summary.failed > 0 ||
    staleHb.length > 0
  ) {
    score = 'warning';
    if (input.orphan_cycles > 0) reasons.push(`Ciclos com inconsistência: ${input.orphan_cycles}`);
    if (input.orphan_invoices > 0) reasons.push(`Faturas órfãs: ${input.orphan_invoices}`);
    if (input.failed_notifications > 0) reasons.push(`Notificações failed: ${input.failed_notifications}`);
    if (input.gateway_failures > 0) reasons.push(`Gateway / referência: ${input.gateway_failures}`);
  }

  if (reasons.length === 0) reasons.push('Nenhum indicador crítico na amostra atual.');
  return { score, reasons };
}

export async function getBillingHealthSnapshot(): Promise<BillingHealthSnapshot> {
  return withBillingWorkerRlsBypass(async () => {
    logBilling('[BILLING_HEALTH]', { step: 'scan_start' });
    const [heartbeats, jobs_summary, orphanCycles, orphanInvoices, notif, stuckJobs, gateway] =
      await Promise.all([
        getBillingOpsHeartbeats(),
        getBillingRecurringJobsStatusSummary(30),
        scanOrphanCycles(25),
        scanOrphanInvoices(25),
        scanNotificationFailures(25),
        scanStuckProcessingJobs(25),
        scanGatewayFailures(25),
      ]);

    const { score, reasons } = computeHealthScore({
      heartbeats,
      jobs_summary,
      stuck_processing: stuckJobs.total,
      orphan_cycles: orphanCycles.total,
      orphan_invoices: orphanInvoices.total,
      failed_notifications: notif.counts.failed,
      gateway_failures: gateway.total,
    });

    let recent_recovery_audit: BillingHealthSnapshot['samples']['recent_recovery_audit'] = [];
    if (await auditTableExists()) {
      const ar = await pool.query<{
        id: string;
        action_type: string;
        entity_type: string | null;
        entity_id: string | null;
        dry_run: boolean;
        detail: Record<string, unknown> | null;
        created_at: string;
      }>(
        `SELECT id::text, action_type, entity_type, entity_id, dry_run, detail, created_at::text
         FROM billing_recovery_audit
         ORDER BY created_at DESC
         LIMIT 30`
      );
      recent_recovery_audit = ar.rows;
    }

    const snapshot: BillingHealthSnapshot = {
      score,
      score_reasons: reasons,
      generated_at: new Date().toISOString(),
      dry_run_default: isBillingRecoveryDryRun(),
      heartbeats,
      jobs_summary,
      counts: {
        pending_jobs: jobs_summary.pending,
        failed_jobs: jobs_summary.failed,
        stuck_processing_jobs: stuckJobs.total,
        orphan_cycles: orphanCycles.total,
        orphan_invoices: orphanInvoices.total,
        failed_notifications: notif.counts.failed,
        stuck_notification_queue: notif.counts.stuck_queued,
        notification_excessive_retries: notif.counts.excessive_retries,
        gateway_failures: gateway.total,
        retry_queue_due: notif.counts.retry_queue_due,
      },
      samples: {
        orphan_cycles: orphanCycles.rows,
        orphan_invoices: orphanInvoices.rows,
        failed_notifications: [...notif.failed, ...notif.stuck_queued].slice(0, 25),
        stuck_processing_jobs: stuckJobs.rows,
        gateway_failures: gateway.rows,
        recent_recovery_audit,
      },
    };

    logBilling('[BILLING_HEALTH]', {
      step: 'scan_done',
      score,
      counts: snapshot.counts,
    });
    return snapshot;
  });
}

async function repairReclaimStaleProcessing(
  runId: string,
  dryRun: boolean
): Promise<BillingRecoveryRepairResult> {
  const minutes = STUCK_PROCESSING_MINUTES();
  if (minutes <= 0) {
    return { action: 'reclaim_stale_processing', applied: false, dry_run: dryRun, count: 0, entity_ids: [] };
  }
  const sel = await pool.query<{ id: string }>(
    `SELECT id::text FROM billing_recurring_jobs
     WHERE status = 'processing'
       AND (
         (locked_at IS NOT NULL AND locked_at < now() - ($1::int * interval '1 minute'))
         OR (locked_at IS NULL AND updated_at < now() - ($1::int * interval '1 minute'))
       )
     LIMIT $2`,
    [minutes, REPAIR_BATCH_LIMIT]
  );
  const ids = sel.rows.map((r) => r.id);
  logBilling('[BILLING_RECOVERY]', { step: 'reclaim_stale_processing', dry_run: dryRun, count: ids.length, ids });
  if (!dryRun && ids.length > 0) {
    await pool.query(
      `UPDATE billing_recurring_jobs
       SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    for (const id of ids) {
      await subscriptionCyclesMarkQueued(pool, id);
    }
  }
  await recordRecoveryAudit({
    runId,
    actionType: 'reclaim_stale_processing',
    dryRun,
    detail: { count: ids.length, job_ids: ids },
  });
  return {
    action: 'reclaim_stale_processing',
    applied: !dryRun && ids.length > 0,
    dry_run: dryRun,
    count: ids.length,
    entity_ids: ids,
  };
}

async function repairClearPendingLocks(runId: string, dryRun: boolean): Promise<BillingRecoveryRepairResult> {
  const sel = await pool.query<{ id: string }>(
    `SELECT id::text FROM billing_recurring_jobs
     WHERE status = 'pending' AND (locked_at IS NOT NULL OR locked_by IS NOT NULL)
     LIMIT $1`,
    [REPAIR_BATCH_LIMIT]
  );
  const ids = sel.rows.map((r) => r.id);
  logBilling('[BILLING_RECOVERY]', { step: 'clear_pending_locks', dry_run: dryRun, count: ids.length });
  if (!dryRun && ids.length > 0) {
    await pool.query(
      `UPDATE billing_recurring_jobs
       SET locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }
  await recordRecoveryAudit({ runId, actionType: 'clear_pending_locks', dryRun, detail: { count: ids.length } });
  return {
    action: 'clear_pending_locks',
    applied: !dryRun && ids.length > 0,
    dry_run: dryRun,
    count: ids.length,
    entity_ids: ids,
  };
}

async function repairReactivateStalePendingJobs(
  runId: string,
  dryRun: boolean
): Promise<BillingRecoveryRepairResult> {
  const sel = await pool.query<{ id: string }>(
    `SELECT id::text FROM billing_recurring_jobs
     WHERE status = 'pending'
       AND scheduled_at < now() - ($1::int * interval '1 day')
       AND (retry_at IS NULL OR retry_at < now())
       AND attempts < max_attempts
     LIMIT $2`,
    [STALE_PENDING_JOB_DAYS, REPAIR_BATCH_LIMIT]
  );
  const ids = sel.rows.map((r) => r.id);
  logBilling('[BILLING_RECOVERY]', { step: 'reactivate_stale_pending', dry_run: dryRun, count: ids.length });
  if (!dryRun && ids.length > 0) {
    await pool.query(
      `UPDATE billing_recurring_jobs
       SET scheduled_at = now(), retry_at = NULL, locked_at = NULL, locked_by = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }
  await recordRecoveryAudit({ runId, actionType: 'reactivate_stale_pending', dryRun, detail: { count: ids.length } });
  return {
    action: 'reactivate_stale_pending',
    applied: !dryRun && ids.length > 0,
    dry_run: dryRun,
    count: ids.length,
    entity_ids: ids,
  };
}

async function repairRequeueNotifications(
  runId: string,
  dryRun: boolean
): Promise<BillingRecoveryRepairResult> {
  const sel = await pool.query<{ id: string }>(
    `SELECT id::text FROM notification_outbound_deliveries
     WHERE status IN ('failed', 'queued')
       AND (
         status = 'failed'
         OR (dispatch_not_before IS NOT NULL AND dispatch_not_before < now() - ($1::int * interval '1 hour'))
         OR updated_at < now() - ($1::int * interval '1 hour')
       )
       AND event_key LIKE 'invoice.%'
     LIMIT $2`,
    [NOTIFICATION_STUCK_HOURS, REPAIR_BATCH_LIMIT]
  );
  const ids = sel.rows.map((r) => r.id);
  logBilling('[BILLING_NOTIFY_RECOVERY]', { step: 'requeue_deliveries', dry_run: dryRun, count: ids.length });
  if (!dryRun && ids.length > 0) {
    await pool.query(
      `UPDATE notification_outbound_deliveries
       SET status = 'queued', next_retry_at = now(), error_message = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }
  await recordRecoveryAudit({
    runId,
    actionType: 'requeue_notification_deliveries',
    dryRun,
    detail: { count: ids.length },
  });
  return {
    action: 'requeue_notification_deliveries',
    applied: !dryRun && ids.length > 0,
    dry_run: dryRun,
    count: ids.length,
    entity_ids: ids,
  };
}

async function repairMissingInvoiceNotifications(
  runId: string,
  dryRun: boolean
): Promise<BillingRecoveryRepairResult> {
  const sel = await pool.query<{ id: string; tenant_id: string }>(
    `SELECT ci.id::text, ci.tenant_id::text
     FROM customer_invoices ci
     WHERE ci.subscription_id IS NOT NULL
       AND ci.invoice_type IS DISTINCT FROM 'child'
       AND ci.created_at < now() - ($1::int * interval '1 minute')
       AND NOT EXISTS (
         SELECT 1 FROM notification_outbound_deliveries d
         WHERE d.entity_type = 'customer_invoice' AND d.entity_id = ci.id::text
           AND d.event_key = 'invoice.created'
       )
     ORDER BY ci.created_at DESC
     LIMIT $2`,
    [NOTIFICATION_MISSING_MINUTES, REPAIR_BATCH_LIMIT]
  );
  const ids = sel.rows.map((r) => r.id);
  logBilling('[BILLING_NOTIFY_RECOVERY]', { step: 'recreate_invoice_notify', dry_run: dryRun, count: ids.length });
  if (!dryRun) {
    for (const row of sel.rows) {
      try {
        notifyInvoiceCreated({ tenantId: row.tenant_id, invoiceId: row.id });
        await recordRecoveryAudit({
          runId,
          actionType: 'recreate_invoice_notification',
          entityType: 'customer_invoice',
          entityId: row.id,
          dryRun: false,
          detail: { tenant_id: row.tenant_id },
        });
      } catch (e) {
        logBilling('[BILLING_NOTIFY_RECOVERY]', {
          step: 'recreate_failed',
          invoice_id: row.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await flushBillingNotificationSideEffects();
  } else {
    await recordRecoveryAudit({
      runId,
      actionType: 'recreate_invoice_notification',
      dryRun: true,
      detail: { would_process: ids.length, invoice_ids: ids },
    });
  }
  return {
    action: 'recreate_invoice_notifications',
    applied: !dryRun && ids.length > 0,
    dry_run: dryRun,
    count: ids.length,
    entity_ids: ids,
  };
}

async function repairOrphanCycles(runId: string, dryRun: boolean): Promise<BillingRecoveryRepairResult> {
  if (!(await subscriptionCyclesTableExists())) {
    return { action: 'heal_orphan_cycles', applied: false, dry_run: dryRun, count: 0, entity_ids: [] };
  }
  const sel = await pool.query<{ id: string; job_id: string | null }>(
    `SELECT sc.id::text, sc.job_id::text
     FROM subscription_cycles sc
     WHERE sc.status = 'processing'
       AND sc.updated_at < now() - ($1::int * interval '1 hour')
     LIMIT $2`,
    [ORPHAN_CYCLE_STALE_HOURS, REPAIR_BATCH_LIMIT]
  );
  const invoicedBroken = await pool.query<{ id: string }>(
    `SELECT id::text FROM subscription_cycles
     WHERE status = 'invoiced' AND invoice_id IS NULL
     LIMIT $1`,
    [REPAIR_BATCH_LIMIT]
  );
  const ids: string[] = [];
  logBilling('[BILLING_ORPHAN]', {
    step: 'heal_cycles',
    dry_run: dryRun,
    processing_stuck: sel.rowCount,
    invoiced_broken: invoicedBroken.rowCount,
  });
  if (!dryRun) {
    for (const row of sel.rows) {
      ids.push(row.id);
      await pool.query(
        `UPDATE subscription_cycles
         SET status = 'queued', error_message = COALESCE(error_message, 'billing_recovery_reset'), updated_at = now()
         WHERE id = $1 AND status = 'processing'`,
        [row.id]
      );
      if (row.job_id) {
        await subscriptionCyclesMarkQueued(pool, row.job_id);
      }
    }
    for (const row of invoicedBroken.rows) {
      ids.push(row.id);
      await pool.query(
        `UPDATE subscription_cycles
         SET status = 'pending',
             processed_at = NULL,
             skipped_reason = NULL,
             error_message = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = now()
         WHERE id = $1`,
        [
          row.id,
          JSON.stringify({
            lifecycle: 'reopen_after_invoice_removed',
            reopen_reason: 'billing_recovery_invoiced_without_invoice',
            reopened_at: new Date().toISOString(),
          }),
        ]
      );
    }
  } else {
    ids.push(...sel.rows.map((r) => r.id), ...invoicedBroken.rows.map((r) => r.id));
  }
  await recordRecoveryAudit({ runId, actionType: 'heal_orphan_cycles', dryRun, detail: { count: ids.length } });
  return {
    action: 'heal_orphan_cycles',
    applied: !dryRun && ids.length > 0,
    dry_run: dryRun,
    count: ids.length,
    entity_ids: ids,
  };
}

export async function runBillingRecovery(params?: {
  dry_run?: boolean;
}): Promise<BillingRecoveryRunReport> {
  const dryRun = params?.dry_run ?? isBillingRecoveryDryRun();
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  logBilling('[BILLING_RECOVERY]', { step: 'run_start', run_id: runId, dry_run: dryRun });

  const healthBefore = (await getBillingHealthSnapshot()).score;

  const repairs: BillingRecoveryRepairResult[] = [];
  const repairFns = [
    () => repairReclaimStaleProcessing(runId, dryRun),
    () => repairClearPendingLocks(runId, dryRun),
    () => repairReactivateStalePendingJobs(runId, dryRun),
    () => repairOrphanCycles(runId, dryRun),
    () => repairMissingInvoiceNotifications(runId, dryRun),
    () => repairRequeueNotifications(runId, dryRun),
  ];

  for (const fn of repairFns) {
    try {
      repairs.push(await fn());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logBilling('[BILLING_RECOVERY]', { step: 'repair_error', error: msg });
      repairs.push({
        action: 'unknown',
        applied: false,
        dry_run: dryRun,
        count: 0,
        entity_ids: [],
        error: msg,
      });
    }
  }

  const healthAfter = (await getBillingHealthSnapshot()).score;
  const issuesFound = repairs.reduce((s, r) => s + r.count, 0);
  const finishedAt = new Date().toISOString();

  logBilling('[BILLING_RECOVERY]', {
    step: 'run_done',
    run_id: runId,
    dry_run: dryRun,
    health_before: healthBefore,
    health_after: healthAfter,
    repairs: repairs.map((r) => ({ action: r.action, count: r.count, applied: r.applied })),
  });

  return {
    run_id: runId,
    dry_run: dryRun,
    started_at: startedAt,
    finished_at: finishedAt,
    health_before: healthBefore,
    health_after: healthAfter,
    issues_found: issuesFound,
    repairs,
    audit_table_present: await auditTableExists(),
  };
}

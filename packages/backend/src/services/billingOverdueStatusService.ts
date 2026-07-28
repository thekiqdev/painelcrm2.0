import { pool } from '../utils/db.js';
import { notifyInvoiceOverdue } from './invoiceNotificationsService.js';
import { schedulePublishPlatformBillingChargeOverdue } from './platformNotifications/platformBusinessNotifications.js';

const OVERDUE_TRANSITION_FROM_STATUSES = ['pending', 'waiting_payment', 'processing'] as const;

const TENANT_FALLBACK_MIN_INTERVAL_MS = 60_000;
const tenantLastRunAt = new Map<string, number>();
const tenantInFlight = new Map<string, Promise<void>>();

export interface OverdueSyncResult {
  customer_invoices_updated: number;
  tenant_billing_updated: number;
}

type MarkOverdueOptions = {
  tenantId?: string | null;
};

function parseCount(raw: string | undefined): number {
  return Number.parseInt(raw ?? '0', 10);
}

export async function markOverdueCustomerInvoices(
  options: MarkOverdueOptions = {}
): Promise<number> {
  const tenantId = options.tenantId ?? null;
  const r = await pool.query<{ id: string }>(
    `WITH tz_today AS (
       SELECT
         t.id AS tenant_id,
         (timezone(COALESCE(tz.name, 'UTC'), now()))::date AS tenant_today
       FROM tenants t
       LEFT JOIN pg_timezone_names tz
         ON tz.name = NULLIF(trim(t.timezone), '')
       WHERE ($1::uuid IS NULL OR t.id = $1::uuid)
     ),
     updated AS (
       UPDATE customer_invoices ci
       SET status = 'overdue',
           updated_at = now()
       FROM tz_today tt
       WHERE ci.tenant_id = tt.tenant_id
         AND ci.status = ANY($2::text[])
         AND ci.due_date < tt.tenant_today
       RETURNING ci.id::text AS id
     )
     SELECT id FROM updated`,
    [tenantId, OVERDUE_TRANSITION_FROM_STATUSES]
  );
  for (const row of r.rows) {
    notifyInvoiceOverdue({ invoiceId: row.id });
  }
  return r.rows.length;
}

export async function markOverdueTenantBillings(
  options: MarkOverdueOptions = {}
): Promise<string[]> {
  const tenantId = options.tenantId ?? null;
  const r = await pool.query<{ id: string }>(
    `WITH tz_today AS (
       SELECT
         t.id AS tenant_id,
         (timezone(COALESCE(tz.name, 'UTC'), now()))::date AS tenant_today
       FROM tenants t
       LEFT JOIN pg_timezone_names tz
         ON tz.name = NULLIF(trim(t.timezone), '')
       WHERE ($1::uuid IS NULL OR t.id = $1::uuid)
     ),
     updated AS (
       UPDATE tenant_billing tb
       SET status = 'overdue',
           updated_at = now()
       FROM tz_today tt
       WHERE tb.tenant_id = tt.tenant_id
         AND tb.status = ANY($2::text[])
         AND tb.due_date < tt.tenant_today
       RETURNING tb.id::text AS id
     )
     SELECT id FROM updated`,
    [tenantId, OVERDUE_TRANSITION_FROM_STATUSES]
  );
  return r.rows.map((row) => row.id);
}

export async function syncOverdueBillingStatuses(
  options: MarkOverdueOptions = {}
): Promise<OverdueSyncResult> {
  const [customerInvoicesUpdated, overdueTenantBillingIds] = await Promise.all([
    markOverdueCustomerInvoices(options),
    markOverdueTenantBillings(options),
  ]);

  const { shouldCollectionPolicyOwnNotifications, scheduleCollectionPolicyExtensionPoint } =
    await import('./collectionPolicy/hook.js');
  const { tenantBillingCorrelationId } = await import('./billing2/billingCorrelationId.js');
  const engineOwnsNotify = await shouldCollectionPolicyOwnNotifications();

  for (const billingId of overdueTenantBillingIds) {
    if (!engineOwnsNotify) {
      schedulePublishPlatformBillingChargeOverdue(billingId);
    }
    // Billing 2.0 Sprint 3 — payment.overdue (noop se engine OFF; destrutivas OFF por default)
    scheduleCollectionPolicyExtensionPoint({
      type: 'payment.overdue',
      occurred_at: new Date().toISOString(),
      billing_id: billingId,
      tenant_id: options.tenantId ?? undefined,
      correlation_id: tenantBillingCorrelationId(billingId),
      attempt: 1,
    });
    // lifecycle shadow observation (future — overdue route Sprint I+)
    void import('../lifecycle/lifecycleBillingObserver.js').then(({ observeFutureBillingLifecycleEvent }) =>
      observeFutureBillingLifecycleEvent(
        'subscription.overdue',
        { tenantId: options.tenantId ?? undefined, invoiceId: billingId },
        { source: 'tenant_billing_overdue' },
      ),
    );
  }

  // Sprint 5 — writer past_due (flag OFF = no-op; não suspende)
  try {
    const { syncSaasSubscriptionsPastDue } = await import(
      './collectionPolicy/subscriptionPastDueWriter.js'
    );
    await syncSaasSubscriptionsPastDue({ tenantId: options.tenantId ?? null });
  } catch (e: unknown) {
    console.warn(
      '[syncOverdueBillingStatuses] past_due writer skipped',
      e instanceof Error ? e.message : e
    );
  }

  return {
    customer_invoices_updated: customerInvoicesUpdated,
    tenant_billing_updated: overdueTenantBillingIds.length,
  };
}

/**
 * Fallback leve para endpoints críticos do tenant (dashboard/lista/detalhe):
 * - evita rodar em toda request com cooldown por tenant;
 * - sem bloquear resposta em caso de erro (caller decide logar/ignorar).
 */
export async function ensureTenantOverdueStatusesFresh(
  tenantId: string,
  minIntervalMs: number = TENANT_FALLBACK_MIN_INTERVAL_MS
): Promise<void> {
  const now = Date.now();
  const last = tenantLastRunAt.get(tenantId) ?? 0;
  if (now - last < minIntervalMs) return;

  const running = tenantInFlight.get(tenantId);
  if (running) {
    await running;
    return;
  }

  const task = (async () => {
    try {
      await syncOverdueBillingStatuses({ tenantId });
      tenantLastRunAt.set(tenantId, Date.now());
    } finally {
      tenantInFlight.delete(tenantId);
    }
  })();

  tenantInFlight.set(tenantId, task);
  await task;
}

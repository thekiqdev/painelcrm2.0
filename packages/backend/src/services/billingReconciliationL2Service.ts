/**
 * Billing 2.0 Sprint 8 — Reconciliação L2 (getPayment).
 *
 * Open `tenant_billing` com `gateway_reference_id` → consulta gateway → alinha status.
 * Flag `reconciliation_l2_enabled` (default OFF). Dry-run default ON na API.
 */
import { pool } from '../utils/db.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import { applyPaymentEvent } from '../modules/payments/webhook/paymentDomainService.js';
import { isBilling2FlagEnabled } from './billing2/billingFeatureFlags.js';
import { writeBillingAuditEvent } from './collectionPolicy/billingAuditEventWriter.js';
import { billingLog } from './billingLogger.js';
import { updateInvoiceGatewayData } from './invoiceService.js';

const OPEN_STATUSES = ['pending', 'waiting_payment', 'processing', 'overdue'] as const;

export type L2Divergence = {
  billing_id: string;
  tenant_id: string;
  tenant_name: string | null;
  local_status: string;
  gateway_reference_id: string;
  gateway: string;
  gateway_status_local: string | null;
  gateway_status_remote: string | null;
  normalized_remote: string | null;
  amount_cents: number;
  due_date: string | null;
  kind: 'status_mismatch' | 'paid_remote_pending_local' | 'gateway_status_only' | 'payment_not_found';
  detail: string;
};

export type L2RunResult = {
  skipped: boolean;
  reason?: string;
  dry_run: boolean;
  scanned: number;
  divergences: number;
  applied: number;
  failed: number;
  samples: L2Divergence[];
};

function parsePaidAt(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listOpenTenantBillingsWithGatewayRef(limit = 100): Promise<
  Array<{
    id: string;
    tenant_id: string;
    tenant_name: string | null;
    status: string;
    gateway: string | null;
    gateway_reference_id: string;
    gateway_status: string | null;
    amount_cents: number;
    due_date: string | null;
    payment_method: string | null;
  }>
> {
  const lim = Math.min(200, Math.max(1, limit));
  const r = await pool.query(
    `SELECT
       tb.id::text AS id,
       tb.tenant_id::text AS tenant_id,
       t.name AS tenant_name,
       tb.status,
       tb.gateway,
       tb.gateway_reference_id,
       tb.gateway_status,
       tb.amount_cents,
       tb.due_date::text AS due_date,
       tb.payment_method
     FROM tenant_billing tb
     LEFT JOIN tenants t ON t.id = tb.tenant_id
     WHERE tb.status = ANY($1::text[])
       AND tb.gateway_reference_id IS NOT NULL
       AND NULLIF(BTRIM(tb.gateway_reference_id), '') IS NOT NULL
     ORDER BY tb.due_date ASC NULLS LAST, tb.created_at ASC
     LIMIT $2`,
    [OPEN_STATUSES, lim]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    tenant_name: row.tenant_name != null ? String(row.tenant_name) : null,
    status: String(row.status),
    gateway: row.gateway != null ? String(row.gateway) : null,
    gateway_reference_id: String(row.gateway_reference_id),
    gateway_status: row.gateway_status != null ? String(row.gateway_status) : null,
    amount_cents: Number(row.amount_cents ?? 0),
    due_date: row.due_date != null ? String(row.due_date) : null,
    payment_method: row.payment_method != null ? String(row.payment_method) : null,
  }));
}

/**
 * Lista divergências (sempre read-only — não exige flag).
 */
export async function listReconciliationL2Divergences(limit = 50): Promise<L2Divergence[]> {
  const rows = await listOpenTenantBillingsWithGatewayRef(limit);
  const out: L2Divergence[] = [];

  for (const row of rows) {
    const gatewayKey = row.gateway ?? 'asaas';
    if (gatewayKey === 'mercado_pago') continue;

    const gateway = await getActiveGateway({ billingType: 'saas', tenantId: row.tenant_id });
    if (!gateway?.getPayment) continue;

    try {
      const payment = await gateway.getPayment(row.gateway_reference_id);
      if (!payment) {
        out.push({
          billing_id: row.id,
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          local_status: row.status,
          gateway_reference_id: row.gateway_reference_id,
          gateway: gatewayKey,
          gateway_status_local: row.gateway_status,
          gateway_status_remote: null,
          normalized_remote: null,
          amount_cents: row.amount_cents,
          due_date: row.due_date,
          kind: 'payment_not_found',
          detail: 'getPayment retornou null',
        });
        continue;
      }

      const normalized = normalizeGatewayStatus(gatewayKey, payment.status);
      const remoteRaw = payment.status ?? null;

      if (normalized === 'paid' && row.status !== 'paid') {
        out.push({
          billing_id: row.id,
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          local_status: row.status,
          gateway_reference_id: row.gateway_reference_id,
          gateway: gatewayKey,
          gateway_status_local: row.gateway_status,
          gateway_status_remote: remoteRaw,
          normalized_remote: normalized,
          amount_cents: row.amount_cents,
          due_date: row.due_date,
          kind: 'paid_remote_pending_local',
          detail: `Gateway ${remoteRaw} → paid; local=${row.status}`,
        });
        continue;
      }

      if (normalized !== row.status && normalized !== 'pending') {
        out.push({
          billing_id: row.id,
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          local_status: row.status,
          gateway_reference_id: row.gateway_reference_id,
          gateway: gatewayKey,
          gateway_status_local: row.gateway_status,
          gateway_status_remote: remoteRaw,
          normalized_remote: normalized,
          amount_cents: row.amount_cents,
          due_date: row.due_date,
          kind: 'status_mismatch',
          detail: `local=${row.status} remote_norm=${normalized} raw=${remoteRaw}`,
        });
        continue;
      }

      if ((row.gateway_status ?? '') !== (remoteRaw ?? '') && normalized === row.status) {
        out.push({
          billing_id: row.id,
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          local_status: row.status,
          gateway_reference_id: row.gateway_reference_id,
          gateway: gatewayKey,
          gateway_status_local: row.gateway_status,
          gateway_status_remote: remoteRaw,
          normalized_remote: normalized,
          amount_cents: row.amount_cents,
          due_date: row.due_date,
          kind: 'gateway_status_only',
          detail: `gateway_status local=${row.gateway_status} remote=${remoteRaw}`,
        });
      }
    } catch (e: unknown) {
      out.push({
        billing_id: row.id,
        tenant_id: row.tenant_id,
        tenant_name: row.tenant_name,
        local_status: row.status,
        gateway_reference_id: row.gateway_reference_id,
        gateway: gatewayKey,
        gateway_status_local: row.gateway_status,
        gateway_status_remote: null,
        normalized_remote: null,
        amount_cents: row.amount_cents,
        due_date: row.due_date,
        kind: 'payment_not_found',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}

/**
 * Executa L2. Requer flag ON. dryRun=true não aplica applyPaymentEvent.
 */
export async function runReconciliationL2(opts: {
  dryRun?: boolean;
  limit?: number;
  actor?: string;
}): Promise<L2RunResult> {
  const dryRun = opts.dryRun !== false;
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const flagOn = await isBilling2FlagEnabled('reconciliation_l2_enabled');

  // Apply exige flag; dry-run/listagem sempre permitidos (sem mutação).
  if (!dryRun && !flagOn) {
    return {
      skipped: true,
      reason: 'flag_reconciliation_l2_enabled_off',
      dry_run: false,
      scanned: 0,
      divergences: 0,
      applied: 0,
      failed: 0,
      samples: [],
    };
  }

  const divergences = await listReconciliationL2Divergences(limit);
  let applied = 0;
  let failed = 0;

  billingLog('reconciliation', 'l2_run_start', {
    dry_run: dryRun,
    flag_on: flagOn,
    divergences: divergences.length,
  });

  for (const d of divergences) {
    if (d.kind === 'payment_not_found') continue;
    if (dryRun) continue;

    try {
      const gateway = await getActiveGateway({ billingType: 'saas', tenantId: d.tenant_id });
      if (!gateway?.getPayment) {
        failed += 1;
        continue;
      }
      const payment = await gateway.getPayment(d.gateway_reference_id);
      if (!payment?.status) {
        failed += 1;
        continue;
      }
      const normalized = normalizeGatewayStatus(d.gateway, payment.status);

      if (d.kind === 'gateway_status_only') {
        const { getInvoiceById } = await import('./invoiceService.js');
        const inv = await getInvoiceById(d.billing_id);
        await updateInvoiceGatewayData(d.billing_id, {
          gateway: d.gateway,
          payment_method: inv?.payment_method ?? null,
          gateway_reference_id: d.gateway_reference_id,
          gateway_status: payment.status,
          idempotency_key: inv?.idempotency_key ?? null,
        });
        applied += 1;
      } else {
        await applyPaymentEvent({
          entityType: 'tenant_billing',
          entityId: d.billing_id,
          currentStatus: d.local_status,
          internalStatus: normalized,
          gatewayStatus: payment.status,
          paidAt: normalized === 'paid' ? parsePaidAt(payment.paidAt) ?? new Date() : null,
        });
        applied += 1;
      }

      await writeBillingAuditEvent({
        actor: opts.actor ?? 'reconciliation_l2',
        actor_type: 'system',
        action: 'reconciliation.l2.apply',
        entity_type: 'tenant_billing',
        entity_id: d.billing_id,
        reason: d.kind,
        origin: 'reconciliation_l2',
        correlation_id: `l2:${d.billing_id}`,
        payload: {
          local_status: d.local_status,
          remote: payment.status,
          normalized,
          dry_run: false,
        },
      });
    } catch (e: unknown) {
      failed += 1;
      billingLog('job', 'l2_apply_error', {
        invoiceId: d.billing_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const result: L2RunResult = {
    skipped: false,
    dry_run: dryRun,
    scanned: limit,
    divergences: divergences.length,
    applied: dryRun ? 0 : applied,
    failed,
    samples: divergences.slice(0, 25),
  };

  billingLog('reconciliation', 'l2_run_done', {
    dry_run: dryRun,
    divergences: result.divergences,
    applied: result.applied,
    failed: result.failed,
  });

  await writeBillingAuditEvent({
    actor: opts.actor ?? 'reconciliation_l2',
    actor_type: 'system',
    action: 'reconciliation.l2.run',
    entity_type: 'reconciliation_l2',
    entity_id: null,
    reason: dryRun ? 'dry_run' : 'apply',
    origin: 'reconciliation_l2',
    payload: {
      dry_run: dryRun,
      divergences: result.divergences,
      applied: result.applied,
      failed: result.failed,
    },
  });

  return result;
}

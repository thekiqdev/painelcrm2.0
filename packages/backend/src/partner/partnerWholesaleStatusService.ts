/**
 * M5-W Sprint 4 + Block S1/S3 — wholesale_status past_due / active + freeze (W8).
 */

import { pool } from '../utils/db.js';
import { PartnerAdminError } from './partnerErrors.js';
import {
  isPartnerWholesaleBlockEligible,
  resolveWholesaleBlockAfterDaysForSubscription,
  getPartnerWholesaleBlockAfterDays,
} from './partnerWholesaleBlockSettingsService.js';
import { writeBillingAuditEvent } from '../services/collectionPolicy/billingAuditEventWriter.js';

export type WholesaleStatus = 'none' | 'active' | 'past_due' | 'canceled';

export async function getPartnerWholesaleStatusRow(partnerTenantId: string): Promise<{
  wholesale_status: WholesaleStatus;
  wholesale_subscription_id: string | null;
  wholesale_plan_id: string | null;
} | null> {
  const r = await pool.query<{
    wholesale_status: string;
    wholesale_subscription_id: string | null;
    wholesale_plan_id: string | null;
  }>(
    `SELECT COALESCE(wholesale_status, 'none') AS wholesale_status,
            wholesale_subscription_id::text,
            wholesale_plan_id::text
     FROM partner_profiles
     WHERE partner_tenant_id = $1`,
    [partnerTenantId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    wholesale_status: (row.wholesale_status || 'none') as WholesaleStatus,
    wholesale_subscription_id: row.wholesale_subscription_id,
    wholesale_plan_id: row.wholesale_plan_id,
  };
}

/**
 * Bloqueia novas vendas / novos users se past_due ou canceled (W8).
 * Não afeta customers existentes.
 */
export async function assertPartnerChannelGrowthAllowed(
  partnerTenantId: string
): Promise<void> {
  const row = await getPartnerWholesaleStatusRow(partnerTenantId);
  if (!row) return;
  if (row.wholesale_status === 'past_due' || row.wholesale_status === 'canceled') {
    throw new PartnerAdminError(
      'Canal congelado: plano Platform inadimplente. Regularize a assinatura para criar clientes ou publicar planos.',
      'WHOLESALE_CHANNEL_FROZEN',
      409
    );
  }
}

export async function markPartnerWholesalePastDueBySubscription(
  subscriptionId: string,
  opts?: { force?: boolean; origin?: string }
): Promise<{ updated: boolean; partnerTenantId: string | null; eligible?: boolean }> {
  const r = await pool.query<{ partner_tenant_id: string }>(
    `SELECT partner_tenant_id::text
     FROM partner_profiles
     WHERE wholesale_subscription_id = $1
     LIMIT 1`,
    [subscriptionId]
  );
  const partnerTenantId = r.rows[0]?.partner_tenant_id ?? null;
  if (!partnerTenantId) {
    return { updated: false, partnerTenantId: null };
  }

  if (!opts?.force) {
    const eligible = await isPartnerWholesaleBlockEligible(subscriptionId);
    if (!eligible) {
      return { updated: false, partnerTenantId, eligible: false };
    }
  }

  const upd = await pool.query(
    `UPDATE partner_profiles
     SET wholesale_status = 'past_due',
         wholesale_past_due_at = COALESCE(wholesale_past_due_at, now()),
         updated_at = now()
     WHERE partner_tenant_id = $1
       AND wholesale_status IS DISTINCT FROM 'past_due'
     RETURNING partner_tenant_id`,
    [partnerTenantId]
  );

  if (upd.rows[0]) {
    const resolved = await resolveWholesaleBlockAfterDaysForSubscription(subscriptionId);
    console.log('[WHOLESALE] past_due', {
      partnerTenantId,
      subscriptionId,
      block_after_days: resolved.days,
      source: resolved.source,
    });

    await writeBillingAuditEvent({
      actor: opts?.origin ?? 'wholesale_status',
      actor_type: 'system',
      action: 'partner_wholesale.past_due',
      entity_type: 'partner_profile',
      entity_id: partnerTenantId,
      reason: 'inadimplencia',
      origin: opts?.origin ?? 'markPartnerWholesalePastDueBySubscription',
      payload: {
        subscription_id: subscriptionId,
        block_after_days: resolved.days,
        block_source: resolved.source,
        override_days: resolved.override_days,
      },
    });

    void import('./partnerWholesalePastDueNotifyService.js')
      .then((m) =>
        m.notifyPartnerWholesalePastDue({
          partnerTenantId,
          subscriptionId,
          blockAfterDays: resolved.days,
        })
      )
      .catch((e) => console.warn('[WHOLESALE] past_due notify', e));
  }
  return { updated: (upd.rowCount ?? 0) > 0, partnerTenantId, eligible: true };
}

export async function clearPartnerWholesalePastDueBySubscription(
  subscriptionId: string,
  opts?: { origin?: string }
): Promise<{ updated: boolean; partnerTenantId: string | null }> {
  const r = await pool.query<{ partner_tenant_id: string }>(
    `SELECT partner_tenant_id::text
     FROM partner_profiles
     WHERE wholesale_subscription_id = $1
     LIMIT 1`,
    [subscriptionId]
  );
  const partnerTenantId = r.rows[0]?.partner_tenant_id ?? null;
  if (!partnerTenantId) {
    return { updated: false, partnerTenantId: null };
  }

  const upd = await pool.query(
    `UPDATE partner_profiles
     SET wholesale_status = 'active',
         wholesale_past_due_at = NULL,
         updated_at = now()
     WHERE partner_tenant_id = $1
       AND wholesale_status = 'past_due'
     RETURNING partner_tenant_id`,
    [partnerTenantId]
  );

  if (upd.rows[0]) {
    console.log('[WHOLESALE] past_due cleared → active', { partnerTenantId, subscriptionId });
    await writeBillingAuditEvent({
      actor: opts?.origin ?? 'wholesale_status',
      actor_type: 'system',
      action: 'partner_wholesale.past_due_cleared',
      entity_type: 'partner_profile',
      entity_id: partnerTenantId,
      reason: 'pagamento',
      origin: opts?.origin ?? 'clearPartnerWholesalePastDueBySubscription',
      payload: { subscription_id: subscriptionId },
    });
  }
  return { updated: (upd.rowCount ?? 0) > 0, partnerTenantId };
}

/**
 * Varredura: Partners com wholesale_subscription_id elegíveis a past_due
 * conforme override/global block_after_days.
 */
export async function syncPartnerWholesalePastDueStatuses(opts?: {
  limit?: number;
}): Promise<{ scanned: number; marked: number; block_after_days: number }> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  const blockAfterDays = await getPartnerWholesaleBlockAfterDays();
  const r = await pool.query<{ partner_tenant_id: string; wholesale_subscription_id: string }>(
    `SELECT partner_tenant_id::text, wholesale_subscription_id::text
     FROM partner_profiles
     WHERE wholesale_subscription_id IS NOT NULL
       AND wholesale_status IN ('active', 'none')
     ORDER BY updated_at ASC
     LIMIT $1`,
    [limit]
  );

  let marked = 0;
  for (const row of r.rows) {
    const res = await markPartnerWholesalePastDueBySubscription(row.wholesale_subscription_id, {
      origin: 'syncPartnerWholesalePastDueStatuses',
    });
    if (res.updated) marked += 1;
  }
  return { scanned: r.rows.length, marked, block_after_days: blockAfterDays };
}

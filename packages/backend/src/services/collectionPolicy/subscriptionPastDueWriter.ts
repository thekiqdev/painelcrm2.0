/**
 * Writer past_due para assinaturas SaaS (Billing 2.0 Sprint 5).
 *
 * - Só escreve com Feature Flag `past_due_writer_enabled` (default OFF).
 * - Marca `active` → `past_due` quando há fatura overdue além do grace.
 * - Não suspende tenant (isso é action separada / flags destrutivas).
 * - Limpa `past_due` → `active` no pagamento (reativação de contrato).
 */
import { pool } from '../../utils/db.js';
import { isBilling2FlagEnabled } from '../billing2/billingFeatureFlags.js';
import { getActiveCollectionPolicy } from './reader.js';
import { writeBillingAuditEvent } from './billingAuditEventWriter.js';

export type PastDueMarkResult = {
  status: 'ok' | 'skipped' | 'error';
  detail: string;
  subscription_id?: string;
};

function parseGraceDays(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

/**
 * Resolve grace efetivo: subscription.grace_period_days → policy → 3.
 */
export async function resolveEffectiveGraceDays(subscriptionId: string): Promise<number> {
  let fallback = 3;
  try {
    const { policy } = await getActiveCollectionPolicy();
    fallback = policy.grace_period_days;
  } catch {
    /* ignore */
  }
  try {
    const r = await pool.query<{ grace_period_days: number | null }>(
      `SELECT grace_period_days FROM subscriptions WHERE id = $1`,
      [subscriptionId]
    );
    const g = r.rows[0]?.grace_period_days;
    if (g != null && Number.isFinite(Number(g))) return parseGraceDays(g, fallback);
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * True se a assinatura tem cobrança overdue com due_date + grace < hoje (UTC date).
 */
export async function isSubscriptionPastDueEligible(
  subscriptionId: string,
  graceDays?: number
): Promise<boolean> {
  const grace = graceDays ?? (await resolveEffectiveGraceDays(subscriptionId));
  const r = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM tenant_billing tb
     WHERE tb.subscription_id = $1
       AND tb.status = 'overdue'
       AND (tb.due_date + ($2::int || ' days')::interval)::date < CURRENT_DATE
     LIMIT 1`,
    [subscriptionId, grace]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function markSubscriptionPastDue(input: {
  subscriptionId: string;
  reason?: string;
  correlationId?: string | null;
  /** Se true, ignora flag (apenas testes). */
  force?: boolean;
  /** Se true, não exige overdue+grace (já validado pelo caller). */
  skipEligibilityCheck?: boolean;
}): Promise<PastDueMarkResult> {
  if (!input.force && !(await isBilling2FlagEnabled('past_due_writer_enabled'))) {
    return { status: 'skipped', detail: 'flag_past_due_writer_off', subscription_id: input.subscriptionId };
  }

  if (!input.skipEligibilityCheck) {
    const eligible = await isSubscriptionPastDueEligible(input.subscriptionId);
    if (!eligible) {
      return {
        status: 'skipped',
        detail: 'not_eligible_overdue_beyond_grace',
        subscription_id: input.subscriptionId,
      };
    }
  }

  const r = await pool.query<{ id: string; status: string }>(
    `UPDATE subscriptions
     SET status = 'past_due', updated_at = now()
     WHERE id = $1
       AND type = 'saas'
       AND status = 'active'
     RETURNING id, status`,
    [input.subscriptionId]
  );

  if (!r.rows[0]) {
    return { status: 'skipped', detail: 'not_active_or_missing', subscription_id: input.subscriptionId };
  }

  await writeBillingAuditEvent({
    actor: 'past_due_writer',
    actor_type: 'system',
    action: 'subscription.past_due',
    entity_type: 'subscription',
    entity_id: input.subscriptionId,
    reason: input.reason ?? 'overdue_beyond_grace',
    origin: 'collection_policy',
    correlation_id: input.correlationId ?? null,
    payload: { subscription_id: input.subscriptionId, new_status: 'past_due' },
  });

  return { status: 'ok', detail: 'subscription_past_due', subscription_id: input.subscriptionId };
}

/**
 * past_due → active após pagamento (não requer flag writer — reativação de contrato).
 * Respeita unique saas active: só se não houver outra active no tenant.
 */
export async function clearSubscriptionPastDueOnPaid(input: {
  subscriptionId: string;
  billingId?: string | null;
  correlationId?: string | null;
}): Promise<PastDueMarkResult> {
  const sub = await pool.query<{ id: string; status: string; tenant_id: string; type: string }>(
    `SELECT id, status, tenant_id, type FROM subscriptions WHERE id = $1`,
    [input.subscriptionId]
  );
  const row = sub.rows[0];
  if (!row) {
    return { status: 'skipped', detail: 'subscription_not_found' };
  }
  if (row.status !== 'past_due') {
    return { status: 'skipped', detail: `status_${row.status}`, subscription_id: row.id };
  }

  const otherActive = await pool.query<{ id: string }>(
    `SELECT id FROM subscriptions
     WHERE tenant_id = $1 AND type = 'saas' AND status = 'active' AND id <> $2
     LIMIT 1`,
    [row.tenant_id, row.id]
  );
  if (otherActive.rows[0]) {
    return {
      status: 'skipped',
      detail: 'other_active_saas_exists',
      subscription_id: row.id,
    };
  }

  await pool.query(
    `UPDATE subscriptions SET status = 'active', updated_at = now() WHERE id = $1 AND status = 'past_due'`,
    [row.id]
  );

  await writeBillingAuditEvent({
    actor: 'past_due_writer',
    actor_type: 'system',
    action: 'subscription.past_due_cleared',
    entity_type: 'subscription',
    entity_id: row.id,
    reason: 'payment_paid',
    origin: 'collection_policy',
    correlation_id: input.correlationId ?? null,
    payload: {
      subscription_id: row.id,
      billing_id: input.billingId ?? null,
      new_status: 'active',
    },
  });

  return { status: 'ok', detail: 'past_due_cleared_to_active', subscription_id: row.id };
}

export type SyncPastDueOptions = {
  tenantId?: string | null;
  /** Só reporta elegíveis sem UPDATE */
  dryRun?: boolean;
  limit?: number;
};

/**
 * Varredura batch (chamada no sync overdue). Flag OFF → no-op.
 */
export async function syncSaasSubscriptionsPastDue(
  options: SyncPastDueOptions = {}
): Promise<{ scanned: number; marked: number; skipped: number; dry_run: boolean; ids: string[] }> {
  const dryRun = options.dryRun === true;
  if (!(await isBilling2FlagEnabled('past_due_writer_enabled'))) {
    return { scanned: 0, marked: 0, skipped: 0, dry_run: dryRun, ids: [] };
  }

  const limit = Math.min(500, Math.max(1, options.limit ?? 100));
  const tenantId = options.tenantId ?? null;

  // Assinaturas active com pelo menos uma overdue; grace avaliado por linha
  const candidates = await pool.query<{ id: string; grace_period_days: number | null }>(
    `SELECT DISTINCT s.id, s.grace_period_days
     FROM subscriptions s
     INNER JOIN tenant_billing tb ON tb.subscription_id = s.id AND tb.status = 'overdue'
     WHERE s.type = 'saas'
       AND s.status = 'active'
       AND ($1::uuid IS NULL OR s.tenant_id = $1::uuid)
     LIMIT $2`,
    [tenantId, limit]
  );

  let marked = 0;
  let skipped = 0;
  const ids: string[] = [];
  let policyGrace = 3;
  try {
    const { policy } = await getActiveCollectionPolicy();
    policyGrace = policy.grace_period_days;
  } catch {
    /* ignore */
  }

  for (const c of candidates.rows) {
    const grace = parseGraceDays(c.grace_period_days, policyGrace);
    const eligible = await isSubscriptionPastDueEligible(c.id, grace);
    if (!eligible) {
      skipped += 1;
      continue;
    }
    ids.push(c.id);
    if (dryRun) {
      marked += 1;
      continue;
    }
    const r = await markSubscriptionPastDue({
      subscriptionId: c.id,
      reason: 'sync_overdue_beyond_grace',
      skipEligibilityCheck: true,
      force: true, // flag já checada no início
    });
    if (r.status === 'ok') marked += 1;
    else skipped += 1;
  }

  return {
    scanned: candidates.rows.length,
    marked,
    skipped,
    dry_run: dryRun,
    ids,
  };
}

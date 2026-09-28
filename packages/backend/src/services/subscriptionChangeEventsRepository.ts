/**
 * Persistência de subscription_change_events (contrato + ciclo de vida CRM).
 */
import { pool } from '../utils/db.js';

export type SubscriptionChangeEventType =
  | 'upgrade'
  | 'downgrade'
  | 'interval_change'
  | 'description_change'
  | 'contract_update'
  | 'pause'
  | 'resume'
  | 'reactivate';

export type SubscriptionChangeEventStatus = 'pending' | 'applied' | 'cancelled';

let changeTypeColumnCache: boolean | undefined;

export async function subscriptionChangeEventsHasChangeTypeColumn(): Promise<boolean> {
  if (changeTypeColumnCache !== undefined) return changeTypeColumnCache;
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscription_change_events'
       AND column_name = 'change_type'`
  );
  changeTypeColumnCache = parseInt(r.rows[0]?.c ?? '0', 10) >= 1;
  return changeTypeColumnCache;
}

export async function insertSubscriptionChangeEvent(params: {
  tenantId: string;
  subscriptionId: string;
  change_type: SubscriptionChangeEventType;
  status: SubscriptionChangeEventStatus;
  effective_at?: 'immediate' | 'next_cycle' | null;
  amount_cents?: number | null;
  billing_interval?: string | null;
  description?: string | null;
  reason?: string | null;
  previous_amount_cents?: number | null;
  previous_billing_interval?: string | null;
  previous_description?: string | null;
  next_billing_date?: string | null;
  created_by?: string | null;
}): Promise<string> {
  const hasChangeType = await subscriptionChangeEventsHasChangeTypeColumn();
  if (hasChangeType) {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO subscription_change_events (
         tenant_id, subscription_id, change_type, effective_at, status,
         amount_cents, billing_interval, description, reason,
         previous_amount_cents, previous_billing_interval, previous_description,
         next_billing_date, created_by, applied_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9,
         $10, $11, $12,
         $13::date, $14,
         CASE WHEN $5 = 'applied' THEN now() ELSE NULL END
       )
       RETURNING id::text`,
      [
        params.tenantId,
        params.subscriptionId,
        params.change_type,
        params.effective_at ?? null,
        params.status,
        params.amount_cents ?? null,
        params.billing_interval ?? null,
        params.description ?? null,
        params.reason ?? null,
        params.previous_amount_cents ?? null,
        params.previous_billing_interval ?? null,
        params.previous_description ?? null,
        params.next_billing_date ?? null,
        params.created_by ?? null,
      ]
    );
    return r.rows[0]!.id;
  }

  const r = await pool.query<{ id: string }>(
    `INSERT INTO subscription_change_events (
       tenant_id, subscription_id, effective_at, status,
       amount_cents, billing_interval, description, reason,
       previous_amount_cents, previous_billing_interval, previous_description,
       created_by, applied_at
     ) VALUES (
       $1, $2, COALESCE($3, 'immediate'), $4,
       COALESCE($5, 1), COALESCE($6, 'monthly'), COALESCE($7, $3),
       $8, $9, $10, $11, $12,
       CASE WHEN $4 = 'applied' THEN now() ELSE NULL END
     )
     RETURNING id::text`,
    [
      params.tenantId,
      params.subscriptionId,
      params.effective_at ?? 'immediate',
      params.status,
      params.amount_cents ?? 1,
      params.billing_interval ?? 'monthly',
      params.description ?? params.change_type,
      params.reason ?? null,
      params.previous_amount_cents ?? null,
      params.previous_billing_interval ?? null,
      params.previous_description ?? null,
      params.created_by ?? null,
    ]
  );
  return r.rows[0]!.id;
}

export interface SubscriptionLifecycleEventRow {
  id: string;
  created_at: string;
  change_type: 'pause' | 'resume' | 'reactivate';
  reason: string | null;
  next_billing_date: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
}

export async function listSubscriptionLifecycleEvents(
  tenantId: string,
  subscriptionId: string
): Promise<SubscriptionLifecycleEventRow[]> {
  const hasChangeType = await subscriptionChangeEventsHasChangeTypeColumn();
  if (!hasChangeType) return [];

  const r = await pool.query<SubscriptionLifecycleEventRow & { change_type: string }>(
    `SELECT e.id::text,
            e.created_at::text,
            e.change_type,
            e.reason,
            e.next_billing_date::text,
            e.created_by::text AS actor_user_id,
            NULLIF(TRIM(
              COALESCE(
                NULLIF(TRIM(COALESCE(pr.first_name, '') || ' ' || COALESCE(pr.last_name, '')), ''),
                NULLIF(TRIM(u.email), '')
              )
            ), '') AS actor_name
     FROM subscription_change_events e
     LEFT JOIN users u ON u.id = e.created_by
     LEFT JOIN profiles pr ON pr.id = u.id
     WHERE e.tenant_id = $1 AND e.subscription_id = $2
       AND e.change_type IN ('pause', 'resume', 'reactivate')
     ORDER BY e.created_at ASC`,
    [tenantId, subscriptionId]
  );
  return r.rows.filter((row): row is SubscriptionLifecycleEventRow =>
    row.change_type === 'pause' || row.change_type === 'resume' || row.change_type === 'reactivate'
  );
}

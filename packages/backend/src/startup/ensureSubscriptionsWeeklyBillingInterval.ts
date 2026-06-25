import type { Pool } from 'pg';

/** DDL idempotente — espelha `276_subscriptions_billing_interval_weekly_crm.sql`. */
const SUBSCRIPTIONS_WEEKLY_INTERVAL_DDL = `
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'subscriptions' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%billing_interval%'
  LIMIT 1;
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_interval_check
  CHECK (billing_interval IN ('weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly'));
`;

async function subscriptionsConstraintAllowsWeekly(pool: Pool): Promise<boolean> {
  const r = await pool.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
         AND t.relname = 'subscriptions'
         AND c.contype = 'c'
         AND pg_get_constraintdef(c.oid) LIKE '%billing_interval%'
         AND pg_get_constraintdef(c.oid) LIKE '%weekly%'
     ) AS ok`
  );
  return Boolean(r.rows[0]?.ok);
}

/**
 * Garante que assinaturas CRM aceitam `billing_interval = weekly`.
 * Corrige ambientes onde o código foi deployado antes de `276_subscriptions_billing_interval_weekly_crm.sql`.
 */
export async function ensureSubscriptionsWeeklyBillingInterval(pool: Pool): Promise<void> {
  try {
    if (await subscriptionsConstraintAllowsWeekly(pool)) return;
    await pool.query(SUBSCRIPTIONS_WEEKLY_INTERVAL_DDL);
    if (await subscriptionsConstraintAllowsWeekly(pool)) {
      console.log('[boot] subscriptions.billing_interval: constraint atualizada para incluir weekly (CRM).');
      return;
    }
    console.warn('[boot] subscriptions.billing_interval: weekly ainda indisponível após bootstrap DDL.');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('42P01') && /subscriptions/i.test(msg)) {
      console.warn('[boot] subscriptions.billing_interval: tabela ausente; bootstrap ignorado.');
      return;
    }
    throw e;
  }
}

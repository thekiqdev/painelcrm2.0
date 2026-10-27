import { pool } from '../utils/db.js';
import { isPhase2TrialCrmGateEnabled } from '../config/checkoutTrialFeatureFlags.js';

export type HttpBlock = { status: number; body: Record<string, unknown> };

/**
 * Mesma regra de `requireTenantCommercialAccess` quando já há tenant e o ator não é super admin.
 * null = pode seguir.
 */
export async function commercialAccessBlock(tenantId: string): Promise<HttpBlock | null> {
  if (!isPhase2TrialCrmGateEnabled()) return null;
  const row = await pool.query<{
    status: string;
    suspension_reason: string | null;
    trial_ends_at: string | null;
    activated_billing_id: string | null;
  }>(
    `SELECT status, suspension_reason, trial_ends_at, activated_billing_id
     FROM tenants WHERE id = $1`,
    [tenantId]
  );
  const t = row.rows[0];
  if (!t) return null;
  if (t.activated_billing_id || t.status === 'active') return null;

  const trialEndedUnpaid =
    t.status === 'trial' &&
    t.trial_ends_at != null &&
    new Date(t.trial_ends_at) < new Date() &&
    t.activated_billing_id == null;

  const trialEndedWhilePaymentPending =
    t.status === 'payment_pending' &&
    t.trial_ends_at != null &&
    new Date(t.trial_ends_at) < new Date() &&
    t.activated_billing_id == null;

  if (
    trialEndedUnpaid ||
    trialEndedWhilePaymentPending ||
    (t.status === 'suspended' && t.suspension_reason === 'trial_expired')
  ) {
    return {
      status: 403,
      body: {
        error: 'Período de trial encerrado. Conclua o pagamento para continuar.',
        code: 'TRIAL_EXPIRED',
        requires_checkout_resume: true,
      },
    };
  }
  return null;
}

/** Mesma regra de `requireActivePlanPeriod`. null = período ok ou sem data. */
export async function planPeriodBlock(tenantId: string): Promise<HttpBlock | null> {
  const row = await pool.query<{ plan_period_end: string | null }>(
    'SELECT plan_period_end FROM tenants WHERE id = $1',
    [tenantId]
  );
  const periodEnd = row.rows[0]?.plan_period_end;
  if (!periodEnd) return null;
  if (new Date(periodEnd) < new Date()) {
    return {
      status: 402,
      body: {
        error: 'Período do plano expirado. Renove para continuar acessando.',
        code: 'PLAN_EXPIRED',
        redirect: '/meu-plano',
      },
    };
  }
  return null;
}

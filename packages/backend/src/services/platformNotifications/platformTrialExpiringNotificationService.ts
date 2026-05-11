import { pool } from '../../utils/db.js';
import { schedulePublishPlatformTrialExpiring } from './platformBusinessNotifications.js';

const TRIAL_EXPIRING_DAYS_LEFT = 3;

function isPlatformTrialExpiringNotificationJobEnabled(): boolean {
  const raw = process.env.PLATFORM_TRIAL_EXPIRING_NOTIFICATION_JOB?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * Avisa admins de tenants em trial quando faltam 3 dias para o fim (America/Sao_Paulo).
 * Idempotência por tenant/data no publisher (`platform.trial.expiring`).
 */
export async function notifyPlatformTrialsExpiringSoon(): Promise<{ notified: number }> {
  if (!isPlatformTrialExpiringNotificationJobEnabled()) {
    return { notified: 0 };
  }

  const r = await pool.query<{ id: string }>(
    `SELECT t.id::text AS id
     FROM tenants t
     WHERE t.trial_ends_at IS NOT NULL
       AND t.activated_billing_id IS NULL
       AND t.status IN ('trial', 'payment_pending')
       AND (timezone('America/Sao_Paulo', t.trial_ends_at))::date =
           (timezone('America/Sao_Paulo', now()) + interval '3 days')::date`,
  );

  for (const row of r.rows) {
    schedulePublishPlatformTrialExpiring(row.id, TRIAL_EXPIRING_DAYS_LEFT);
  }

  return { notified: r.rows.length };
}

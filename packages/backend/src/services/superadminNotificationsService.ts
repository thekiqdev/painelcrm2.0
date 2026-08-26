import { pool } from '../utils/db.js';
import {
  PLATFORM_CUSTOMER_ACCOUNT_TYPE,
  SQL_TENANT_IS_PLATFORM_CUSTOMER,
} from '../partner/superadminTenantListScope.js';

const NOTIFICATION_TYPE_NEW_TENANT = 'superadmin_new_tenant';
const NOTIFICATION_TYPE_TRIAL_ENDING = 'superadmin_trial_ending';
const TRIAL_DAYS_AHEAD = 7;

async function getSuperAdminUserIds(): Promise<string[]> {
  const result = await pool.query('SELECT id FROM users WHERE is_super_admin = true');
  return result.rows.map((r: { id: string }) => r.id);
}

/**
 * Cria notificação para todos os super admins (ex.: novo tenant).
 */
export async function notifySuperAdminsNewTenant(tenantName: string, tenantId: string): Promise<void> {
  try {
    const typeR = await pool.query<{ account_type: string }>(
      `SELECT account_type FROM tenants WHERE id = $1::uuid LIMIT 1`,
      [tenantId]
    );
    if (typeR.rows[0]?.account_type !== PLATFORM_CUSTOMER_ACCOUNT_TYPE) {
      return;
    }
    const userIds = await getSuperAdminUserIds();
    for (const userId of userIds) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, data, read)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [
          userId,
          NOTIFICATION_TYPE_NEW_TENANT,
          'Novo cliente cadastrado',
          `O cliente "${tenantName}" foi cadastrado no painel.`,
          JSON.stringify({ tenant_id: tenantId, tenant_name: tenantName }),
        ]
      );
    }
  } catch (e) {
    console.error('notifySuperAdminsNewTenant error:', e);
  }
}

/**
 * Verifica tenants em trial que terminam nos próximos N dias e cria notificação para super admins.
 */
export async function checkAndNotifyTrialEnding(): Promise<{ notified: number }> {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, trial_ends_at FROM tenants
       WHERE ${SQL_TENANT_IS_PLATFORM_CUSTOMER}
         AND status = 'trial' AND trial_ends_at IS NOT NULL
         AND trial_ends_at > now() AND trial_ends_at <= now() + ($1::text || ' days')::interval`,
      [TRIAL_DAYS_AHEAD]
    );
    const userIds = await getSuperAdminUserIds();
    let notified = 0;
    for (const tenant of result.rows) {
      const endsAt = new Date(tenant.trial_ends_at);
      const daysLeft = Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      for (const userId of userIds) {
        const existing = await pool.query(
          `SELECT id FROM notifications WHERE user_id = $1 AND type = $2 AND data->>'tenant_id' = $3 AND created_at > now() - interval '2 days'`,
          [userId, NOTIFICATION_TYPE_TRIAL_ENDING, tenant.id]
        );
        if (existing.rows.length > 0) continue;
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, message, data, read)
           VALUES ($1, $2, $3, $4, $5, false)`,
          [
            userId,
            NOTIFICATION_TYPE_TRIAL_ENDING,
            'Trial terminando em breve',
            `O cliente "${tenant.name}" (${tenant.slug}) encerra o trial em ${daysLeft} dia(s) (${endsAt.toLocaleDateString('pt-BR')}).`,
            JSON.stringify({ tenant_id: tenant.id, tenant_name: tenant.name, trial_ends_at: tenant.trial_ends_at }),
          ]
        );
        notified++;
      }
    }
    return { notified };
  } catch (e) {
    console.error('checkAndNotifyTrialEnding error:', e);
    return { notified: 0 };
  }
}

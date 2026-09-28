import type { Pool } from 'pg';
import { getCachedPlatformNotificationsFlags } from './platformNotificationsRuntimeFlags.js';

export type PlatformWhatsAppOutboundReady = {
  chatInstanceId: string;
  instanceToken: string;
  ownerUserId: string;
};

/**
 * UUID da instância WhatsApp (chat_instances) designada em superadmin_settings.
 */
export function resolvePlatformWhatsAppChatInstanceId(): string | null {
  const id = getCachedPlatformNotificationsFlags().whatsappChatInstanceId?.trim();
  return id || null;
}

/**
 * Valida instância designada: existe, está connected/open, pertence a utilizador Super Admin.
 * Usado pelo orquestrador antes de enfileirar/enviar.
 */
export async function resolvePlatformWhatsAppOutboundReady(
  pool: Pool,
): Promise<PlatformWhatsAppOutboundReady | null> {
  const configuredId = resolvePlatformWhatsAppChatInstanceId();
  if (!configuredId) return null;

  const r = await pool.query<{
    id: string;
    instance_token: string;
    owner_user_id: string;
    status: string;
  }>(
    `SELECT i.id::text AS id, i.instance_token, i.user_id::text AS owner_user_id, i.status
     FROM chat_instances i
     INNER JOIN users u ON u.id = i.user_id
     WHERE i.id = $1::uuid
       AND u.is_super_admin = true
       AND i.status IN ('connected', 'open')
     LIMIT 1`,
    [configuredId],
  );

  const row = r.rows[0];
  if (!row) return null;

  return {
    chatInstanceId: row.id,
    instanceToken: row.instance_token,
    ownerUserId: row.owner_user_id,
  };
}

/** Se piloto definido (CSV em settings), só estes target_tenant_id podem receber. */
export function isPlatformNotificationPilotTargetAllowed(targetTenantId: string): boolean {
  const raw = getCachedPlatformNotificationsFlags().pilotTargetTenantIds?.trim();
  if (!raw) return true;
  const allowed = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(targetTenantId.toLowerCase());
}

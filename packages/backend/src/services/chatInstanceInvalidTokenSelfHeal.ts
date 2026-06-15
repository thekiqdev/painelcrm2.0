import type { Pool } from 'pg';

const LOG_PREFIX = '[chat_instance_health]';

export type ChatInstanceInvalidTokenHealSource = 'dispatch_whatsapp_text' | 'get_instance_status';

export function isUazapiInvalidTokenSignal(message: string, httpStatus?: number | null): boolean {
  const m = String(message ?? '').toLowerCase();
  if (httpStatus === 401 || httpStatus === 403) return true;
  if (/invalid token/i.test(m)) return true;
  if (/token inválido/i.test(m)) return true;
  return false;
}

export function extractUazapiErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const st = Number((error as { status: unknown }).status);
  return Number.isFinite(st) ? st : undefined;
}

function logChatInstanceHealth(
  action: 'invalid_token_detected' | 'instance_marked_disconnected',
  fields: {
    instanceId: string;
    userId: string;
    tenantId: string | null;
    externalInstanceName: string | null;
    reason: string;
    source: ChatInstanceInvalidTokenHealSource;
  },
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    action,
    instanceId: fields.instanceId,
    userId: fields.userId,
    tenantId: fields.tenantId,
    externalInstanceName: fields.externalInstanceName,
    reason: fields.reason.slice(0, 500),
    source: fields.source,
  });
  console.warn(LOG_PREFIX, line);
}

/**
 * Sincroniza chat_instances quando a UazAPI indica token inválido.
 * Não recria token nem chama connect — apenas status + metadata.
 */
export async function markChatInstanceDisconnectedForInvalidToken(
  pool: Pool,
  params: {
    instanceId: string;
    userId: string;
    tenantId: string | null;
    externalInstanceName: string | null;
    reason: string;
    source: ChatInstanceInvalidTokenHealSource;
  },
): Promise<void> {
  logChatInstanceHealth('invalid_token_detected', params);

  const detectedAt = new Date().toISOString();
  const metadataPatch = JSON.stringify({
    invalidTokenDetected: true,
    invalidTokenDetectedAt: detectedAt,
  });

  await pool.query(
    `UPDATE chat_instances
     SET status = 'disconnected',
         metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
         updated_at = now()
     WHERE id = $2::uuid`,
    [metadataPatch, params.instanceId],
  );

  logChatInstanceHealth('instance_marked_disconnected', params);
}

import type { Pool } from 'pg';
import { uazapiService } from './uazapi.js';
import {
  isChatInstanceStatusOperable,
  mapUazStatusPayloadToDbStatus,
} from './chatInstanceOperableStatus.js';

export type RefreshChatInstanceStatusResult = {
  status: string;
  operable: boolean;
  changed: boolean;
};

/**
 * Consulta a UazAPI e sincroniza chat_instances.status (SSOT para envio / UI).
 * Não recria token nem chama connect.
 */
export async function refreshChatInstanceStatusFromUaz(
  pool: Pool,
  params: {
    instanceId: string;
    instanceToken: string;
    currentStatus: string;
    source: string;
  },
): Promise<RefreshChatInstanceStatusResult> {
  const result = await uazapiService.getInstanceStatus(params.instanceToken);
  const status = mapUazStatusPayloadToDbStatus(result, params.currentStatus);
  const changed = status !== params.currentStatus;

  if (changed) {
    await pool.query(
      `UPDATE chat_instances
       SET status = $1, updated_at = now()
       WHERE id = $2::uuid`,
      [status, params.instanceId],
    );
    console.warn(
      '[chat_instance_health]',
      JSON.stringify({
        ts: new Date().toISOString(),
        action: 'status_refreshed_from_uaz',
        instanceId: params.instanceId,
        previousStatus: params.currentStatus,
        nextStatus: status,
        source: params.source,
      }),
    );
  }

  return {
    status,
    operable: isChatInstanceStatusOperable(status),
    changed,
  };
}

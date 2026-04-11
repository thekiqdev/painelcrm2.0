import { pool } from './db.js';

/**
 * Instância WhatsApp (chat_instances) — compartilhamento operacional por tenant:
 * o dono da linha (`user_id`) pode gerir; utilizadores do mesmo `tenant_id` podem operar
 * (listar, estado, sync, conversas) sem ser o criador.
 */

export type ChatInstanceDbRow = {
  id: string;
  user_id: string;
  name: string;
  external_instance_name: string | null;
  instance_token: string;
  status: string;
  metadata: unknown;
  connected_phone?: string | null;
  phone_key?: string | null;
  created_at?: Date;
  updated_at?: Date;
};

/** Mesmo critério que RLS `chat_instances_select_policy`: dono OU mesmo tenant (ambos com tenant_id). */
export async function fetchInstanceForOperate(
  actorUserId: string,
  instanceId: string
): Promise<ChatInstanceDbRow | null> {
  const r = await pool.query<ChatInstanceDbRow>(
    `SELECT i.* FROM chat_instances i
     INNER JOIN users owner ON owner.id = i.user_id
     INNER JOIN users actor ON actor.id = $1
     WHERE i.id = $2
       AND (
         i.user_id = $1
         OR (
           owner.tenant_id IS NOT NULL
           AND actor.tenant_id IS NOT NULL
           AND owner.tenant_id = actor.tenant_id
         )
       )`,
    [actorUserId, instanceId]
  );
  return r.rows[0] ?? null;
}

/** Apenas o criador da instância (dono técnico) — QR, delete, webhook, patch de configuração. */
export async function fetchInstanceForManage(
  actorUserId: string,
  instanceId: string
): Promise<ChatInstanceDbRow | null> {
  const r = await pool.query<ChatInstanceDbRow>(
    `SELECT * FROM chat_instances WHERE id = $1 AND user_id = $2`,
    [instanceId, actorUserId]
  );
  return r.rows[0] ?? null;
}

export async function listInstancesForActor(actorUserId: string): Promise<ChatInstanceDbRow[]> {
  const r = await pool.query<ChatInstanceDbRow>(
    `SELECT i.* FROM chat_instances i
     INNER JOIN users owner ON owner.id = i.user_id
     INNER JOIN users actor ON actor.id = $1
     WHERE (
       i.user_id = $1
       OR (
         owner.tenant_id IS NOT NULL
         AND actor.tenant_id IS NOT NULL
         AND owner.tenant_id = actor.tenant_id
       )
     )
     ORDER BY i.created_at DESC`,
    [actorUserId]
  );
  return r.rows;
}

export function decorateInstanceForApi(row: ChatInstanceDbRow, actorUserId: string): Record<string, unknown> {
  const can_manage = row.user_id === actorUserId;
  const can_operate = true;
  const base: Record<string, unknown> = {
    ...row,
    can_operate,
    can_manage,
  };
  if (!can_manage) {
    delete base.instance_token;
  }
  return base;
}

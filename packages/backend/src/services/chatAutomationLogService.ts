import { pool } from '../utils/db.js';

export type InsertChatAutomationLogParams = {
  tenantId: string;
  conversationId: string;
  ruleId?: string | null;
  eventType: string;
  actionType: string;
  result?: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export async function insertChatAutomationLog(params: InsertChatAutomationLogParams): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_automation_logs (
         tenant_id, conversation_id, rule_id, event_type, action_type, result, error_message, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        params.tenantId,
        params.conversationId,
        params.ruleId ?? null,
        params.eventType,
        params.actionType,
        params.result ?? 'ok',
        params.errorMessage ?? null,
        JSON.stringify(params.metadata ?? {}),
      ]
    );
  } catch (e) {
    console.warn('[chatAutomationLog] insert skipped', e);
  }
}

export async function listAutomationLogsForTenant(
  tenantId: string,
  limit: number
): Promise<
  Array<{
    id: string;
    conversation_id: string;
    rule_id: string | null;
    event_type: string;
    action_type: string;
    result: string;
    error_message: string | null;
    metadata: unknown;
    created_at: Date;
  }>
> {
  const r = await pool.query(
    `SELECT id, conversation_id, rule_id, event_type, action_type, result, error_message, metadata, created_at
     FROM chat_automation_logs
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit]
  );
  return r.rows as Array<{
    id: string;
    conversation_id: string;
    rule_id: string | null;
    event_type: string;
    action_type: string;
    result: string;
    error_message: string | null;
    metadata: unknown;
    created_at: Date;
  }>;
}

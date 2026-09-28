import { pool } from '../utils/db.js';
import type { ChatBotRuleRow } from './chatbotEngine.js';

function mapRow(row: Record<string, unknown>): ChatBotRuleRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name),
    type: String(row.rule_type) as ChatBotRuleRow['type'],
    is_active: Boolean(row.is_active),
    trigger_config: (row.trigger_config as Record<string, unknown>) ?? {},
    action_config: (row.action_config as Record<string, unknown>) ?? {},
    priority: Number(row.priority) || 100,
  };
}

export async function listChatBotRulesForTenant(tenantId: string): Promise<ChatBotRuleRow[]> {
  const r = await pool.query(
    `SELECT * FROM chat_bot_rules WHERE tenant_id = $1 ORDER BY priority ASC, name ASC`,
    [tenantId]
  );
  return r.rows.map((row) => mapRow(row as Record<string, unknown>));
}

export async function getChatBotRuleById(tenantId: string, ruleId: string): Promise<ChatBotRuleRow | null> {
  const r = await pool.query(`SELECT * FROM chat_bot_rules WHERE tenant_id = $1 AND id = $2`, [tenantId, ruleId]);
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row as Record<string, unknown>);
}

export async function insertChatBotRule(input: {
  tenantId: string;
  name: string;
  type: ChatBotRuleRow['type'];
  is_active?: boolean;
  trigger_config?: Record<string, unknown>;
  action_config?: Record<string, unknown>;
  priority?: number;
}): Promise<ChatBotRuleRow> {
  const r = await pool.query(
    `INSERT INTO chat_bot_rules (tenant_id, name, rule_type, is_active, trigger_config, action_config, priority)
     VALUES ($1, $2, $3::chat_bot_rule_type, COALESCE($4, true), $5::jsonb, $6::jsonb, COALESCE($7, 100))
     RETURNING *`,
    [
      input.tenantId,
      input.name.trim(),
      input.type,
      input.is_active,
      JSON.stringify(input.trigger_config ?? {}),
      JSON.stringify(input.action_config ?? {}),
      input.priority ?? 100,
    ]
  );
  return mapRow(r.rows[0] as Record<string, unknown>);
}

export async function updateChatBotRule(
  tenantId: string,
  ruleId: string,
  patch: Partial<{
    name: string;
    is_active: boolean;
    trigger_config: Record<string, unknown>;
    action_config: Record<string, unknown>;
    priority: number;
  }>
): Promise<ChatBotRuleRow | null> {
  const keys = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined);
  if (keys.length === 0) return getChatBotRuleById(tenantId, ruleId);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let n = 1;
  for (const k of keys) {
    if (k === 'trigger_config' || k === 'action_config') {
      sets.push(`${k} = $${n++}::jsonb`);
      vals.push(JSON.stringify((patch as Record<string, unknown>)[k]));
    } else {
      sets.push(`${k} = $${n++}`);
      vals.push((patch as Record<string, unknown>)[k]);
    }
  }
  vals.push(ruleId, tenantId);
  const r = await pool.query(
    `UPDATE chat_bot_rules SET ${sets.join(', ')}, updated_at = now()
     WHERE id = $${n} AND tenant_id = $${n + 1}
     RETURNING *`,
    vals
  );
  const row = r.rows[0];
  if (!row) return null;
  return mapRow(row as Record<string, unknown>);
}

export async function deleteChatBotRule(tenantId: string, ruleId: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM chat_bot_rules WHERE id = $1 AND tenant_id = $2 RETURNING id`, [
    ruleId,
    tenantId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

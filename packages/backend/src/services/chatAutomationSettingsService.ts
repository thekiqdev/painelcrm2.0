import { pool } from '../utils/db.js';

export type ChatAutomationSettingsRow = {
  tenant_id: string;
  automation_enabled: boolean;
  auto_status_from_customer: boolean;
  auto_status_from_agent: boolean;
  distribution_enabled: boolean;
  sla_alerts_enabled: boolean;
  sla_risk_percent: number;
  sla_first_response_minutes: number | null;
  sla_next_response_minutes: number | null;
  inactivity_reset_minutes: number | null;
  updated_at: Date;
};

export async function ensureAutomationSettingsRow(tenantId: string): Promise<void> {
  await pool.query(
    `INSERT INTO chat_automation_settings (tenant_id)
     VALUES ($1)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [tenantId]
  );
}

export async function getAutomationSettings(tenantId: string): Promise<ChatAutomationSettingsRow | null> {
  const r = await pool.query<ChatAutomationSettingsRow>(
    `SELECT tenant_id, automation_enabled, auto_status_from_customer, auto_status_from_agent,
            distribution_enabled,
            COALESCE(sla_alerts_enabled, true) AS sla_alerts_enabled,
            COALESCE(sla_risk_percent, 80) AS sla_risk_percent,
            sla_first_response_minutes, sla_next_response_minutes,
            inactivity_reset_minutes, updated_at
     FROM chat_automation_settings
     WHERE tenant_id = $1`,
    [tenantId]
  );
  return r.rows[0] ?? null;
}

export async function getOrCreateAutomationSettings(tenantId: string): Promise<ChatAutomationSettingsRow> {
  await ensureAutomationSettingsRow(tenantId);
  const row = await getAutomationSettings(tenantId);
  if (row) return row;
  return {
    tenant_id: tenantId,
    automation_enabled: false,
    auto_status_from_customer: true,
    auto_status_from_agent: true,
    distribution_enabled: false,
    sla_alerts_enabled: true,
    sla_risk_percent: 80,
    sla_first_response_minutes: null,
    sla_next_response_minutes: null,
    inactivity_reset_minutes: null,
    updated_at: new Date(),
  };
}

export async function patchAutomationSettings(
  tenantId: string,
  patch: Partial<{
    automation_enabled: boolean;
    auto_status_from_customer: boolean;
    auto_status_from_agent: boolean;
    distribution_enabled: boolean;
    sla_alerts_enabled: boolean;
    sla_risk_percent: number | null;
    sla_first_response_minutes: number | null;
    sla_next_response_minutes: number | null;
    inactivity_reset_minutes: number | null;
  }>
): Promise<ChatAutomationSettingsRow | null> {
  await ensureAutomationSettingsRow(tenantId);
  const keys = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
  if (keys.length === 0) return getAutomationSettings(tenantId);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let n = 1;
  for (const k of keys) {
    sets.push(`${k} = $${n++}`);
    vals.push(patch[k as keyof typeof patch]);
  }
  vals.push(tenantId);
  const r = await pool.query<ChatAutomationSettingsRow>(
    `UPDATE chat_automation_settings SET ${sets.join(', ')}, updated_at = now()
     WHERE tenant_id = $${n}
     RETURNING tenant_id, automation_enabled, auto_status_from_customer, auto_status_from_agent,
       distribution_enabled, sla_alerts_enabled, sla_risk_percent,
       sla_first_response_minutes, sla_next_response_minutes,
       inactivity_reset_minutes, updated_at`,
    vals
  );
  return r.rows[0] ?? null;
}

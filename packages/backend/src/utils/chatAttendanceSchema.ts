import { pool } from './db.js';

/**
 * Etapa 5 (`database/init/96_chat_conversations_attendance_etapa5.sql`).
 * Ambientes sem migration não têm `assigned_to_user_id` / `attendance_status`.
 *
 * TTL evita ficar com `false` para sempre se a migration for aplicada com o servidor já a correr
 * (ex.: dev). Reiniciar o backend também repõe o estado.
 */
const CHECK_TTL_MS = 60_000;
let cached: { value: boolean; checkedAt: number } | null = null;

export async function hasAttendanceColumns(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < CHECK_TTL_MS) {
    return cached.value;
  }
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'chat_conversations'
       AND column_name = 'assigned_to_user_id'`
  );
  const value = (r.rows[0]?.c ?? '0') === '1';
  cached = { value, checkedAt: now };
  return value;
}

/** Testes ou após aplicar migration sem esperar TTL. */
export function resetAttendanceColumnsCache(): void {
  cached = null;
}

let cachedTeam: { value: boolean; checkedAt: number } | null = null;

/** Coluna `assigned_team_id` (migration 98). */
export async function hasAssignedTeamColumn(): Promise<boolean> {
  const now = Date.now();
  if (cachedTeam && now - cachedTeam.checkedAt < CHECK_TTL_MS) {
    return cachedTeam.value;
  }
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'chat_conversations'
       AND column_name = 'assigned_team_id'`
  );
  const value = (r.rows[0]?.c ?? '0') === '1';
  cachedTeam = { value, checkedAt: now };
  return value;
}

let cachedSla: { value: boolean; checkedAt: number } | null = null;

/** Colunas SLA Fase 5 usadas em SELECT/ORDER BY — todas devem existir (evita 500 em BD parcial). */
export async function hasChatPhase5SlaColumns(): Promise<boolean> {
  const now = Date.now();
  if (cachedSla && now - cachedSla.checkedAt < CHECK_TTL_MS) {
    return cachedSla.value;
  }
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'chat_conversations'
       AND column_name IN (
         'first_response_at',
         'last_customer_message_at',
         'last_agent_message_at'
       )`
  );
  const value = (r.rows[0]?.c ?? '0') === '3';
  cachedSla = { value, checkedAt: now };
  return value;
}

/** Tabela chat_queues (Fase 5). */
export async function hasChatQueuesTable(): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chat_queues'`
  );
  return (r.rows[0]?.c ?? '0') === '1';
}

/** Fase 6: tabelas de automação. */
export async function hasChatAutomationTables(): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chat_automation_settings'`
  );
  return (r.rows[0]?.c ?? '0') === '1';
}

/** Fase 7: tabela de logs de automação. */
export async function hasChatAutomationLogsTable(): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chat_automation_logs'`
  );
  return (r.rows[0]?.c ?? '0') === '1';
}

/** Fase 8: regras do chatbot (`chat_bot_rules`, não confundir com Fase 6). */
export async function hasChatBotRulesTable(): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'chat_bot_rules'`
  );
  return (r.rows[0]?.c ?? '0') === '1';
}

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

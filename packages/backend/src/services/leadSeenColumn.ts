import { pool } from '../utils/db.js';

let ensured: Promise<void> | null = null;

/**
 * Garante a coluna seen_at.
 * Leads antigos ficam como vistos. Leads das últimas 6 horas que só foram
 * marcados com a data de criação (backfill) voltam a contar como não vistos.
 */
export function ensureLeadSeenColumn(): Promise<void> {
  if (!ensured) {
    ensured = ensureLeadSeenColumnOnce().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}

async function ensureLeadSeenColumnOnce(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.bypass_rls', '1', true)`);
    const exists = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'seen_at'`
    );
    if ((exists.rowCount ?? 0) === 0) {
      await client.query(`ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ`);
      await client.query(
        `UPDATE public.leads
         SET seen_at = COALESCE(created_at, now())
         WHERE seen_at IS NULL
           AND COALESCE(created_at, now()) < now() - interval '6 hours'`
      );
    } else {
      await client.query(
        `UPDATE public.leads
         SET seen_at = NULL
         WHERE seen_at = created_at
           AND created_at > now() - interval '6 hours'`
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* transação já encerrada */
    }
    throw error;
  } finally {
    client.release();
  }
}

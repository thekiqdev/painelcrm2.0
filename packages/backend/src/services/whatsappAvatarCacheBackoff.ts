/**
 * Backoff partilhado entre worker e scripts Super Admin (falha de cache CDN).
 */

import type { Pool } from 'pg';

export function sanitizeAvatarCacheErr(msg: string): string {
  const t = msg.replace(/\s+/g, ' ').trim();
  return t.length <= 500 ? t : `${t.slice(0, 497)}…`;
}

/** Próximo instante de retry após mais uma falha (valor de avatar_cache_attempts após incremento). */
export function computeNextRetryAtAfterFailure(
  attemptsAfterIncrement: number,
  maxFailures: number,
): Date | null {
  if (attemptsAfterIncrement >= maxFailures) return null;
  let hours = 1;
  if (attemptsAfterIncrement === 2) hours = 6;
  if (attemptsAfterIncrement >= 3) hours = 24;
  return new Date(Date.now() + hours * 3600 * 1000);
}

export async function persistConversationAvatarCacheFailure(
  db: Pool,
  row: { id: string; avatar_cache_attempts?: number | string | null },
  reason: string,
  maxFailures: number,
  logTag: string,
): Promise<void> {
  const prev = Number(row.avatar_cache_attempts ?? 0);
  const next = prev + 1;
  const nextAt = computeNextRetryAtAfterFailure(next, maxFailures);
  const err = sanitizeAvatarCacheErr(reason);
  try {
    await db.query(
      `UPDATE public.chat_conversations
       SET avatar_cache_attempts = $2::integer,
           avatar_cache_last_error = $3::text,
           avatar_cache_next_retry_at = $4::timestamptz,
           avatar_cache_status = 'fetch_failed',
           updated_at = now()
       WHERE id = $1::uuid`,
      [row.id, next, err, nextAt],
    );
  } catch (e: unknown) {
    console.warn(logTag, 'persist_failure_skipped', row.id, e);
  }
}

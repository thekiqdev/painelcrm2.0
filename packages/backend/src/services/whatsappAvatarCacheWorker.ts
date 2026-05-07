/**
 * Worker gradual: cache de avatares WhatsApp (intervalo + limite + backoff).
 */

import type { Pool } from 'pg';
import { pool } from '../utils/db.js';
import {
  getMediaAvatarWhatsappWorkerIntervalMinutes,
  getMediaAvatarWhatsappWorkerLimit,
  getMediaAvatarWhatsappWorkerMaxFailures,
  isMediaAvatarWhatsappEnabled,
  isMediaAvatarWhatsappWorkerEnabled,
} from './media/mediaConfig.js';
import type { CandidateRow } from './whatsappAvatarReprocessExecution.js';
import { processOneConversationReprocess } from './whatsappAvatarReprocessExecution.js';
import { persistConversationAvatarCacheFailure } from './whatsappAvatarCacheBackoff.js';

function sqlHasWaCdn(column: string): string {
  return `((${column})::text ILIKE '%whatsapp.net%' OR (${column})::text ILIKE '%whatsapp.com%')`;
}

function sqlInternalCached(): string {
  return `(btrim(COALESCE(c.avatar_cached_url,'')) <> ''
    AND (
      c.avatar_cached_url ILIKE '%/api/public/catalog-media/raw%'
      OR c.avatar_cached_url ILIKE '%/api/media/v1/raw%'
      OR c.avatar_cached_url ILIKE '%/media/catalog/%'
    ))`;
}

function sqlHasCdnSource(): string {
  return `(
    (c.avatar_source_url IS NOT NULL AND btrim(c.avatar_source_url::text) <> '' AND ${sqlHasWaCdn('c.avatar_source_url')})
    OR
    (c.avatar_url IS NOT NULL AND btrim(c.avatar_url::text) <> '' AND ${sqlHasWaCdn('c.avatar_url')})
  )`;
}

let workerCycleBusy = false;

export function isWhatsappAvatarCacheWorkerBusy(): boolean {
  return workerCycleBusy;
}

export { computeNextRetryAtAfterFailure } from './whatsappAvatarCacheBackoff.js';

async function fetchWorkerCandidates(db: Pool, limit: number, maxFailures: number): Promise<CandidateRow[]> {
  const q = `
    SELECT
      c.id::text AS id,
      u.tenant_id::text AS tenant_id,
      c.user_id::text AS user_id,
      c.client_id::text AS client_id,
      c.lead_id::text AS lead_id,
      c.contact_name,
      c.profile_name,
      c.phone_number,
      c.external_chat_id::text AS external_chat_id,
      c.avatar_url,
      c.avatar_cached_url,
      c.avatar_source_url,
      COALESCE(c.avatar_cache_attempts, 0)::integer AS avatar_cache_attempts
    FROM public.chat_conversations c
    INNER JOIN public.users u ON u.id = c.user_id
    WHERE ${sqlHasCdnSource()}
      AND NOT (${sqlInternalCached()})
      AND (c.avatar_cache_status IS NULL OR c.avatar_cache_status <> 'ok')
      AND COALESCE(c.avatar_cache_attempts, 0) < $1
      AND (c.avatar_cache_next_retry_at IS NULL OR c.avatar_cache_next_retry_at <= now())
    ORDER BY c.avatar_cache_next_retry_at NULLS FIRST, c.updated_at DESC
    LIMIT $2
  `;
  const r = await db.query<CandidateRow>(q, [maxFailures, limit]);
  return r.rows.map((row) => ({
    ...row,
    avatar_cache_attempts: row.avatar_cache_attempts ?? 0,
  }));
}

async function persistCycleMetrics(
  db: Pool,
  params: {
    startedAt: Date;
    finishedAt: Date;
    processed: number;
    success: number;
    failed: number;
    skipped: number;
  },
): Promise<void> {
  try {
    await db.query(
      `UPDATE public.whatsapp_avatar_cache_worker_state
       SET last_cycle_started_at = $1::timestamptz,
           last_cycle_finished_at = $2::timestamptz,
           last_cycle_processed = $3::integer,
           last_cycle_success = $4::integer,
           last_cycle_failed = $5::integer,
           last_cycle_skipped = $6::integer,
           total_processed = total_processed + $3::bigint,
           total_success = total_success + $4::bigint,
           total_failed = total_failed + $5::bigint,
           total_skipped = total_skipped + $6::bigint,
           updated_at = now()
       WHERE id = 1`,
      [
        params.startedAt,
        params.finishedAt,
        params.processed,
        params.success,
        params.failed,
        params.skipped,
      ],
    );
  } catch (e: unknown) {
    console.warn('[avatar-cache-worker-summary]', 'persist_metrics_skipped', e);
  }
}

export async function runWhatsappAvatarCacheWorkerCycle(db: Pool = pool): Promise<void> {
  if (!isMediaAvatarWhatsappEnabled() || !isMediaAvatarWhatsappWorkerEnabled()) {
    return;
  }
  if (workerCycleBusy) {
    console.log('[avatar-cache-worker-skipped]', 'cycle_already_running');
    return;
  }

  workerCycleBusy = true;
  const startedAt = new Date();
  let processed = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;

  console.log('[avatar-cache-worker-start]', { at: startedAt.toISOString() });

  try {
    const limit = getMediaAvatarWhatsappWorkerLimit();
    const maxFailures = getMediaAvatarWhatsappWorkerMaxFailures();
    const rows = await fetchWorkerCandidates(db, limit, maxFailures);

    const chunkSize = 2;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (row) => {
          const sample = await processOneConversationReprocess(db, row, 'worker');
          if (
            sample.status === 'failed' &&
            sample.reason !== 'MEDIA_AVATAR_WHATSAPP_ENABLED desligado'
          ) {
            await persistConversationAvatarCacheFailure(
              db,
              row,
              sample.reason,
              maxFailures,
              '[avatar-cache-worker-failed]',
            );
          }
          return sample;
        }),
      );
      for (const s of results) {
        processed += 1;
        if (s.status === 'cached') success += 1;
        else if (s.status === 'failed') failed += 1;
        else skipped += 1;
      }
    }

    const finishedAt = new Date();
    console.log('[avatar-cache-worker-summary]', {
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      processed,
      cached_success: success,
      failed,
      skipped,
    });

    await persistCycleMetrics(db, {
      startedAt,
      finishedAt,
      processed,
      success,
      failed,
      skipped,
    });
  } catch (e: unknown) {
    console.warn('[avatar-cache-worker-failed]', 'cycle_error', e instanceof Error ? e.message : e);
  } finally {
    workerCycleBusy = false;
  }
}

export async function getWhatsappAvatarCacheWorkerStatusSnapshot(db: Pool = pool): Promise<{
  mediaAvatarWhatsappEnabled: boolean;
  workerEnabledEnv: boolean;
  workerIntervalMinutes: number;
  workerLimit: number;
  workerMaxFailures: number;
  lockBusy: boolean;
  state: {
    last_cycle_started_at: string | null;
    last_cycle_finished_at: string | null;
    last_cycle_processed: number;
    last_cycle_success: number;
    last_cycle_failed: number;
    last_cycle_skipped: number;
    total_processed: number;
    total_success: number;
    total_failed: number;
    total_skipped: number;
    updated_at: string | null;
  } | null;
  nextCycleEstimatedAt: string | null;
}> {
  const mediaAvatarWhatsappEnabled = isMediaAvatarWhatsappEnabled();
  const workerEnabledEnv = isMediaAvatarWhatsappWorkerEnabled();
  const workerIntervalMinutes = getMediaAvatarWhatsappWorkerIntervalMinutes();
  const workerLimit = getMediaAvatarWhatsappWorkerLimit();
  const workerMaxFailures = getMediaAvatarWhatsappWorkerMaxFailures();
  const lockBusy = isWhatsappAvatarCacheWorkerBusy();

  let state: {
    last_cycle_started_at: string | null;
    last_cycle_finished_at: string | null;
    last_cycle_processed: number;
    last_cycle_success: number;
    last_cycle_failed: number;
    last_cycle_skipped: number;
    total_processed: number;
    total_success: number;
    total_failed: number;
    total_skipped: number;
    updated_at: string | null;
  } | null = null;

  try {
    const r = await db.query(
      `SELECT last_cycle_started_at::text, last_cycle_finished_at::text,
              last_cycle_processed, last_cycle_success, last_cycle_failed, last_cycle_skipped,
              total_processed, total_success, total_failed, total_skipped,
              updated_at::text
       FROM public.whatsapp_avatar_cache_worker_state WHERE id = 1`,
    );
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (row) {
      state = {
        last_cycle_started_at: (row.last_cycle_started_at as string) ?? null,
        last_cycle_finished_at: (row.last_cycle_finished_at as string) ?? null,
        last_cycle_processed: Number(row.last_cycle_processed ?? 0),
        last_cycle_success: Number(row.last_cycle_success ?? 0),
        last_cycle_failed: Number(row.last_cycle_failed ?? 0),
        last_cycle_skipped: Number(row.last_cycle_skipped ?? 0),
        total_processed: Number(row.total_processed ?? 0),
        total_success: Number(row.total_success ?? 0),
        total_failed: Number(row.total_failed ?? 0),
        total_skipped: Number(row.total_skipped ?? 0),
        updated_at: (row.updated_at as string) ?? null,
      };
    }
  } catch {
    state = null;
  }

  let nextCycleEstimatedAt: string | null = null;
  if (mediaAvatarWhatsappEnabled && workerEnabledEnv && state?.last_cycle_finished_at) {
    const last = new Date(state.last_cycle_finished_at).getTime();
    const next = last + workerIntervalMinutes * 60 * 1000;
    nextCycleEstimatedAt = new Date(next).toISOString();
  } else if (mediaAvatarWhatsappEnabled && workerEnabledEnv) {
    nextCycleEstimatedAt = new Date(Date.now() + workerIntervalMinutes * 60 * 1000).toISOString();
  }

  return {
    mediaAvatarWhatsappEnabled,
    workerEnabledEnv,
    workerIntervalMinutes,
    workerLimit,
    workerMaxFailures,
    lockBusy,
    state,
    nextCycleEstimatedAt,
  };
}

export function startWhatsappAvatarCacheWorkerInterval(): void {
  const minutes = getMediaAvatarWhatsappWorkerIntervalMinutes();
  const ms = Math.max(60_000, minutes * 60_000);
  setInterval(() => {
    void runWhatsappAvatarCacheWorkerCycle(pool).catch((e) =>
      console.warn('[avatar-cache-worker-failed]', 'interval_tick', e),
    );
  }, ms);
  console.log('[avatar-cache-worker]', `interval_scheduled_ms=${ms}`);
}

/**
 * Super Admin: reprocessamento controlado de cache de avatar WhatsApp (conversas).
 */

import type { Pool } from 'pg';
import { pool } from '../../utils/db.js';
import { isWhatsAppCdnAvatarUrl } from '../../utils/uazapiChatIdentity.js';
import { isMediaAvatarWhatsappEnabled } from '../media/mediaConfig.js';
import { summarizeUrlForLog } from './stripLocalhostMediaUrl.js';
import {
  type CandidateRow,
  pickMergedCdnUrl,
  processOneConversationReprocess,
  type ReprocessSample,
} from '../whatsappAvatarReprocessExecution.js';

const SCRIPT_KEY = 'media.reprocess_avatar_cache' as const;
const PREVIEW_ROWS_MAX = 20;
const EXEC_LIMIT_DEFAULT = 20;
const EXEC_LIMIT_MAX = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminScriptBody = {
  tenantId?: string | null;
  limit?: number | string | null;
};

function clampExecuteLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return EXEC_LIMIT_DEFAULT;
  return Math.min(EXEC_LIMIT_MAX, Math.max(1, Math.floor(n)));
}

function previewFetchLimit(raw: unknown): number {
  const execLim = clampExecuteLimit(raw);
  return Math.min(PREVIEW_ROWS_MAX, execLim);
}

function parseTenantFilter(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!UUID_RE.test(s)) return '__invalid__';
  return s;
}

/** CDN WhatsApp detectada por substring (alinhado a auditorias SQL). */
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

function classifyMotives(row: CandidateRow): string[] {
  const out: string[] = [];
  const src = row.avatar_source_url?.trim();
  const av = row.avatar_url?.trim();
  const cached = row.avatar_cached_url?.trim();

  if (src && isWhatsAppCdnAvatarUrl(src)) out.push('avatar_source_url é CDN WhatsApp');
  if (av && isWhatsAppCdnAvatarUrl(av)) out.push('avatar_url é CDN WhatsApp');

  if (!cached) out.push('avatar_cached_url ausente');
  else if (!(cached.includes('/api/public/catalog-media/raw') || cached.includes('/api/media/v1/raw') || cached.includes('/media/catalog/'))) {
    out.push('avatar_cached_url não é cópia interna estável');
  }
  return out;
}

async function countCandidates(db: Pool, tenantFilter: string | null): Promise<number> {
  const params: unknown[] = [];
  let tenantClause = '';
  if (tenantFilter && tenantFilter !== '__invalid__') {
    params.push(tenantFilter);
    tenantClause = `AND u.tenant_id = $${params.length}::uuid`;
  }
  const q = `
    SELECT COUNT(*)::bigint AS c
    FROM public.chat_conversations c
    INNER JOIN public.users u ON u.id = c.user_id
    WHERE ${sqlHasCdnSource()}
      AND NOT (${sqlInternalCached()})
      ${tenantClause}
  `;
  const r = await db.query<{ c: string }>(q, params);
  return Number(r.rows[0]?.c ?? 0);
}

async function fetchCandidates(
  db: Pool,
  tenantFilter: string | null,
  limit: number,
): Promise<CandidateRow[]> {
  const params: unknown[] = [];
  let tenantClause = '';
  if (tenantFilter && tenantFilter !== '__invalid__') {
    params.push(tenantFilter);
    tenantClause = `AND u.tenant_id = $${params.length}::uuid`;
  }
  params.push(limit);
  const limIdx = params.length;
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
      c.avatar_source_url
    FROM public.chat_conversations c
    INNER JOIN public.users u ON u.id = c.user_id
    WHERE ${sqlHasCdnSource()}
      AND NOT (${sqlInternalCached()})
      ${tenantClause}
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT $${limIdx}
  `;
  const r = await db.query<CandidateRow>(q, params);
  return r.rows;
}

function displayName(row: CandidateRow): string {
  const n =
    [row.contact_name, row.profile_name, row.phone_number, row.external_chat_id].find(
      (x) => typeof x === 'string' && x.trim(),
    ) ?? '';
  return n.trim() || '—';
}

export async function runWhatsappAvatarReprocessAdminScript(params: {
  pool: Pool;
  userId: string;
  mode: 'preview' | 'execute';
  body: AdminScriptBody | undefined;
  insertScriptRun: (input: {
    scriptKey: string;
    mode: 'preview' | 'execute';
    status: 'success' | 'failed';
    executedBy: string;
    affectedCount: number;
    previewPayload: unknown;
    resultPayload: unknown;
    errorMessage?: string | null;
  }) => Promise<string>;
  allowPreview: (userId: string, scriptKey: string) => boolean;
  allowExecute: (userId: string, scriptKey: string) => boolean;
}): Promise<{ runId: string; result: Record<string, unknown> }> {
  const { pool: db, userId, mode, body } = params;
  const tenantParsed = parseTenantFilter(body?.tenantId);
  const execLimit = clampExecuteLimit(body?.limit);
  const previewLim = previewFetchLimit(body?.limit);

  const flagEnabled = isMediaAvatarWhatsappEnabled();

  if (tenantParsed === '__invalid__') {
    throw new Error('tenantId inválido (esperado UUID).');
  }

  const tenantFilter = tenantParsed;

  if (mode === 'preview') {
    if (!params.allowPreview(userId, SCRIPT_KEY)) {
      throw new Error('Aguarde alguns segundos antes de novo preview.');
    }
    const totalCandidates = await countCandidates(db, tenantFilter);
    const rows = await fetchCandidates(db, tenantFilter, previewLim);

    console.log('[admin-avatar-cache-preview]', {
      userId,
      tenantFilter: tenantFilter ?? 'all',
      limit: previewLim,
      totalCandidates,
      returned: rows.length,
      flagEnabled,
    });

    const candidates = rows.map((row) => ({
      tenant_id: row.tenant_id,
      conversation_id: row.id,
      display_name: displayName(row),
      avatar_url: row.avatar_url,
      avatar_cached_url: row.avatar_cached_url,
      avatar_source_url: row.avatar_source_url,
      motives: classifyMotives(row),
      predicted_action:
        'Tentar cachear URL CDN → armazenamento interno assinado (' +
        (flagEnabled ? '`/api/media/v1/raw` via MediaService' : 'catálogo legado `/api/public/catalog-media/raw`') +
        ').',
    }));

    const previewPayload = {
      scriptKey: SCRIPT_KEY,
      mediaAvatarFlagEnabled: flagEnabled,
      warning:
        flagEnabled === false
          ? 'MEDIA_AVATAR_WHATSAPP_ENABLED está desligado. Ative em staging antes de executar o reprocessamento com MediaService.'
          : null,
      filters: {
        tenantId: tenantFilter,
        limit: execLimit,
        previewRowsCap: PREVIEW_ROWS_MAX,
      },
      totalCandidates,
      candidatesPreviewed: candidates.length,
      truncatedPreview: totalCandidates > candidates.length,
      candidates,
    };

    const runId = await params.insertScriptRun({
      scriptKey: SCRIPT_KEY,
      mode: 'preview',
      status: 'success',
      executedBy: userId,
      affectedCount: candidates.length,
      previewPayload,
      resultPayload: { ok: true },
      errorMessage: null,
    });

    return { runId, result: previewPayload };
  }

  // execute
  if (!flagEnabled) {
    console.warn('[admin-avatar-cache-run]', { userId, blocked: true, reason: 'flag_disabled' });
    throw new Error(
      'MEDIA_AVATAR_WHATSAPP_ENABLED está desligado. Ative em staging antes de executar.',
    );
  }

  if (!params.allowExecute(userId, SCRIPT_KEY)) {
    throw new Error('Aguarde antes de nova execução deste script.');
  }

  const rows = await fetchCandidates(db, tenantFilter, execLimit);
  console.log('[admin-avatar-cache-run]', {
    userId,
    tenantFilter: tenantFilter ?? 'all',
    batchLimit: execLimit,
    candidates: rows.length,
  });

  let processed = 0;
  let cachedSuccess = 0;
  let skipped = 0;
  let failed = 0;

  const samples: ReprocessSample[] = [];

  for (const row of rows) {
    processed += 1;
    const sample = await processOneConversationReprocess(db, row, 'admin');
    samples.push(sample);
    if (sample.status === 'cached') cachedSuccess += 1;
    else if (sample.status === 'failed') failed += 1;
    else skipped += 1;
  }

  const previewPayload = {
    filters: { tenantId: tenantFilter, limit: execLimit },
    batchSize: rows.length,
  };

  const resultPayload = {
    ok: true,
    processed,
    cached_success: cachedSuccess,
    skipped,
    failed,
    samples,
    mediaAvatarFlagEnabled: true,
  };

  const runId = await params.insertScriptRun({
    scriptKey: SCRIPT_KEY,
    mode: 'execute',
    status: 'success',
    executedBy: userId,
    affectedCount: cachedSuccess,
    previewPayload,
    resultPayload,
    errorMessage: failed > 0 ? `${failed} conversa(s) sem cache bem-sucedido` : null,
  });

  return { runId, result: resultPayload };
}

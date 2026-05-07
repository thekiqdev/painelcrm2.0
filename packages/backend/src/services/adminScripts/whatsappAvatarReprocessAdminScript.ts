/**
 * Super Admin: reprocessamento controlado de cache de avatar WhatsApp (conversas).
 * Inclui CDN sem cópia interna e cópia interna /api/media/v1/raw inválida ou sem ficheiro.
 */

import type { Pool } from 'pg';
import { isWhatsAppCdnAvatarUrl } from '../../utils/uazapiChatIdentity.js';
import { isMediaAvatarWhatsappEnabled } from '../media/mediaConfig.js';
import { summarizeUrlForLog } from './stripLocalhostMediaUrl.js';
import { analyzeBrokenInternalMediaRaw, hasStableInternalCacheRow } from '../whatsappAvatarBrokenInternalCheck.js';
import {
  type CandidateRow,
  pickMergedCdnUrl,
  processOneConversationReprocess,
  type ReprocessSample,
} from '../whatsappAvatarReprocessExecution.js';

export const SCRIPT_KEY_REPROCESS = 'media.reprocess_avatar_cache' as const;
export const SCRIPT_KEY_REPAIR_BROKEN = 'media.repair_broken_avatar_cache' as const;

const PREVIEW_ROWS_MAX = 20;
const REPROCESS_EXEC_DEFAULT = 20;
const REPROCESS_EXEC_MAX = 100;
const REPAIR_EXEC_DEFAULT = 10;
const REPAIR_EXEC_MAX = 100;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminScriptBody = {
  tenantId?: string | null;
  limit?: number | string | null;
};

type RunOpts = {
  scriptKey: typeof SCRIPT_KEY_REPROCESS | typeof SCRIPT_KEY_REPAIR_BROKEN;
  repairBrokenOnly: boolean;
  execDefault: number;
  execMax: number;
};

function clampExecuteLimit(raw: unknown, def: number, max: number): number {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

function previewFetchLimit(raw: unknown, def: number, max: number): number {
  const execLim = clampExecuteLimit(raw, def, max);
  return Math.min(PREVIEW_ROWS_MAX, execLim);
}

function parseTenantFilter(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!UUID_RE.test(s)) return '__invalid__';
  return s;
}

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

/** Candidatos SQL amplos: sem cache interno OU cache interno media_raw com fonte CDN em avatar_source_url. */
function sqlBroadEligibleWhere(): string {
  return `(
    NOT (${sqlInternalCached()})
    OR (
      c.avatar_source_url IS NOT NULL AND btrim(c.avatar_source_url::text) <> ''
      AND ${sqlHasWaCdn('c.avatar_source_url')}
      AND (
        c.avatar_cached_url ILIKE '%/api/media/v1/raw%'
        OR c.avatar_url ILIKE '%/api/media/v1/raw%'
      )
    )
  )`;
}

async function countBroadCandidates(db: Pool, tenantFilter: string | null): Promise<number> {
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
      AND (${sqlBroadEligibleWhere()})
      ${tenantClause}
  `;
  const r = await db.query<{ c: string }>(q, params);
  return Number(r.rows[0]?.c ?? 0);
}

async function fetchBroadBatchPaged(
  db: Pool,
  tenantFilter: string | null,
  limit: number,
  offset: number,
): Promise<CandidateRow[]> {
  const params: unknown[] = [];
  let tenantClause = '';
  if (tenantFilter && tenantFilter !== '__invalid__') {
    params.push(tenantFilter);
    tenantClause = `AND u.tenant_id = $${params.length}::uuid`;
  }
  params.push(limit);
  const limIdx = params.length;
  params.push(offset);
  const offIdx = params.length;
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
      c.avatar_cache_status::text AS avatar_cache_status
    FROM public.chat_conversations c
    INNER JOIN public.users u ON u.id = c.user_id
    WHERE ${sqlHasCdnSource()}
      AND (${sqlBroadEligibleWhere()})
      ${tenantClause}
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT $${limIdx} OFFSET $${offIdx}
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

async function classifyRowForPreview(
  row: CandidateRow,
  repairBrokenOnly: boolean,
): Promise<{
  eligible: boolean;
  brokenAnalysis: Awaited<ReturnType<typeof analyzeBrokenInternalMediaRaw>>;
  cdnWithoutStableCache: boolean;
  motive_codes: string[];
}> {
  const merged = pickMergedCdnUrl(row);
  const brokenAnalysis = await analyzeBrokenInternalMediaRaw({
    avatar_url: row.avatar_url,
    avatar_cached_url: row.avatar_cached_url,
    avatar_cache_status: row.avatar_cache_status ?? null,
  });

  if (!merged) {
    return {
      eligible: false,
      brokenAnalysis,
      cdnWithoutStableCache: false,
      motive_codes: [],
    };
  }

  const hasStable = hasStableInternalCacheRow(row.avatar_cached_url);
  const cdnWithoutStableCache = !hasStable;

  let eligible = false;
  if (repairBrokenOnly) {
    const src = typeof row.avatar_source_url === 'string' ? row.avatar_source_url.trim() : '';
    eligible = brokenAnalysis.broken && Boolean(src && isWhatsAppCdnAvatarUrl(src));
  } else {
    eligible = cdnWithoutStableCache || brokenAnalysis.broken;
  }

  const motive_codes: string[] = [];
  if (cdnWithoutStableCache) motive_codes.push('cdn_without_cache');
  if (brokenAnalysis.broken) {
    for (const m of brokenAnalysis.motives) {
      if (!motive_codes.includes(m)) motive_codes.push(m);
    }
  }

  return { eligible, brokenAnalysis, cdnWithoutStableCache, motive_codes };
}

/** Percorre a lista ampla com OFFSET até obter `needed` candidatos elegíveis (máx. ~2k linhas). */
async function collectEligibleCandidatesPaged(
  db: Pool,
  tenantFilter: string | null,
  needed: number,
  repairBrokenOnly: boolean,
): Promise<CandidateRow[]> {
  const out: CandidateRow[] = [];
  const PAGE = 150;
  let sqlOffset = 0;
  const maxScan = 2500;

  while (out.length < needed && sqlOffset < maxScan) {
    const batch = await fetchBroadBatchPaged(db, tenantFilter, PAGE, sqlOffset);
    if (batch.length === 0) break;
    for (const row of batch) {
      const { eligible } = await classifyRowForPreview(row, repairBrokenOnly);
      if (!eligible) continue;
      out.push(row);
      if (out.length >= needed) break;
    }
    sqlOffset += batch.length;
    if (batch.length < PAGE) break;
  }
  return out.slice(0, needed);
}

function humanMotives(
  row: CandidateRow,
  motive_codes: string[],
  brokenAnalysis: Awaited<ReturnType<typeof analyzeBrokenInternalMediaRaw>>,
): string[] {
  const lines: string[] = [...motive_codes];
  const src = row.avatar_source_url?.trim();
  const av = row.avatar_url?.trim();
  const cached = row.avatar_cached_url?.trim();
  if (src && isWhatsAppCdnAvatarUrl(src)) lines.push('Fonte CDN: avatar_source_url');
  if (av && isWhatsAppCdnAvatarUrl(av)) lines.push('avatar_url contém CDN WhatsApp');
  if (!cached) lines.push('avatar_cached_url ausente');
  else if (
    !(
      cached.includes('/api/public/catalog-media/raw') ||
      cached.includes('/api/media/v1/raw') ||
      cached.includes('/media/catalog/')
    )
  ) {
    lines.push('avatar_cached_url não é cópia interna estável');
  }
  if (brokenAnalysis.health_avatar_url && !brokenAnalysis.health_avatar_url.signature_ok) {
    lines.push('avatar_url media_raw: assinatura inválida');
  }
  if (brokenAnalysis.health_avatar_url && !brokenAnalysis.health_avatar_url.file_exists) {
    lines.push('avatar_url media_raw: ficheiro ausente');
  }
  if (brokenAnalysis.health_cached_url && !brokenAnalysis.health_cached_url.signature_ok) {
    lines.push('avatar_cached_url media_raw: assinatura inválida');
  }
  if (brokenAnalysis.health_cached_url && !brokenAnalysis.health_cached_url.file_exists) {
    lines.push('avatar_cached_url media_raw: ficheiro ausente');
  }
  return [...new Set(lines)];
}

async function runAvatarReprocessAdminCore(params: {
  pool: Pool;
  userId: string;
  mode: 'preview' | 'execute';
  body: AdminScriptBody | undefined;
  opts: RunOpts;
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
  const { pool: db, userId, mode, body, opts } = params;
  const tenantParsed = parseTenantFilter(body?.tenantId);
  const execLimit = clampExecuteLimit(body?.limit, opts.execDefault, opts.execMax);
  const previewLim = previewFetchLimit(body?.limit, opts.execDefault, opts.execMax);

  const flagEnabled = isMediaAvatarWhatsappEnabled();

  if (tenantParsed === '__invalid__') {
    throw new Error('tenantId inválido (esperado UUID).');
  }

  const tenantFilter = tenantParsed;
  const scriptKey = opts.scriptKey;
  const repairBrokenOnly = opts.repairBrokenOnly;

  if (mode === 'preview') {
    if (!params.allowPreview(userId, scriptKey)) {
      throw new Error('Aguarde alguns segundos antes de novo preview.');
    }

    const totalBroad = await countBroadCandidates(db, tenantFilter);
    const rows = await collectEligibleCandidatesPaged(db, tenantFilter, previewLim, repairBrokenOnly);

    const logTag = repairBrokenOnly ? '[avatar-cache-repair-preview]' : '[admin-avatar-cache-preview]';
    console.log(logTag, {
      userId,
      tenantFilter: tenantFilter ?? 'all',
      limit: previewLim,
      totalBroadSql: totalBroad,
      eligibleReturned: rows.length,
      repairBrokenOnly,
      flagEnabled,
    });

    const candidates: Record<string, unknown>[] = [];
    for (const row of rows) {
      const { brokenAnalysis, cdnWithoutStableCache, motive_codes } = await classifyRowForPreview(
        row,
        repairBrokenOnly,
      );
      candidates.push({
        tenant_id: row.tenant_id,
        conversation_id: row.id,
        display_name: displayName(row),
        avatar_url_preview: summarizeUrlForLog(row.avatar_url ?? ''),
        avatar_cached_url_preview: summarizeUrlForLog(row.avatar_cached_url ?? ''),
        avatar_source_url_preview: summarizeUrlForLog(row.avatar_source_url ?? ''),
        avatar_cache_status: row.avatar_cache_status ?? null,
        motive_codes,
        motives: humanMotives(row, motive_codes, brokenAnalysis),
        predicted_action: 'reprocess_from_avatar_source_url',
      });
    }

    const previewPayload = {
      scriptKey,
      repairBrokenOnly,
      mediaAvatarFlagEnabled: flagEnabled,
      warning:
        flagEnabled === false
          ? 'MEDIA_AVATAR_WHATSAPP_ENABLED está desligado. Ative em staging antes de executar.'
          : null,
      filters: {
        tenantId: tenantFilter,
        limit: execLimit,
        previewRowsCap: PREVIEW_ROWS_MAX,
      },
      totalBroadSql: totalBroad,
      note:
        'totalBroadSql é limite superior na BD; candidatos finais passam verificação de assinatura/ficheiro no servidor.',
      candidatesPreviewed: candidates.length,
      truncatedPreview: candidates.length >= previewLim,
      candidates,
    };

    const runId = await params.insertScriptRun({
      scriptKey,
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

  if (!flagEnabled) {
    console.warn('[admin-avatar-cache-run]', { userId, blocked: true, reason: 'flag_disabled' });
    throw new Error(
      'MEDIA_AVATAR_WHATSAPP_ENABLED está desligado. Ative em staging antes de executar.',
    );
  }

  if (!params.allowExecute(userId, scriptKey)) {
    throw new Error('Aguarde antes de nova execução deste script.');
  }

  const rows = await collectEligibleCandidatesPaged(db, tenantFilter, execLimit, repairBrokenOnly);
  const runLogTag = repairBrokenOnly ? '[avatar-cache-repair-run]' : '[admin-avatar-cache-run]';
  console.log(runLogTag, {
    userId,
    tenantFilter: tenantFilter ?? 'all',
    batchLimit: execLimit,
    candidates: rows.length,
    repairBrokenOnly,
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
    if (sample.status === 'cached') {
      cachedSuccess += 1;
      if (repairBrokenOnly) {
        console.log('[avatar-cache-repair-success]', {
          conversationId: row.id,
          tenantId: row.tenant_id,
          reason: sample.reason,
          oldUrlKind: 'broken_internal_or_cdn',
          newUrlKind: 'media_raw_signed',
        });
      }
    } else if (sample.status === 'failed') {
      failed += 1;
      if (repairBrokenOnly) {
        console.warn('[avatar-cache-repair-failed]', {
          conversationId: row.id,
          tenantId: row.tenant_id,
          reason: sample.reason,
        });
      }
    } else {
      skipped += 1;
      if (repairBrokenOnly) {
        console.log('[avatar-cache-repair-skipped]', {
          conversationId: row.id,
          tenantId: row.tenant_id,
          reason: sample.reason,
        });
      }
    }
  }

  const previewPayload = {
    filters: { tenantId: tenantFilter, limit: execLimit },
    batchSize: rows.length,
    repairBrokenOnly,
  };

  const resultPayload = {
    ok: true,
    processed,
    cached_success: cachedSuccess,
    skipped,
    failed,
    samples,
    mediaAvatarFlagEnabled: true,
    scriptKey,
  };

  const runId = await params.insertScriptRun({
    scriptKey,
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
  return runAvatarReprocessAdminCore({
    ...params,
    opts: {
      scriptKey: SCRIPT_KEY_REPROCESS,
      repairBrokenOnly: false,
      execDefault: REPROCESS_EXEC_DEFAULT,
      execMax: REPROCESS_EXEC_MAX,
    },
  });
}

export async function runWhatsappAvatarRepairBrokenCacheAdminScript(params: {
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
  return runAvatarReprocessAdminCore({
    ...params,
    opts: {
      scriptKey: SCRIPT_KEY_REPAIR_BROKEN,
      repairBrokenOnly: true,
      execDefault: REPAIR_EXEC_DEFAULT,
      execMax: REPAIR_EXEC_MAX,
    },
  });
}

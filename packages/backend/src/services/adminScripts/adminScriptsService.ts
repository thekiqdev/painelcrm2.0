import type { Pool, PoolClient } from 'pg';
import { pool } from '../../utils/db.js';
import { randomBytes } from 'crypto';
import {
  ADMIN_SCRIPTS_CATALOG,
  type AdminScriptKey,
  getCatalogEntry,
} from './adminScriptsCatalog.js';
import { stripLocalhostInternalMediaUrl, summarizeUrlForLog } from './stripLocalhostMediaUrl.js';
import {
  AdminMediaDiagError,
  runMediaDiagnoseConversationAvatar,
  runMediaDiagnoseSystem,
  runMediaTestStorageRoundtrip,
} from './mediaDiagnosticsAdminScript.js';
import {
  runWhatsappAvatarRepairBrokenCacheAdminScript,
  runWhatsappAvatarReprocessAdminScript,
} from './whatsappAvatarReprocessAdminScript.js';

export type AdminScriptMode = 'preview' | 'execute';

/** Colunas texto onde aplicamos strip (JSON em products só auditoria nesta versão). */
const STRIP_TEXT_TARGETS: { table: string; column: string }[] = [
  { table: 'chat_conversations', column: 'avatar_url' },
  { table: 'chat_conversations', column: 'avatar_cached_url' },
  { table: 'clients', column: 'whatsapp_avatar_url' },
  { table: 'clients', column: 'whatsapp_avatar_cached_url' },
  { table: 'leads', column: 'whatsapp_avatar_url' },
  { table: 'leads', column: 'whatsapp_avatar_cached_url' },
  { table: 'communication_contacts', column: 'profile_avatar_url' },
  { table: 'profiles', column: 'avatar_url' },
  { table: 'tenants', column: 'logo_url' },
  { table: 'tenants', column: 'logo_light_url' },
  { table: 'tenants', column: 'logo_dark_url' },
  { table: 'store_profiles', column: 'store_logo' },
];

const PREVIEW_SAMPLE_LIMIT = 80;

/** Preview em auditoria: não expor valores completos. */
const AUDIT_VALUE_PREVIEW_MAX = 120;
const AUDIT_DETAIL_SAMPLE_LIMIT = 20;
const WEBHOOK_SECRET_MIN_LEN = 32;

const WHATSAPP_CDN_AUDIT_NOTE = 'CDN efémera — será resolvida via cache';

function auditValuePreview(raw: string | null | undefined): string {
  if (raw == null || typeof raw !== 'string') return '';
  const t = raw.trim().replace(/\s+/g, ' ');
  return t.length <= AUDIT_VALUE_PREVIEW_MAX ? t : `${t.slice(0, AUDIT_VALUE_PREVIEW_MAX)}…`;
}

/** Fontes alinhadas à soma `localhost_em_colunas_texto` (mesmas tabelas/colunas). */
const LOCALHOST_AUDIT_SAMPLE_SOURCES: { table: string; column: string }[] = [
  { table: 'chat_conversations', column: 'avatar_url' },
  { table: 'chat_conversations', column: 'avatar_cached_url' },
  { table: 'clients', column: 'whatsapp_avatar_url' },
  { table: 'clients', column: 'whatsapp_avatar_cached_url' },
  { table: 'leads', column: 'whatsapp_avatar_url' },
  { table: 'leads', column: 'whatsapp_avatar_cached_url' },
  { table: 'communication_contacts', column: 'profile_avatar_url' },
  { table: 'profiles', column: 'avatar_url' },
  { table: 'users', column: 'avatar_url' },
  { table: 'tenants', column: 'logo_url' },
  { table: 'tenants', column: 'logo_light_url' },
  { table: 'tenants', column: 'logo_dark_url' },
  { table: 'store_profiles', column: 'store_logo' },
];

/**
 * Amostras CDN — mesma lógica do COUNT em `whatsapp_net_em_campos_finais`
 * (ex.: clients/leads só `whatsapp_avatar_url`, tenants só net nos logos).
 */
const WHATSAPP_CDN_AUDIT_SAMPLE_SOURCES: { table: string; column: string; netOnly: boolean }[] = [
  { table: 'chat_conversations', column: 'avatar_url', netOnly: false },
  { table: 'chat_conversations', column: 'avatar_cached_url', netOnly: false },
  { table: 'clients', column: 'whatsapp_avatar_url', netOnly: false },
  { table: 'leads', column: 'whatsapp_avatar_url', netOnly: false },
  { table: 'communication_contacts', column: 'profile_avatar_url', netOnly: false },
  { table: 'tenants', column: 'logo_url', netOnly: true },
  { table: 'tenants', column: 'logo_light_url', netOnly: true },
  { table: 'tenants', column: 'logo_dark_url', netOnly: true },
];

function waSampleWhereClause(column: string, netOnly: boolean): string {
  const c = quoteIdent(column);
  if (netOnly) {
    return `${c} IS NOT NULL AND btrim(${c}::text) <> '' AND ${c}::text ILIKE '%whatsapp.net%'`;
  }
  return `${c} IS NOT NULL AND btrim(${c}::text) <> '' AND (${c}::text ILIKE '%whatsapp.net%' OR ${c}::text ILIKE '%whatsapp.com%')`;
}

async function collectLocalhostAuditSamples(
  db: Pool | PoolClient,
  max: number
): Promise<
  { table: string; field: string; id: string; value_preview: string; suggested: string | null }[]
> {
  const out: { table: string; field: string; id: string; value_preview: string; suggested: string | null }[] = [];
  for (const { table, column } of LOCALHOST_AUDIT_SAMPLE_SOURCES) {
    if (out.length >= max) break;
    try {
      const lim = max - out.length;
      const q = `SELECT id::text AS id, ${quoteIdent(column)}::text AS v
        FROM public.${quoteIdent(table)}
        WHERE ${quoteIdent(column)} IS NOT NULL AND ${quoteIdent(column)}::text ILIKE '%localhost%'
        LIMIT $1`;
      const res = await db.query(q, [lim]);
      for (const row of res.rows as { id: string; v: string }[]) {
        const { next, changed } = stripLocalhostInternalMediaUrl(row.v);
        const suggested =
          changed && next !== row.v ? auditValuePreview(next) : null;
        out.push({
          table,
          field: column,
          id: row.id,
          value_preview: auditValuePreview(row.v),
          suggested,
        });
        if (out.length >= max) break;
      }
    } catch (e: unknown) {
      console.warn(
        `[adminScripts] collectLocalhostAuditSamples skip ${table}.${column}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  for (const { field, sql } of [
    {
      field: 'images',
      sql: `SELECT id::text AS id, images::text AS v FROM public.products
            WHERE images::text ILIKE '%localhost%'`,
    },
    {
      field: 'secondary_images',
      sql: `SELECT id::text AS id, secondary_images::text AS v FROM public.products
            WHERE secondary_images::text ILIKE '%localhost%'`,
    },
  ] as const) {
    if (out.length >= max) break;
    try {
      const lim = max - out.length;
      const res = await db.query(`${sql} LIMIT $1`, [lim]);
      for (const row of res.rows as { id: string; v: string }[]) {
        out.push({
          table: 'products',
          field,
          id: row.id,
          value_preview: auditValuePreview(row.v),
          suggested: null,
        });
        if (out.length >= max) break;
      }
    } catch (e: unknown) {
      console.warn(`[adminScripts] collectLocalhostAuditSamples products.${field}:`, e instanceof Error ? e.message : e);
    }
  }

  return out;
}

async function collectWhatsappCdnAuditSamples(
  db: Pool | PoolClient,
  max: number
): Promise<{ table: string; field: string; id: string; value_preview: string; note: string }[]> {
  const out: { table: string; field: string; id: string; value_preview: string; note: string }[] = [];
  for (const { table, column, netOnly } of WHATSAPP_CDN_AUDIT_SAMPLE_SOURCES) {
    if (out.length >= max) break;
    try {
      const lim = max - out.length;
      const where = waSampleWhereClause(column, netOnly);
      const q = `SELECT id::text AS id, ${quoteIdent(column)}::text AS v
        FROM public.${quoteIdent(table)}
        WHERE ${where}
        LIMIT $1`;
      const res = await db.query(q, [lim]);
      for (const row of res.rows as { id: string; v: string }[]) {
        out.push({
          table,
          field: column,
          id: row.id,
          value_preview: auditValuePreview(row.v),
          note: WHATSAPP_CDN_AUDIT_NOTE,
        });
        if (out.length >= max) break;
      }
    } catch (e: unknown) {
      console.warn(
        `[adminScripts] collectWhatsappCdnAuditSamples skip ${table}.${column}:`,
        e instanceof Error ? e.message : e
      );
    }
  }
  return out;
}

const previewCooldown = new Map<string, number>();
const executeCooldown = new Map<string, number>();

function allowPreview(userId: string, scriptKey: string, ms = 2500): boolean {
  const k = `${userId}:${scriptKey}`;
  const now = Date.now();
  const last = previewCooldown.get(k) ?? 0;
  if (now - last < ms) return false;
  previewCooldown.set(k, now);
  return true;
}

function allowExecute(userId: string, scriptKey: string, ms = 12000): boolean {
  const k = `${userId}:${scriptKey}`;
  const now = Date.now();
  const last = executeCooldown.get(k) ?? 0;
  if (now - last < ms) return false;
  executeCooldown.set(k, now);
  return true;
}

type StripPreviewRow = {
  table: string;
  field: string;
  id: string;
  currentSummary: string;
  nextSummary: string;
};

async function insertScriptRun(
  client: Pool | PoolClient,
  params: {
    scriptKey: string;
    mode: AdminScriptMode;
    status: 'success' | 'failed';
    executedBy: string;
    affectedCount: number;
    previewPayload: unknown;
    resultPayload: unknown;
    errorMessage?: string | null;
  }
): Promise<string> {
  const r = await client.query(
    `INSERT INTO public.admin_script_runs (
      script_key, mode, status, executed_by, affected_count,
      preview_payload, result_payload, error_message, finished_at
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now())
    RETURNING id::text`,
    [
      params.scriptKey,
      params.mode,
      params.status,
      params.executedBy,
      params.affectedCount,
      JSON.stringify(params.previewPayload ?? {}),
      JSON.stringify(params.resultPayload ?? {}),
      params.errorMessage ?? null,
    ]
  );
  return r.rows[0].id as string;
}

async function collectStripCandidates(db: Pool | PoolClient): Promise<
  { table: string; column: string; id: string; oldValue: string; newValue: string }[]
> {
  const out: { table: string; column: string; id: string; oldValue: string; newValue: string }[] = [];
  for (const { table, column } of STRIP_TEXT_TARGETS) {
    try {
      const q = `SELECT id::text AS id, ${quoteIdent(column)}::text AS v FROM public.${quoteIdent(
        table
      )} WHERE ${quoteIdent(column)} IS NOT NULL AND btrim(${quoteIdent(column)}::text) <> ''`;
      const res = await db.query(q);
      for (const row of res.rows as { id: string; v: string }[]) {
        const { next, changed } = stripLocalhostInternalMediaUrl(row.v);
        if (changed && next !== row.v) {
          out.push({
            table,
            column,
            id: row.id,
            oldValue: row.v,
            newValue: next,
          });
        }
      }
    } catch (e: any) {
      console.warn(`[adminScripts] collectStripCandidates skip ${table}.${column}:`, e?.message ?? e);
    }
  }
  return out;
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error('Invalid SQL identifier');
  }
  return `"${name}"`;
}

function generateWebhookSecretForAdminScript(): string {
  const s = randomBytes(32).toString('base64url');
  return s.length >= WEBHOOK_SECRET_MIN_LEN ? s : `${s}${randomBytes(8).toString('hex')}`;
}

/** Contagem aproximada de JSON de produtos com localhost (só informativo; sem repair automático). */
async function countProductJsonLocalhost(db: Pool | PoolClient): Promise<number> {
  try {
    const r = await db.query(`
      SELECT COUNT(*)::int AS c FROM public.products
      WHERE images::text ILIKE '%localhost%' OR secondary_images::text ILIKE '%localhost%'
    `);
    return Number(r.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

async function runMediaAuditUrls(userId: string, mode: AdminScriptMode): Promise<{
  runId: string;
  result: Record<string, unknown>;
}> {
  if (mode === 'execute') {
    throw new AdminScriptValidationError('Este script é apenas auditoria; use preview.', 400);
  }

  const localhostParts = await Promise.all([
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.chat_conversations
      WHERE avatar_url ILIKE '%localhost%' OR avatar_cached_url ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.clients
      WHERE whatsapp_avatar_url ILIKE '%localhost%' OR whatsapp_avatar_cached_url ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.leads
      WHERE whatsapp_avatar_url ILIKE '%localhost%' OR whatsapp_avatar_cached_url ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.communication_contacts WHERE profile_avatar_url ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.profiles WHERE avatar_url ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.users WHERE avatar_url ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.tenants
      WHERE COALESCE(logo_url,'') ILIKE '%localhost%' OR COALESCE(logo_light_url,'') ILIKE '%localhost%' OR COALESCE(logo_dark_url,'') ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.store_profiles WHERE store_logo ILIKE '%localhost%'`),
    pool.query(`SELECT COUNT(*)::bigint AS c FROM public.products WHERE images::text ILIKE '%localhost%' OR secondary_images::text ILIKE '%localhost%'`),
  ]);
  const localhostSum = localhostParts.reduce((a, x) => a + Number(x.rows[0]?.c ?? 0), 0);

  const wa = await pool.query(`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT 1 FROM public.chat_conversations
       WHERE avatar_url ILIKE '%whatsapp.net%' OR avatar_cached_url ILIKE '%whatsapp.net%'
          OR avatar_url ILIKE '%whatsapp.com%' OR avatar_cached_url ILIKE '%whatsapp.com%'
      UNION ALL
      SELECT 1 FROM public.clients
       WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
      UNION ALL
      SELECT 1 FROM public.leads
       WHERE whatsapp_avatar_url ILIKE '%whatsapp.net%' OR whatsapp_avatar_url ILIKE '%whatsapp.com%'
      UNION ALL
      SELECT 1 FROM public.communication_contacts
       WHERE profile_avatar_url ILIKE '%whatsapp.net%' OR profile_avatar_url ILIKE '%whatsapp.com%'
      UNION ALL
      SELECT 1 FROM public.tenants
       WHERE COALESCE(logo_url,'') ILIKE '%whatsapp.net%' OR COALESCE(logo_light_url,'') ILIKE '%whatsapp.net%' OR COALESCE(logo_dark_url,'') ILIKE '%whatsapp.net%'
    ) y`);

  const proxy = await pool.query(`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT 1 FROM public.chat_conversations
       WHERE avatar_url ILIKE '%avatar-proxy%' OR avatar_cached_url ILIKE '%avatar-proxy%'
      UNION ALL SELECT 1 FROM public.clients
       WHERE whatsapp_avatar_url ILIKE '%avatar-proxy%' OR whatsapp_avatar_cached_url ILIKE '%avatar-proxy%'
      UNION ALL SELECT 1 FROM public.leads
       WHERE whatsapp_avatar_url ILIKE '%avatar-proxy%' OR whatsapp_avatar_cached_url ILIKE '%avatar-proxy%'
      UNION ALL SELECT 1 FROM public.notifications WHERE data::text ILIKE '%avatar-proxy%'
    ) z`);

  const [localhostDetailRows, whatsappCdnDetailRows] = await Promise.all([
    collectLocalhostAuditSamples(pool, AUDIT_DETAIL_SAMPLE_LIMIT),
    collectWhatsappCdnAuditSamples(pool, AUDIT_DETAIL_SAMPLE_LIMIT),
  ]);

  const result = {
    summary: {
      localhost_em_colunas_texto: localhostSum,
      whatsapp_net_em_campos_finais: Number(wa.rows[0]?.c ?? 0),
      avatar_proxy_persistido: Number(proxy.rows[0]?.c ?? 0),
    },
    hint:
      'Valores whatsapp.net podem ser esperados até cache completo. localhost indica URLs absolutas de dev persistidas.',
    details: {
      localhost: localhostDetailRows,
      whatsapp_cdn: whatsappCdnDetailRows,
    },
  };

  const runId = await insertScriptRun(pool, {
    scriptKey: 'media.audit_urls',
    mode: 'preview',
    status: 'success',
    executedBy: userId,
    affectedCount: 0,
    previewPayload: result,
    resultPayload: { ok: true },
    errorMessage: null,
  });

  return { runId, result };
}

async function runStripLocalhost(
  userId: string,
  mode: AdminScriptMode
): Promise<{ runId: string; result: Record<string, unknown> }> {
  if (mode === 'preview') {
    if (!allowPreview(userId, 'media.strip_localhost_internal_urls')) {
      throw new AdminScriptValidationError('Aguarde alguns segundos antes de novo preview.', 429);
    }
  } else {
    if (!allowExecute(userId, 'media.strip_localhost_internal_urls')) {
      throw new AdminScriptValidationError('Aguarde antes de nova execução deste script.', 429);
    }
  }

  const candidates = await collectStripCandidates(pool);
  const jsonHint = await countProductJsonLocalhost(pool);

  const sample: StripPreviewRow[] = candidates.slice(0, PREVIEW_SAMPLE_LIMIT).map((c) => ({
    table: c.table,
    field: c.column,
    id: c.id,
    currentSummary: summarizeUrlForLog(c.oldValue),
    nextSummary: summarizeUrlForLog(c.newValue),
  }));

  const previewPayload = {
    totalFound: candidates.length,
    sample,
    truncatedSample: candidates.length > PREVIEW_SAMPLE_LIMIT,
    jsonProductsLocalhostRowsEstimate: jsonHint,
    jsonNote:
      'Arrays images/secondary_images não são alterados automaticamente nesta versão; corrigir manualmente ou script futuro.',
  };

  if (mode === 'preview') {
    const runId = await insertScriptRun(pool, {
      scriptKey: 'media.strip_localhost_internal_urls',
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
  const client = await pool.connect();
  let updated = 0;
  let errors = 0;
  const errorSamples: string[] = [];
  try {
    await client.query('BEGIN');
    for (const c of candidates) {
      try {
        const r = await client.query(
          `UPDATE public.${quoteIdent(c.table)} SET ${quoteIdent(c.column)} = $1 WHERE id = $2::uuid`,
          [c.newValue, c.id]
        );
        updated += r.rowCount ?? 0;
      } catch (e: any) {
        errors += 1;
        if (errorSamples.length < 5) {
          errorSamples.push(`${c.table}.${c.column} id=${c.id}: ${e?.message ?? 'erro'}`);
        }
      }
    }
    await client.query('COMMIT');
  } catch (e: any) {
    await client.query('ROLLBACK');
    const runId = await insertScriptRun(pool, {
      scriptKey: 'media.strip_localhost_internal_urls',
      mode: 'execute',
      status: 'failed',
      executedBy: userId,
      affectedCount: 0,
      previewPayload,
      resultPayload: { ok: false },
      errorMessage: e?.message ?? 'rollback',
    });
    client.release();
    return {
      runId,
      result: {
        ok: false,
        error: e?.message ?? 'Transação revertida.',
        previewPayload,
      },
    };
  }
  client.release();

  const resultPayload = {
    ok: true,
    recordsUpdated: updated,
    recordsPlanned: candidates.length,
    /** Linhas em que o UPDATE falhou (candidato mantido inalterado). */
    recordsWithErrors: errors,
    errorSamples,
    jsonProductsLocalhostRowsEstimate: jsonHint,
  };

  const runId = await insertScriptRun(pool, {
    scriptKey: 'media.strip_localhost_internal_urls',
    mode: 'execute',
    status: 'success',
    executedBy: userId,
    affectedCount: updated,
    previewPayload,
    resultPayload,
    errorMessage: errors > 0 ? `${errors} linha(s) com erro parcial` : null,
  });

  return { runId, result: { ...resultPayload, previewSummary: previewPayload } };
}

type UazWebhookReviewRow = {
  tenant_id: string | null;
  tenant_name: string | null;
  instance_id: string;
  instance_name: string;
  connected_phone: string | null;
  status: string;
  webhook_secret: string | null;
  webhook_needs_reconfiguration: boolean | null;
  webhook_secret_last_seen_at: string | null;
  metadata_webhook_secret: string | null;
  metadata_webhook_url: string | null;
};

function normalizeUrlStatus(url: string | null): 'missing' | 'no_instance_id' | 'ok' {
  const raw = (url || '').trim();
  if (!raw) return 'missing';
  try {
    const u = new URL(raw);
    return u.searchParams.get('instanceId') ? 'ok' : 'no_instance_id';
  } catch {
    return /[?&]instanceId=/.test(raw) ? 'ok' : 'no_instance_id';
  }
}

async function runUazapiReviewWebhooks(
  userId: string,
  mode: AdminScriptMode,
  body?: Record<string, unknown>
): Promise<{ runId: string; result: Record<string, unknown> }> {
  const generateMissingSecrets = body?.generateMissingSecrets === true;
  const rowsRes = await pool.query<UazWebhookReviewRow>(
    `SELECT
      u.tenant_id::text AS tenant_id,
      t.name::text AS tenant_name,
      ci.id::text AS instance_id,
      ci.name::text AS instance_name,
      ci.connected_phone::text AS connected_phone,
      ci.status::text AS status,
      ci.webhook_secret::text AS webhook_secret,
      ci.webhook_needs_reconfiguration,
      ci.webhook_secret_last_seen_at::text,
      NULLIF(COALESCE(ci.metadata->>'webhook_secret', ''), '')::text AS metadata_webhook_secret,
      NULLIF(COALESCE(ci.metadata->>'webhook_url', ci.metadata->'webhook'->>'url', ''), '')::text AS metadata_webhook_url
     FROM chat_instances ci
     INNER JOIN users u ON u.id = ci.user_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     ORDER BY t.name NULLS LAST, ci.created_at DESC`
  );
  const rows = rowsRes.rows;
  const previewRows = rows.slice(0, 250).map((r) => {
    const columnSecretLen = (r.webhook_secret || '').trim().length;
    const metadataSecretLen = (r.metadata_webhook_secret || '').trim().length;
    const hasSecret = columnSecretLen >= WEBHOOK_SECRET_MIN_LEN;
    const shortSecret = columnSecretLen > 0 && columnSecretLen < WEBHOOK_SECRET_MIN_LEN;
    const divergent =
      columnSecretLen > 0 &&
      metadataSecretLen > 0 &&
      (r.webhook_secret || '').trim() !== (r.metadata_webhook_secret || '').trim();
    const urlStatus = normalizeUrlStatus(r.metadata_webhook_url);
    const needsReconfiguration = Boolean(
      r.webhook_needs_reconfiguration || !hasSecret || shortSecret || divergent || urlStatus !== 'ok'
    );
    return {
      tenant: r.tenant_name || '(sem tenant)',
      tenant_id: r.tenant_id,
      instance_id: r.instance_id,
      nome: r.instance_name,
      telefone: r.connected_phone,
      status: r.status,
      has_secret: hasSecret,
      secret_len: columnSecretLen || metadataSecretLen || 0,
      webhook_url_status: urlStatus,
      needs_reconfiguration: needsReconfiguration,
      last_seen_at: r.webhook_secret_last_seen_at,
      suggested_action: needsReconfiguration ? 'reconfigure_webhook' : 'none',
      metadata_secret_divergent: divergent,
    };
  });

  const summary = {
    total_instances: rows.length,
    missing_secret: previewRows.filter((r) => !r.has_secret).length,
    short_secret: previewRows.filter((r) => r.secret_len > 0 && r.secret_len < WEBHOOK_SECRET_MIN_LEN).length,
    metadata_secret_divergent: previewRows.filter((r) => r.metadata_secret_divergent).length,
    missing_webhook_url: previewRows.filter((r) => r.webhook_url_status === 'missing').length,
    webhook_url_without_instance_id: previewRows.filter((r) => r.webhook_url_status === 'no_instance_id').length,
    needs_reconfiguration_true: previewRows.filter((r) => r.needs_reconfiguration).length,
    never_seen_webhook: previewRows.filter((r) => !r.last_seen_at).length,
    preview_rows: previewRows.length,
    preview_truncated: rows.length > previewRows.length,
  };

  const previewPayload = { summary, rows: previewRows };
  if (mode === 'preview') {
    const runId = await insertScriptRun(pool, {
      scriptKey: 'uazapi.review_webhooks',
      mode: 'preview',
      status: 'success',
      executedBy: userId,
      affectedCount: summary.needs_reconfiguration_true,
      previewPayload,
      resultPayload: { ok: true },
      errorMessage: null,
    });
    return { runId, result: previewPayload };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let marked = 0;
    let generated = 0;
    for (const row of rows) {
      const secret = (row.webhook_secret || '').trim();
      const metaSecret = (row.metadata_webhook_secret || '').trim();
      const secretLen = secret.length || metaSecret.length;
      const divergent = secret && metaSecret && secret !== metaSecret;
      const urlStatus = normalizeUrlStatus(row.metadata_webhook_url);
      const shouldMark =
        !secret ||
        secretLen < WEBHOOK_SECRET_MIN_LEN ||
        divergent ||
        urlStatus !== 'ok' ||
        row.webhook_needs_reconfiguration === true;
      if (!shouldMark) continue;

      const nextSecret =
        generateMissingSecrets && (!secret || secretLen < WEBHOOK_SECRET_MIN_LEN)
          ? generateWebhookSecretForAdminScript()
          : secret || null;
      if (nextSecret && nextSecret !== secret) generated += 1;

      const patch: Record<string, unknown> = {
        webhook_needs_reconfiguration: true,
        webhook_reviewed_at: new Date().toISOString(),
        webhook_reviewed_by_script: true,
      };
      if (nextSecret) patch.webhook_secret = nextSecret;
      await client.query(
        `UPDATE chat_instances
         SET webhook_needs_reconfiguration = true,
             webhook_secret = COALESCE($1, webhook_secret),
             webhook_secret_created_at = CASE WHEN $1 IS NOT NULL AND webhook_secret_created_at IS NULL THEN now() ELSE webhook_secret_created_at END,
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = now()
         WHERE id = $3`,
        [nextSecret, JSON.stringify(patch), row.instance_id]
      );
      marked += 1;
    }
    await client.query('COMMIT');
    const resultPayload = {
      ok: true,
      marked_needs_reconfiguration: marked,
      generated_missing_secrets: generated,
      generate_missing_secrets: generateMissingSecrets,
      summary,
    };
    const runId = await insertScriptRun(pool, {
      scriptKey: 'uazapi.review_webhooks',
      mode: 'execute',
      status: 'success',
      executedBy: userId,
      affectedCount: marked,
      previewPayload,
      resultPayload,
      errorMessage: null,
    });
    return { runId, result: resultPayload };
  } catch (e: any) {
    await client.query('ROLLBACK');
    const runId = await insertScriptRun(pool, {
      scriptKey: 'uazapi.review_webhooks',
      mode: 'execute',
      status: 'failed',
      executedBy: userId,
      affectedCount: 0,
      previewPayload,
      resultPayload: { ok: false },
      errorMessage: e?.message ?? 'falha',
    });
    return { runId, result: { ok: false, error: e?.message ?? 'Falha na execução' } };
  } finally {
    client.release();
  }
}

export class AdminScriptValidationError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AdminScriptValidationError';
  }
}

export class AdminScriptNotImplementedError extends Error {
  constructor(public scriptKey: string) {
    super(`Script não implementado: ${scriptKey}`);
    this.name = 'AdminScriptNotImplementedError';
  }
}

function rethrowMediaDiagAsValidation(e: unknown): never {
  if (e instanceof AdminMediaDiagError) {
    throw new AdminScriptValidationError(e.message, e.statusCode);
  }
  throw e;
}

export async function runAdminScript(params: {
  scriptKey: string;
  mode: AdminScriptMode;
  userId: string;
  body?: Record<string, unknown>;
}): Promise<{ runId: string; result: Record<string, unknown> }> {
  const { scriptKey, mode, userId, body } = params;
  const entry = getCatalogEntry(scriptKey);
  if (!entry) {
    throw new AdminScriptValidationError('Script desconhecido.', 404);
  }
  if (!entry.implemented) {
    throw new AdminScriptNotImplementedError(scriptKey);
  }
  if (entry.auditOnly && mode === 'execute') {
    throw new AdminScriptValidationError('Este script só suporta preview (auditoria).', 400);
  }

  const key = scriptKey as AdminScriptKey;

  switch (key) {
    case 'media.diagnose_system':
      try {
        return await runMediaDiagnoseSystem({
          userId,
          mode,
          insertScriptRun: (input) => insertScriptRun(pool, input),
        });
      } catch (e) {
        rethrowMediaDiagAsValidation(e);
      }
    case 'media.test_storage_roundtrip':
      try {
        return await runMediaTestStorageRoundtrip({
          userId,
          mode,
          body,
          insertScriptRun: (input) => insertScriptRun(pool, input),
        });
      } catch (e) {
        rethrowMediaDiagAsValidation(e);
      }
    case 'media.diagnose_conversation_avatar':
      try {
        return await runMediaDiagnoseConversationAvatar({
          userId,
          mode,
          body,
          insertScriptRun: (input) => insertScriptRun(pool, input),
        });
      } catch (e) {
        rethrowMediaDiagAsValidation(e);
      }
    case 'media.audit_urls':
      return runMediaAuditUrls(userId, mode);
    case 'media.strip_localhost_internal_urls':
      return runStripLocalhost(userId, mode);
    case 'media.reprocess_avatar_cache':
      try {
        return await runWhatsappAvatarReprocessAdminScript({
          pool,
          userId,
          mode,
          body,
          insertScriptRun: (input) => insertScriptRun(pool, input),
          allowPreview,
          allowExecute,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('MEDIA_AVATAR_WHATSAPP_ENABLED')) {
          throw new AdminScriptValidationError(msg, 400);
        }
        if (msg.includes('tenantId inválido')) {
          throw new AdminScriptValidationError(msg, 400);
        }
        if (msg.includes('Aguarde')) {
          throw new AdminScriptValidationError(msg, 429);
        }
        throw e;
      }
    case 'media.repair_broken_avatar_cache':
      try {
        return await runWhatsappAvatarRepairBrokenCacheAdminScript({
          pool,
          userId,
          mode,
          body,
          insertScriptRun: (input) => insertScriptRun(pool, input),
          allowPreview,
          allowExecute,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('MEDIA_AVATAR_WHATSAPP_ENABLED')) {
          throw new AdminScriptValidationError(msg, 400);
        }
        if (msg.includes('tenantId inválido')) {
          throw new AdminScriptValidationError(msg, 400);
        }
        if (msg.includes('Aguarde')) {
          throw new AdminScriptValidationError(msg, 429);
        }
        throw e;
      }
    case 'uazapi.review_webhooks':
      return runUazapiReviewWebhooks(userId, mode, body);
    default:
      throw new AdminScriptNotImplementedError(scriptKey);
  }
}

export async function listScriptsWithLastRun(): Promise<
  (typeof ADMIN_SCRIPTS_CATALOG[number] & {
    lastExecuteAt: string | null;
    lastPreviewAt: string | null;
  })[]
> {
  let lastExec = new Map<string, string>();
  let lastPrev = new Map<string, string>();
  try {
    const ex = await pool.query(
      `SELECT script_key, max(created_at)::text AS t
       FROM public.admin_script_runs
       WHERE mode = 'execute' AND status = 'success'
       GROUP BY script_key`
    );
    for (const row of ex.rows as { script_key: string; t: string }[]) {
      lastExec.set(row.script_key, row.t);
    }
    const pr = await pool.query(
      `SELECT script_key, max(created_at)::text AS t
       FROM public.admin_script_runs
       WHERE mode = 'preview' AND status = 'success'
       GROUP BY script_key`
    );
    for (const row of pr.rows as { script_key: string; t: string }[]) {
      lastPrev.set(row.script_key, row.t);
    }
  } catch {
    // tabela ainda não existe
  }

  return ADMIN_SCRIPTS_CATALOG.map((s) => ({
    ...s,
    lastExecuteAt: lastExec.get(s.key) ?? null,
    lastPreviewAt: lastPrev.get(s.key) ?? null,
  }));
}

/**
 * Super Admin — Fix / Diagnóstico de mídia (somente evidências; não altera fluxo de avatar).
 * Não expõe segredos. Remove apenas ficheiro gerado pelo teste de round-trip.
 */

import { createHash, randomBytes } from 'crypto';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import {
  deleteFile,
  exists,
  readBuffer,
  resolveAbsolutePath,
} from '../media/mediaLocalStorageAdapter.js';
import {
  getMediaSigningSecretSource,
  getMediaStorageRoot,
  isMediaAssetsWriteEnabled,
  isMediaAvatarWhatsappEnabled,
} from '../media/mediaConfig.js';
import { saveFromBuffer } from '../media/mediaService.js';
import {
  extractMediaStorageKeyFromStoredUrl,
  MEDIA_RAW_SIGNED_PATH,
  verifyMediaSignature,
} from '../media/mediaUrlSigner.js';
import {
  CATALOG_MEDIA_PUBLIC_RAW_PATH,
  extractCatalogMediaRelativeKeyFromStoredUrl,
  verifyCatalogMediaPublicQuery,
} from '../../utils/catalogMediaPublicSignedUrl.js';
import { pool } from '../../utils/db.js';

const MIN_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AdminScriptMode = 'preview' | 'execute';

export type InsertScriptRunFn = (input: {
  scriptKey: string;
  mode: AdminScriptMode;
  status: 'success' | 'failed';
  executedBy: string;
  affectedCount: number;
  previewPayload: unknown;
  resultPayload: unknown;
  errorMessage?: string | null;
}) => Promise<string>;

export class AdminMediaDiagError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AdminMediaDiagError';
  }
}

function truncateUrl(url: string | null | undefined, max = 140): string | null {
  if (url == null || typeof url !== 'string') return null;
  const t = url.trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function truncateStr(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export type UrlClassification =
  | 'media_raw'
  | 'catalog_raw'
  | 'media_catalog'
  | 'whatsapp_cdn'
  | 'avatar_proxy'
  | 'localhost'
  | 'empty'
  | 'other';

export function classifyMediaUrl(url: string | null | undefined): UrlClassification {
  if (url == null || typeof url !== 'string') return 'empty';
  const u = url.trim();
  if (!u) return 'empty';
  const low = u.toLowerCase();
  if (low.includes('localhost')) return 'localhost';
  if (low.includes('/api/chat/avatar-proxy')) return 'avatar_proxy';
  if (low.includes(MEDIA_RAW_SIGNED_PATH) || low.includes('/api/media/v1/raw')) return 'media_raw';
  if (low.includes(CATALOG_MEDIA_PUBLIC_RAW_PATH) || low.includes('/api/public/catalog-media/raw')) {
    return 'catalog_raw';
  }
  if (low.includes('/media/catalog/')) return 'media_catalog';
  if (low.includes('whatsapp.net') || low.includes('whatsapp.com')) return 'whatsapp_cdn';
  return 'other';
}

async function tryDiskFreeBytes(dir: string): Promise<number | null> {
  try {
    const mod = await import('fs/promises');
    const statfs = (mod as unknown as { statfs?: (p: string) => Promise<{ bavail: bigint | number; bsize: bigint | number }> })
      .statfs;
    if (typeof statfs !== 'function') return null;
    const s = await statfs(dir);
    const bavail = typeof s.bavail === 'bigint' ? Number(s.bavail) : Number(s.bavail);
    const bsize = typeof s.bsize === 'bigint' ? Number(s.bsize) : Number(s.bsize);
    if (!Number.isFinite(bavail) || !Number.isFinite(bsize)) return null;
    return bavail * bsize;
  } catch {
    return null;
  }
}

async function probeStorageDirectory(root: string): Promise<{
  directoryExists: boolean;
  canWriteTemp: boolean;
  canReadTemp: boolean;
  canDeleteTemp: boolean;
  tempProbeError: string | null;
}> {
  let directoryExists = false;
  try {
    await fs.access(root);
    directoryExists = true;
  } catch {
    return {
      directoryExists: false,
      canWriteTemp: false,
      canReadTemp: false,
      canDeleteTemp: false,
      tempProbeError: 'directory_missing_or_inaccessible',
    };
  }
  const probeName = `.painelcrm_media_probe_${randomBytes(8).toString('hex')}.tmp`;
  const probePath = path.join(root, probeName);
  let canWriteTemp = false;
  let canReadTemp = false;
  let canDeleteTemp = false;
  let tempProbeError: string | null = null;
  try {
    await fs.writeFile(probePath, 'ok', 'utf8');
    canWriteTemp = true;
    const read = await fs.readFile(probePath, 'utf8');
    canReadTemp = read === 'ok';
    await fs.unlink(probePath);
    canDeleteTemp = true;
  } catch (e: unknown) {
    tempProbeError = e instanceof Error ? e.message : String(e);
    try {
      await fs.unlink(probePath).catch(() => {});
    } catch {
      /* ignore */
    }
  }
  return { directoryExists, canWriteTemp, canReadTemp, canDeleteTemp, tempProbeError };
}

function resolveInternalApiBaseForFetch(): { base: string; source: string } {
  const a = process.env.API_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
  if (a) return { base: a, source: 'API_PUBLIC_BASE_URL' };
  const b = process.env.PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (b) return { base: b, source: 'PUBLIC_API_URL' };
  const c = process.env.FRONTEND_URL?.trim().replace(/\/$/, '');
  if (c) return { base: c, source: 'FRONTEND_URL' };
  const port = process.env.API_PORT || process.env.PORT || '3001';
  return { base: `http://127.0.0.1:${port}`, source: `loopback:${port}` };
}

/** Monta URL absoluta para sonda HTTP a partir do mesmo env que o round-trip (evidência servidor ↔ API pública). */
function resolveUrlForServerSideHttpProbe(stored: string): { url: string; base_source: string } | null {
  const t = stored.trim();
  if (!t) return null;
  if (t.startsWith('/')) {
    const { base, source } = resolveInternalApiBaseForFetch();
    return { url: `${base.replace(/\/$/, '')}${t}`, base_source: source };
  }
  if (/^https?:\/\//i.test(t)) return { url: t, base_source: 'stored_absolute_url' };
  return null;
}

/**
 * HEAD/GET mínimo a partir do Node — não reproduz cookies do browser.
 * Útil para comparar com DevTools; WhatsApp costuma devolver 403 ao servidor.
 */
async function probeHttpFromNode(absoluteUrl: string, baseHint: string): Promise<Record<string, unknown>> {
  if (absoluteUrl.includes('/api/chat/avatar-proxy')) {
    return {
      skipped: true,
      reason: 'avatar_proxy_requires_browser_session',
    };
  }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    let res = await fetch(absoluteUrl, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(to);
    if (res.status === 405 || res.status === 501) {
      const ctrl2 = new AbortController();
      const to2 = setTimeout(() => ctrl2.abort(), 12000);
      res = await fetch(absoluteUrl, {
        method: 'GET',
        signal: ctrl2.signal,
        redirect: 'follow',
        headers: { Range: 'bytes=0-0', Accept: 'image/*,*/*;q=0.8' },
      });
      clearTimeout(to2);
    }
    const ct = res.headers.get('content-type');
    return {
      resolved_fetch_base_source: baseHint,
      http_status: res.status,
      content_type: ct,
      note:
        'Sonda no processo backend. 403 em pps.whatsapp.net é frequente. Para /api/media/v1/raw, 200 + image/* sugere rota e assinatura coerentes no secret atual.',
    };
  } catch (e: unknown) {
    return {
      resolved_fetch_base_source: baseHint,
      error: e instanceof Error ? e.message : String(e),
      note: 'Timeout, DNS ou TLS — comparar com GET manual na mesma URL.',
    };
  }
}

async function pickTenantIdForProbe(): Promise<string> {
  const r = await pool.query(`SELECT id::text FROM public.tenants ORDER BY created_at ASC LIMIT 1`);
  const id = r.rows[0]?.id as string | undefined;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
  throw new AdminMediaDiagError('Nenhum tenant encontrado — não é possível executar o teste de escrita.', 400);
}

async function analyzeMediaRawUrl(url: string): Promise<Record<string, unknown>> {
  const storageKey = extractMediaStorageKeyFromStoredUrl(url.trim());
  if (!storageKey) {
    return { probable_status: 'URL inválida', reason: 'could_not_extract_storage_key' };
  }
  let sig = '';
  try {
    const u = new URL(url.trim(), 'https://placeholder.local');
    sig = u.searchParams.get('s') || '';
  } catch {
    sig = '';
  }
  const signature_valid = sig ? verifyMediaSignature(storageKey, sig) : false;
  let absPrefix: string | null = null;
  try {
    absPrefix = truncateStr(resolveAbsolutePath(storageKey), 120);
  } catch (e: unknown) {
    return {
      storage_key_prefix: truncateStr(storageKey, 80),
      signature_valid,
      probable_status: 'URL inválida ou path bloqueado',
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const file_exists = await exists(storageKey);
  let adapter_read_ok = false;
  try {
    const buf = await readBuffer(storageKey);
    adapter_read_ok = Buffer.isBuffer(buf) && buf.length > 0;
  } catch {
    adapter_read_ok = false;
  }
  let probable_status = 'OK';
  if (!signature_valid) probable_status = 'assinatura inválida';
  else if (!file_exists) probable_status = 'arquivo ausente';
  else if (!adapter_read_ok) probable_status = 'leitura falhou';
  return {
    storage_key_prefix: truncateStr(storageKey, 80),
    signature_valid,
    absolute_path_preview: absPrefix,
    file_exists,
    adapter_read_ok,
    resolved_media_storage_root: getMediaStorageRoot(),
    probable_status,
  };
}

function analyzeCatalogStoredUrl(url: string): Record<string, unknown> {
  const key = extractCatalogMediaRelativeKeyFromStoredUrl(url);
  if (!key) {
    return { probable_status: 'URL inválida', reason: 'could_not_extract_catalog_key' };
  }
  let k = '';
  let s = '';
  try {
    const u = new URL(url.trim(), 'https://placeholder.local');
    k = u.searchParams.get('k') || '';
    s = u.searchParams.get('s') || '';
  } catch {
    /* ignore */
  }
  const signature_valid = k && s ? verifyCatalogMediaPublicQuery(k, s) : false;
  const legacy =
    url.includes('/media/catalog/') ||
    url.includes('/api/catalog-media/public/') ||
    (!url.includes(CATALOG_MEDIA_PUBLIC_RAW_PATH) && !url.includes('/api/public/catalog-media/raw'));
  return {
    relative_key_prefix: truncateStr(key, 100),
    signature_valid,
    legacy_path_or_style: legacy,
    hint: 'Catálogo usa CATALOG_MEDIA_PUBLIC_TOKEN_SECRET e storage distinto (CATALOG_MEDIA_STORAGE_PATH).',
    probable_status: signature_valid ? 'OK (assinatura)' : 'assinatura inválida ou URL truncada',
  };
}

export async function runMediaDiagnoseSystem(params: {
  userId: string;
  mode: AdminScriptMode;
  insertScriptRun: InsertScriptRunFn;
}): Promise<{ runId: string; result: Record<string, unknown> }> {
  const { userId, mode, insertScriptRun } = params;
  if (mode === 'execute') {
    throw new AdminMediaDiagError('Este script é apenas preview (diagnóstico).', 400);
  }

  const root = getMediaStorageRoot();
  const probe = await probeStorageDirectory(root);
  const diskFreeBytes = await tryDiskFreeBytes(root);
  let processUser: string | null = null;
  try {
    processUser = os.userInfo().username;
  } catch {
    processUser = null;
  }
  const uid = typeof process.getuid === 'function' ? String(process.getuid()) : null;

  const storageOk = probe.canWriteTemp && probe.canReadTemp && probe.canDeleteTemp;
  const overall_status = storageOk ? ('OK' as const) : ('Atenção' as const);

  const result = {
    overall_status,
    sections: {
      env: {
        status: 'OK' as const,
        NODE_ENV: process.env.NODE_ENV ?? null,
        MEDIA_STORAGE_ROOT_env: process.env.MEDIA_STORAGE_ROOT?.trim() || null,
        resolved_media_storage_root: root,
        MEDIA_SIGNING_SECRET_configured: Boolean(process.env.MEDIA_SIGNING_SECRET?.trim()),
        CATALOG_MEDIA_PUBLIC_TOKEN_SECRET_configured: Boolean(
          process.env.CATALOG_MEDIA_PUBLIC_TOKEN_SECRET?.trim()
        ),
        signing_secret_source: getMediaSigningSecretSource(),
        MEDIA_AVATAR_WHATSAPP_ENABLED: isMediaAvatarWhatsappEnabled(),
        MEDIA_ASSETS_WRITE_ENABLED: isMediaAssetsWriteEnabled(),
      },
      storage: {
        status: storageOk ? ('OK' as const) : ('Atenção' as const),
        directory_exists: probe.directoryExists,
        can_write_probe: probe.canWriteTemp,
        can_read_probe: probe.canReadTemp,
        can_delete_probe: probe.canDeleteTemp,
        probe_error: probe.tempProbeError,
        disk_free_bytes_estimate: diskFreeBytes,
        process_os_user: processUser,
        process_uid: uid,
      },
      routes: {
        status: 'OK' as const,
        GET_api_media_v1_raw:
          'Registado em código: packages/backend/src/index.ts monta app.use("/api/media", mediaRoutes); packages/backend/src/services/media/mediaRoutes.ts define GET /v1/raw → caminho efetivo /api/media/v1/raw',
        catalog_legacy: `GET ${CATALOG_MEDIA_PUBLIC_RAW_PATH} (catálogo público assinado)`,
        avatar_proxy: 'GET /api/chat/avatar-proxy (requer sessão CRM no browser)',
      },
    },
    hint: 'Compare resolved_media_storage_root com o volume montado no deploy (ex.: EasyPanel).',
  };

  const runId = await insertScriptRun({
    scriptKey: 'media.diagnose_system',
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

export async function runMediaTestStorageRoundtrip(params: {
  userId: string;
  mode: AdminScriptMode;
  body?: Record<string, unknown>;
  insertScriptRun: InsertScriptRunFn;
}): Promise<{ runId: string; result: Record<string, unknown> }> {
  const { userId, mode, insertScriptRun, body } = params;

  const root = getMediaStorageRoot();
  const probe = await probeStorageDirectory(root);

  if (mode === 'preview') {
    const dry = {
      overall_status: 'OK' as const,
      dry_run: true,
      sections: {
        env: {
          status: 'OK' as const,
          resolved_media_storage_root: root,
          signing_secret_source: getMediaSigningSecretSource(),
          MEDIA_AVATAR_WHATSAPP_ENABLED: isMediaAvatarWhatsappEnabled(),
          MEDIA_ASSETS_WRITE_ENABLED: isMediaAssetsWriteEnabled(),
        },
        storage: {
          status:
            probe.canWriteTemp && probe.canReadTemp ? ('OK' as const) : ('Atenção' as const),
          ...probe,
        },
      },
      hint: 'Execute para gravar PNG mínimo, indexar media_assets, validar disco, GET HTTP interno e apagar o ficheiro de teste.',
    };
    const runId = await insertScriptRun({
      scriptKey: 'media.test_storage_roundtrip',
      mode: 'preview',
      status: 'success',
      executedBy: userId,
      affectedCount: 0,
      previewPayload: dry,
      resultPayload: { ok: true },
      errorMessage: null,
    });
    return { runId, result: dry };
  }

  const tenantId =
    typeof body?.tenantId === 'string' && body.tenantId.trim()
      ? body.tenantId.trim()
      : await pickTenantIdForProbe();

  const pngBuf = Buffer.from(MIN_PNG_B64, 'base64');
  const suffix = randomBytes(6).toString('hex');

  let storageKey = '';
  let relativeUrl = '';
  let checksum = '';
  let assetId: string | null = null;
  let physicalExists = false;
  let adapterReadOk = false;
  let internalHttpStatus: number | null = null;
  let internalHttpContentType: string | null = null;
  let internalHttpError: string | null = null;
  let error: string | null = null;
  const { base: apiBase, source: apiBaseSource } = resolveInternalApiBaseForFetch();

  try {
    const saved = await saveFromBuffer({
      tenantId,
      ownerType: 'unassigned',
      ownerId: null,
      scope: 'whatsapp_avatar',
      buffer: pngBuf,
      mimeType: 'image/png',
      originalFilename: `diag_probe_${suffix}.png`,
      metadata: { createdBy: userId, via: 'media.test_storage_roundtrip' },
      writeAssetRecord: true,
    });
    storageKey = saved.storageKey;
    relativeUrl = saved.relativeUrl;
    checksum = saved.checksum;

    const ar = await pool.query(
      `SELECT id::text FROM public.media_assets WHERE storage_key = $1 LIMIT 1`,
      [storageKey]
    );
    assetId = ar.rows[0]?.id ?? null;

    physicalExists = await exists(storageKey);
    try {
      const buf = await readBuffer(storageKey);
      const hash = createHash('sha256').update(buf).digest('hex');
      adapterReadOk = Buffer.isBuffer(buf) && buf.length > 0 && hash === checksum;
    } catch {
      adapterReadOk = false;
    }

    const fullUrl = `${apiBase}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(fullUrl, { method: 'GET', signal: ctrl.signal });
      clearTimeout(to);
      internalHttpStatus = res.status;
      internalHttpContentType = res.headers.get('content-type');
      if (!res.ok) internalHttpError = `HTTP ${res.status}`;
    } catch (e: unknown) {
      internalHttpError = e instanceof Error ? e.message : String(e);
    }

    try {
      await deleteFile(storageKey);
    } catch (e: unknown) {
      error = `Teste concluído mas falha ao apagar ficheiro temporário: ${e instanceof Error ? e.message : String(e)}`;
    }
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  const httpOk =
    internalHttpStatus === 200 &&
    Boolean(internalHttpContentType?.toLowerCase().includes('image/'));
  const okPipeline = !error && physicalExists && adapterReadOk && httpOk;
  const overall_status = okPipeline ? ('OK' as const) : error && !storageKey ? ('Erro' as const) : ('Atenção' as const);

  const result = {
    overall_status,
    storageKey,
    relativeUrl,
    checksum,
    assetId,
    physicalExists,
    adapterReadOk,
    internalHttpStatus,
    internalHttpContentType,
    internalHttpError,
    tenant_id_used: tenantId,
    internal_fetch_base_source: apiBaseSource,
    sections: {
      env: {
        status: 'OK' as const,
        tenant_id_used: tenantId,
        internal_fetch_base_source: apiBaseSource,
      },
      storage_roundtrip: {
        status: physicalExists && adapterReadOk ? ('OK' as const) : ('Erro' as const),
        storageKey,
        relativeUrl,
        checksum,
        assetId,
        physicalExists,
        adapterReadOk,
        probe_at_start: probe,
      },
      http: {
        status:
          internalHttpStatus === 200 ? ('OK' as const) : internalHttpStatus ? ('Atenção' as const) : ('Atenção' as const),
        url_sample: truncateUrl(`${apiBase}${relativeUrl}`, 200),
        internalHttpStatus,
        internalHttpContentType,
        internalHttpError,
        note:
          'Em Docker, o GET pode falhar se API_PUBLIC_BASE_URL/PUBLIC_API_URL não apontar para este serviço; adapterReadOk valida o disco local.',
      },
      database: {
        status: assetId ? ('OK' as const) : ('Atenção' as const),
        assetId,
        note: assetId ? null : 'media_assets sem linha — verifique escrita / ON CONFLICT.',
      },
    },
    error,
  };

  const runId = await insertScriptRun({
    scriptKey: 'media.test_storage_roundtrip',
    mode: 'execute',
    status: error && !storageKey ? 'failed' : 'success',
    executedBy: userId,
    affectedCount: storageKey ? 1 : 0,
    previewPayload: { tenant_id_used: tenantId },
    resultPayload: result,
    errorMessage: error,
  });

  return { runId, result };
}

export async function runMediaDiagnoseConversationAvatar(params: {
  userId: string;
  mode: AdminScriptMode;
  body?: Record<string, unknown>;
  insertScriptRun: InsertScriptRunFn;
}): Promise<{ runId: string; result: Record<string, unknown> }> {
  const { userId, mode, insertScriptRun, body } = params;
  const conversationId =
    typeof body?.conversationId === 'string' ? body.conversationId.trim() : '';
  if (!conversationId || !UUID_V4_RE.test(conversationId)) {
    throw new AdminMediaDiagError('conversationId (UUID) é obrigatório no corpo do pedido.', 400);
  }

  const rowRes = await pool.query<{
    id: string;
    tenant_id: string | null;
    avatar_url: string | null;
    avatar_cached_url: string | null;
    avatar_source_url: string | null;
    avatar_cache_status: string | null;
    avatar_cached_at: string | null;
  }>(
    `SELECT c.id::text, u.tenant_id::text, c.avatar_url, c.avatar_cached_url, c.avatar_source_url,
            c.avatar_cache_status, c.avatar_cached_at::text
     FROM public.chat_conversations c
     INNER JOIN public.users u ON u.id = c.user_id
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [conversationId]
  );
  const row = rowRes.rows[0];
  if (!row) {
    throw new AdminMediaDiagError('Conversa não encontrada.', 404);
  }

  const fields = [
    { field: 'avatar_url' as const, value: row.avatar_url },
    { field: 'avatar_cached_url' as const, value: row.avatar_cached_url },
    { field: 'avatar_source_url' as const, value: row.avatar_source_url },
  ];

  const classifications = fields.map(({ field, value }) => ({
    field,
    classification: classifyMediaUrl(value),
    preview: truncateUrl(value, 120),
  }));

  const primary =
    row.avatar_cached_url?.trim() ||
    row.avatar_url?.trim() ||
    row.avatar_source_url?.trim() ||
    null;

  const cls = classifyMediaUrl(primary);
  let primary_analysis: Record<string, unknown> = { classification: cls };

  if (primary && cls === 'media_raw') {
    primary_analysis = { classification: cls, ...(await analyzeMediaRawUrl(primary)) };
  } else if (
    primary &&
    (cls === 'catalog_raw' || cls === 'media_catalog' || primary.includes(CATALOG_MEDIA_PUBLIC_RAW_PATH))
  ) {
    primary_analysis = { classification: cls, ...analyzeCatalogStoredUrl(primary) };
  } else if (cls === 'whatsapp_cdn') {
    primary_analysis = {
      classification: cls,
      probable_status: 'Depende de CDN/cache ou reprocessamento para URL estável.',
    };
  } else if (cls === 'avatar_proxy') {
    primary_analysis = {
      classification: cls,
      probable_status: 'URL interna — requer chamada autenticada ao CRM para renderizar.',
    };
  } else if (cls === 'localhost') {
    primary_analysis = {
      classification: cls,
      probable_status: 'URL de desenvolvimento persistida — frontend ou strip necessários.',
    };
  } else if (cls === 'empty') {
    primary_analysis = { classification: cls, probable_status: 'Sem URL primária.' };
  }

  if (primary) {
    const resolvedProbe = resolveUrlForServerSideHttpProbe(primary);
    if (resolvedProbe) {
      primary_analysis = {
        ...primary_analysis,
        external_http_probe: await probeHttpFromNode(resolvedProbe.url, resolvedProbe.base_source),
      };
    } else {
      primary_analysis = {
        ...primary_analysis,
        external_http_probe: {
          skipped: true,
          reason: 'url_not_path_or_absolute_http',
        },
      };
    }
  }

  let overall_status: 'OK' | 'Atenção' | 'Erro' = 'OK';
  if (!primary) {
    overall_status = 'Atenção';
  } else if (cls === 'whatsapp_cdn' || cls === 'avatar_proxy' || cls === 'localhost') {
    overall_status = 'Atenção';
  } else if (cls === 'media_raw') {
    const st = String((primary_analysis as { probable_status?: string }).probable_status || '');
    if (st === 'OK') overall_status = 'OK';
    else if (/assinatura|ausente|inválida|falhou/i.test(st)) overall_status = 'Erro';
    else overall_status = 'Atenção';
  } else if (cls === 'catalog_raw' || cls === 'media_catalog') {
    const st = String((primary_analysis as { probable_status?: string }).probable_status || '');
    if (/inválida/i.test(st)) overall_status = 'Erro';
    else if (!/OK/i.test(st)) overall_status = 'Atenção';
    else overall_status = 'OK';
  } else if (cls === 'empty' || cls === 'other') {
    overall_status = 'Atenção';
  }

  const result = {
    overall_status,
    sections: {
      database: {
        status: 'OK' as const,
        conversation: {
          id: row.id,
          tenant_id: row.tenant_id,
          avatar_url: truncateUrl(row.avatar_url, 120),
          avatar_cached_url: truncateUrl(row.avatar_cached_url, 120),
          avatar_source_url: truncateUrl(row.avatar_source_url, 120),
          avatar_cache_status: row.avatar_cache_status,
          avatar_cached_at: row.avatar_cached_at,
        },
      },
      urls: {
        status: 'OK' as const,
        classifications,
      },
      primary_url: {
        status:
          overall_status === 'OK'
            ? ('OK' as const)
            : overall_status === 'Erro'
              ? ('Erro' as const)
              : ('Atenção' as const),
        chosen_preview: truncateUrl(primary, 160),
        analysis: primary_analysis,
      },
    },
    hints: {
      whatsapp_cdn: 'URLs da CDN WhatsApp são efémeras — use cache interno ou reprocessamento.',
      catalog: 'Catálogo legado usa segredo e pasta distintos da mídia nova.',
    },
  };

  const runId = await insertScriptRun({
    scriptKey: 'media.diagnose_conversation_avatar',
    mode,
    status: 'success',
    executedBy: userId,
    affectedCount: 0,
    previewPayload: mode === 'preview' ? result : { conversationId },
    resultPayload: result,
    errorMessage: null,
  });

  return { runId, result };
}

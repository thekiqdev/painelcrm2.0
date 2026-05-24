/**
 * Link público read-only de visualização de contrato (Etapa 3).
 * Token opaco enviado na URL; armazena-se SHA-256 hex no banco + ciphertext para reemissão ao painel.
 */
import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { hasMeaningfulDocumentHtml, isPdfSignatureDocumentKind } from './contractLifecycle.js';

const TOKEN_BYTES = Math.min(64, Math.max(16, parseInt(process.env.CONTRACT_PUBLIC_VIEW_TOKEN_BYTES || '32', 10) || 32));

const AES_ALG = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

export function hashPublicViewToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generatePublicViewRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function resolveDefaultExpiresAt(): string | null {
  const daysRaw = process.env.CONTRACT_PUBLIC_VIEW_TOKEN_EXPIRY_DAYS;
  if (daysRaw == null || String(daysRaw).trim() === '') return null;
  const days = parseInt(String(daysRaw), 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function getTokenEncryptionKey(): Buffer {
  const envKey = process.env.CONTRACT_PUBLIC_VIEW_TOKEN_ENCRYPTION_KEY;
  if (envKey != null && String(envKey).trim().length >= 8) {
    return crypto.createHash('sha256').update(String(envKey), 'utf8').digest();
  }
  const jwt = process.env.JWT_SECRET || 'dev-insecure-contract-public-view';
  return crypto.createHash('sha256').update(`contract-public-view|${jwt}`, 'utf8').digest();
}

export function encryptPublicViewTokenForStorage(plaintext: string): string {
  const key = getTokenEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(AES_ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptPublicViewTokenFromStorage(encoded: string | null | undefined): string | null {
  if (encoded == null || !String(encoded).trim()) return null;
  try {
    const buf = Buffer.from(String(encoded), 'base64');
    if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const key = getTokenEncryptionKey();
    const decipher = crypto.createDecipheriv(AES_ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Dados de signatário seguros para a página pública de visualização (sem IP, UA, etc.). */
export interface PublicContractViewSigner {
  id: string;
  name: string;
  email: string;
  tax_id: string | null;
  signed: boolean;
  signed_at: string | null;
  signature_image_png_base64: string | null;
  client_ip: string | null;
  method: string | null;
  signature_id: string | null;
  confirmed_name: string | null;
}

export interface ContractPublicViewPayload {
  contract_id: string;
  title: string;
  status: string;
  contract_number: string;
  document_kind: 'html_editor' | 'pdf_signature';
  document_html: string;
  signed_pdf_available: boolean;
  client_name: string | null;
  tenant_name: string | null;
  tenant_logo_url: string | null;
  tenant_logo_light_url: string | null;
  tenant_logo_dark_url: string | null;
  responsible_display_name: string | null;
  signers: PublicContractViewSigner[];
}

const MAX_PUBLIC_SIGNATURE_B64_LENGTH = 520_000;

async function loadPublicViewSigners(contractId: string): Promise<PublicContractViewSigner[]> {
  const r = await pool.query<{
    id: string;
    name: string;
    email: string;
    tax_id: string | null;
    signed_at: Date | string | null;
    signature_data: unknown;
  }>(
    `SELECT id, name, email, tax_id, signed_at, signature_data
     FROM contract_signers
     WHERE contract_id = $1
     ORDER BY signing_order NULLS LAST, created_at`,
    [contractId],
  );
  return r.rows.map((row) => {
    const signed = row.signed_at != null;
    let signature_image_png_base64: string | null = null;
    let client_ip: string | null = null;
    let method: string | null = null;
    let signature_id: string | null = null;
    let confirmed_name: string | null = null;
    if (signed && row.signature_data && typeof row.signature_data === 'object') {
      const o = row.signature_data as Record<string, unknown>;
      const b64 = o.signature_image_png_base64;
      if (typeof b64 === 'string') {
        const t = b64.trim();
        if (t.length > 80 && t.length <= MAX_PUBLIC_SIGNATURE_B64_LENGTH) {
          signature_image_png_base64 = t;
        }
      }
      if (typeof o.client_ip === 'string') client_ip = o.client_ip;
      if (typeof o.method === 'string') method = o.method;
      if (typeof o.invite_id === 'string') signature_id = o.invite_id;
      if (typeof o.confirmed_name === 'string') confirmed_name = o.confirmed_name.trim() || null;
    }
    let signed_at: string | null = null;
    if (row.signed_at) {
      const d = row.signed_at instanceof Date ? row.signed_at : new Date(String(row.signed_at));
      if (!Number.isNaN(d.getTime())) signed_at = d.toISOString();
    }
    return {
      id: row.id,
      name: confirmed_name || row.name,
      email: row.email,
      tax_id: row.tax_id ?? null,
      signed,
      signed_at,
      signature_image_png_base64,
      client_ip,
      method,
      signature_id: signature_id || row.id,
      confirmed_name,
    };
  });
}

/** Resolve o ID do contrato quando o token de visualização é válido (mesmas regras que o payload JSON). */
export async function resolveContractIdForPublicViewToken(rawToken: string): Promise<string | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) return null;
  const hash = hashPublicViewToken(trimmed);
  const r = await pool.query<{ contract_id: string }>(
    `SELECT contract_id::text AS contract_id
     FROM get_contract_public_view_by_token_hash($1)
     LIMIT 1`,
    [hash],
  );
  return r.rows[0]?.contract_id ?? null;
}

export async function getPublicContractViewByRawToken(rawToken: string): Promise<ContractPublicViewPayload | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) return null;
  const hash = hashPublicViewToken(trimmed);
  const r = await pool.query<{
    contract_id: string;
    title: string;
    status: string;
    contract_number: string;
    document_html: string | null;
    client_name: string | null;
    tenant_name: string | null;
    tenant_logo_url: string | null;
    tenant_logo_light_url: string | null;
    tenant_logo_dark_url: string | null;
    responsible_display_name: string | null;
  }>(
    `SELECT contract_id::text AS contract_id, title, status::text AS status, contract_number, document_html,
            client_name, tenant_name, tenant_logo_url, tenant_logo_light_url, tenant_logo_dark_url,
            responsible_display_name
     FROM get_contract_public_view_by_token_hash($1)`,
    [hash],
  );
  const row = r.rows[0];
  if (!row?.contract_id) return null;
  const meta = await pool.query<{
    document_kind: string | null;
    signed_pdf_storage_key: string | null;
    frozen_pdf_storage_key: string | null;
    original_pdf_storage_key: string | null;
  }>(
    `SELECT document_kind, signed_pdf_storage_key, frozen_pdf_storage_key, original_pdf_storage_key
     FROM contracts WHERE id = $1`,
    [row.contract_id],
  );
  const cm = meta.rows[0];
  const isPdf = isPdfSignatureDocumentKind(cm?.document_kind);
  const html = row.document_html ?? '';
  const signers = await loadPublicViewSigners(row.contract_id);
  return {
    contract_id: row.contract_id,
    title: row.title,
    status: row.status,
    contract_number: row.contract_number,
    document_kind: isPdf ? 'pdf_signature' : 'html_editor',
    signed_pdf_available: Boolean(cm?.signed_pdf_storage_key?.trim()),
    document_html: isPdf ? '' : hasMeaningfulDocumentHtml(html) ? html : '',
    client_name: row.client_name,
    tenant_name: row.tenant_name,
    tenant_logo_url: row.tenant_logo_url,
    tenant_logo_light_url: row.tenant_logo_light_url,
    tenant_logo_dark_url: row.tenant_logo_dark_url,
    responsible_display_name: row.responsible_display_name,
    signers,
  };
}

export interface ActiveViewTokenMeta {
  created_at: string;
  expires_at: string | null;
}

/** Contrato acessível ao tenant do utilizador (mesma regra que getContractById). */
async function loadContractForTenant(
  contractId: string,
  requesterUserId: string
): Promise<{
  id: string;
  status: string;
  content_snapshot_html: string | null;
  content_html: string | null;
} | null> {
  const r = await pool.query<{
    id: string;
    status: string;
    content_snapshot_html: string | null;
    content_html: string | null;
  }>(
    `SELECT c.id, c.status, c.content_snapshot_html, c.content_html
     FROM contracts c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = (SELECT tenant_id FROM users WHERE id = $2)
     WHERE c.id = $1`,
    [contractId, requesterUserId]
  );
  return r.rows[0] ?? null;
}

/** Emissão manual / regeneração: qualquer estado exceto cancelado. */
export function isEligibleForPublicViewContract(row: { status: string }): boolean {
  return row.status !== 'CANCELLED';
}

export async function getActiveViewTokenMetaForContract(
  contractId: string,
  requesterUserId: string
): Promise<ActiveViewTokenMeta | null> {
  const contract = await loadContractForTenant(contractId, requesterUserId);
  if (!contract) return null;
  const r = await pool.query<ActiveViewTokenMeta>(
    `SELECT vt.created_at, vt.expires_at
     FROM contract_public_view_tokens vt
     WHERE vt.contract_id = $1 AND vt.revoked_at IS NULL
     LIMIT 1`,
    [contractId]
  );
  return r.rows[0] ?? null;
}

export interface PublicViewTokenInsertResult {
  raw_token: string;
  created_at: string;
  expires_at: string | null;
}

/** Insere token ativo (chamador deve garantir que não há outro ativo ou revogar antes). */
export async function insertActivePublicViewTokenRow(
  client: PoolClient,
  contractId: string
): Promise<PublicViewTokenInsertResult> {
  const raw = generatePublicViewRawToken();
  const tokenHash = hashPublicViewToken(raw);
  const expiresAt = resolveDefaultExpiresAt();
  const ciphertext = encryptPublicViewTokenForStorage(raw);
  const ins = await client.query<{ created_at: string; expires_at: string | null }>(
    `INSERT INTO contract_public_view_tokens (contract_id, token_hash, expires_at, token_ciphertext)
     VALUES ($1, $2, $3, $4)
     RETURNING created_at, expires_at`,
    [contractId, tokenHash, expiresAt, ciphertext]
  );
  const row = ins.rows[0]!;
  return { raw_token: raw, created_at: row.created_at, expires_at: row.expires_at };
}

export async function issuePublicViewToken(params: {
  contractId: string;
  requesterUserId: string;
  regenerate: boolean;
}): Promise<
  | { ok: true; raw_token: string; expires_at: string | null; created_at: string }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_ELIGIBLE' | 'ALREADY_EXISTS' | 'CONFLICT'; created_at?: string }
> {
  const contract = await loadContractForTenant(params.contractId, params.requesterUserId);
  if (!contract) return { ok: false, code: 'NOT_FOUND' };
  if (!isEligibleForPublicViewContract(contract)) return { ok: false, code: 'NOT_ELIGIBLE' };

  const existing = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM contract_public_view_tokens
     WHERE contract_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [params.contractId]
  );
  if (existing.rows[0] && !params.regenerate) {
    return { ok: false, code: 'ALREADY_EXISTS', created_at: existing.rows[0].created_at };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE contract_public_view_tokens SET revoked_at = now()
       WHERE contract_id = $1 AND revoked_at IS NULL`,
      [params.contractId]
    );
    const inserted = await insertActivePublicViewTokenRow(client, params.contractId);
    await client.query('COMMIT');
    return {
      ok: true,
      raw_token: inserted.raw_token,
      expires_at: inserted.expires_at,
      created_at: inserted.created_at,
    };
  } catch (e: unknown) {
    await client.query('ROLLBACK');
    const err = e as { code?: string };
    if (err?.code === '23505') {
      return { ok: false, code: 'CONFLICT' };
    }
    throw e;
  } finally {
    client.release();
  }
}

/** -1 = contrato não encontrado; ≥0 = linhas de token revogadas nesta chamada. */
export async function revokePublicViewToken(contractId: string, requesterUserId: string): Promise<number> {
  const contract = await loadContractForTenant(contractId, requesterUserId);
  if (!contract) return -1;
  const r = await pool.query(
    `UPDATE contract_public_view_tokens SET revoked_at = now()
     WHERE contract_id = $1 AND revoked_at IS NULL`,
    [contractId]
  );
  return r.rowCount ?? 0;
}

export interface EditorPublicViewBootstrap {
  has_active_link: boolean;
  created_at: string | null;
  expires_at: string | null;
  token: string | null;
  frontend_path: string | null;
  public_view_url: string | null;
  legacy_token_not_retrievable?: boolean;
}

function buildBootstrapPaths(rawToken: string, frontendBase: string): { frontend_path: string; public_view_url: string } {
  const path = `/contract-view/${rawToken}`;
  const base = frontendBase.replace(/\/$/, '');
  return {
    frontend_path: path,
    public_view_url: base ? `${base}${path}` : path,
  };
}

/**
 * Materializa link no painel (desencripta token guardado). Não cria token após revogação.
 * Tokens legados sem ciphertext: has_active_link true, token null.
 */
export async function getEditorPublicViewBootstrap(
  contractId: string,
  requesterUserId: string,
  frontendBaseUrl: string
): Promise<EditorPublicViewBootstrap> {
  const nullBoot: EditorPublicViewBootstrap = {
    has_active_link: false,
    created_at: null,
    expires_at: null,
    token: null,
    frontend_path: null,
    public_view_url: null,
  };

  const contract = await loadContractForTenant(contractId, requesterUserId);
  if (!contract) return nullBoot;
  if (contract.status === 'CANCELLED') return nullBoot;

  const r = await pool.query<{
    created_at: string;
    expires_at: string | null;
    token_ciphertext: string | null;
  }>(
    `SELECT created_at, expires_at, token_ciphertext
     FROM contract_public_view_tokens
     WHERE contract_id = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [contractId]
  );
  const row = r.rows[0];

  if (!row) return nullBoot;

  if (row.token_ciphertext) {
    const raw = decryptPublicViewTokenFromStorage(row.token_ciphertext);
    if (raw) {
      const paths = buildBootstrapPaths(raw, frontendBaseUrl);
      return {
        has_active_link: true,
        created_at: row.created_at,
        expires_at: row.expires_at,
        token: raw,
        frontend_path: paths.frontend_path,
        public_view_url: paths.public_view_url,
      };
    }
  }

  return {
    has_active_link: true,
    created_at: row.created_at,
    expires_at: row.expires_at,
    token: null,
    frontend_path: null,
    public_view_url: null,
    legacy_token_not_retrievable: true,
  };
}

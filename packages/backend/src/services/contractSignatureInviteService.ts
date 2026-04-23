/**
 * Convites de assinatura pública por signatário (Etapa 4).
 * Tokens e tabela separados de `contract_public_view_tokens` (Etapa 3).
 */
import { Request } from 'express';
import { pool, withTenantRlsContext } from '../utils/db.js';
import {
  generatePublicViewRawToken,
  hashPublicViewToken,
} from './contractPublicViewService.js';
import { hasMeaningfulDocumentHtml, isDraftStatus, canTransitionStatus } from './contractLifecycle.js';
import { findSignerInTenant } from '../utils/contractAccess.js';
import { publishContractSignedNotification } from './notificationsEngine/businessTransactionalNotifications.js';

const TERMS_VERSION = 'v2';

/**
 * Limite do ficheiro PNG decodificado (assinatura desenhada). Mantém `signature_data` enxuto na BD
 * e reduz picos de memória em preview/PDF. Ajuste em conjunto com o downscale no cliente.
 */
const MAX_SIGNATURE_PNG_BYTES = 520_000;
const MIN_SIGNATURE_PNG_BYTES = 400;

/** Valida PNG em base64 (sem ou com prefixo data URL). */
export function validateSignaturePngBase64(raw: string):
  | { ok: true; base64: string }
  | { ok: false; code: string } {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return { ok: false, code: 'SIGNATURE_DRAWING_REQUIRED' };
  const b64 = trimmed.startsWith('data:image/png;base64,')
    ? trimmed.slice('data:image/png;base64,'.length)
    : trimmed;
  if (b64.length < 80) return { ok: false, code: 'SIGNATURE_DRAWING_INVALID' };
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return { ok: false, code: 'SIGNATURE_DRAWING_INVALID' };
  }
  if (buf.length < MIN_SIGNATURE_PNG_BYTES) return { ok: false, code: 'SIGNATURE_DRAWING_TOO_SMALL' };
  if (buf.length > MAX_SIGNATURE_PNG_BYTES) return { ok: false, code: 'SIGNATURE_DRAWING_TOO_LARGE' };
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    return { ok: false, code: 'SIGNATURE_DRAWING_NOT_PNG' };
  }
  return { ok: true, base64: b64 };
}

function hashInviteToken(raw: string): string {
  return hashPublicViewToken(raw);
}

function generateRawInviteToken(): string {
  return generatePublicViewRawToken();
}

function resolveInviteExpiresAt(): string | null {
  const daysRaw = process.env.CONTRACT_SIGNATURE_INVITE_EXPIRY_DAYS;
  if (daysRaw == null || String(daysRaw).trim() === '') return null;
  const days = parseInt(String(daysRaw), 10);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export function normalizeSignerName(s: string): string {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim().slice(0, 80);
  }
  const rip = req.socket.remoteAddress;
  return rip && rip.length > 0 ? rip.slice(0, 80) : '0.0.0.0';
}

function getUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 512) : '';
}

export type SignatureInviteFullRow = {
  tenant_id: string;
  contract_id: string;
  signer_id: string;
  invite_id: string;
  contract_title: string;
  contract_number: string;
  contract_status: string;
  document_html: string | null;
  signer_name: string;
  signer_signed_at: string | null;
  invite_revoked: boolean;
  invite_expired: boolean;
  invite_consumed: boolean;
  tenant_name: string | null;
  tenant_logo_url: string | null;
  tenant_logo_light_url: string | null;
  tenant_logo_dark_url: string | null;
};

export async function loadSignatureInviteByTokenHash(hash: string): Promise<SignatureInviteFullRow | null> {
  const r = await pool.query<SignatureInviteFullRow>(
    `SELECT tenant_id, contract_id, signer_id, invite_id, contract_title, contract_number, contract_status,
            document_html, signer_name, signer_signed_at, invite_revoked, invite_expired, invite_consumed,
            tenant_name, tenant_logo_url, tenant_logo_light_url, tenant_logo_dark_url
     FROM get_signature_invite_full_by_token_hash($1)`,
    [hash]
  );
  return r.rows[0] ?? null;
}

export function computePublicSignatureGetState(row: SignatureInviteFullRow): {
  kind: 'invalid' | 'unavailable' | 'already_signed' | 'pending';
  reason?: string;
} {
  if (row.invite_revoked) return { kind: 'invalid', reason: 'revoked' };
  if (row.invite_expired) return { kind: 'invalid', reason: 'expired' };
  if (row.signer_signed_at || row.invite_consumed) {
    return { kind: 'already_signed' };
  }
  if (isDraftStatus(row.contract_status) || row.contract_status === 'CANCELLED') {
    return { kind: 'unavailable', reason: 'contract_status' };
  }
  /** ACTIVE: permite fechar assinatura se dados estiverem inconsistentes (signatário ainda pendente). */
  if (!['PENDING_SIGNATURE', 'PARTIALLY_SIGNED', 'ACTIVE'].includes(row.contract_status)) {
    return { kind: 'unavailable', reason: 'contract_status' };
  }
  const snap = row.document_html ?? '';
  if (!hasMeaningfulDocumentHtml(snap)) {
    return { kind: 'unavailable', reason: 'no_snapshot' };
  }
  return { kind: 'pending' };
}

function humanizeUnavailableReason(row: SignatureInviteFullRow, reason?: string): string {
  if (reason === 'no_snapshot') {
    return 'O texto do contrato não está disponível para assinatura (conteúdo em falta). Peça à empresa para reenviar o contrato para assinatura ou corrigir o documento.';
  }
  if (reason === 'contract_status') {
    return `Este contrato não aceita assinatura pública no estado atual (${row.contract_status}).`;
  }
  return 'Assinatura pública indisponível para este convite.';
}

export async function getPublicSignatureInvitePayload(rawToken: string): Promise<{
  httpStatus: number;
  body: Record<string, unknown>;
} | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  const hash = hashInviteToken(trimmed);
  const row = await loadSignatureInviteByTokenHash(hash);
  if (!row) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  const st = computePublicSignatureGetState(row);
  if (st.kind === 'invalid') {
    return { httpStatus: 404, body: { error: 'Convite inválido ou expirado.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  if (st.kind === 'unavailable') {
    return {
      httpStatus: 410,
      body: {
        error: humanizeUnavailableReason(row, st.reason),
        code: 'SIGNATURE_INVITE_UNAVAILABLE',
        reason: st.reason ?? 'unknown',
      },
    };
  }
  if (st.kind === 'already_signed') {
    return {
      httpStatus: 200,
      body: {
        kind: 'contract_public_signature',
        state: 'already_signed',
        title: row.contract_title,
        contract_number: row.contract_number,
        signer_name: row.signer_name,
        signed_at: row.signer_signed_at,
        tenant: {
          name: row.tenant_name,
          logo_url: row.tenant_logo_url,
          logo_light_url: row.tenant_logo_light_url,
          logo_dark_url: row.tenant_logo_dark_url,
        },
        message: 'A assinatura deste convite já foi concluída.',
      },
    };
  }
  return {
    httpStatus: 200,
    body: {
      kind: 'contract_public_signature',
      state: 'pending',
      title: row.contract_title,
      contract_number: row.contract_number,
      document_html: row.document_html,
      signer_name: row.signer_name,
      tenant: {
        name: row.tenant_name,
        logo_url: row.tenant_logo_url,
        logo_light_url: row.tenant_logo_light_url,
        logo_dark_url: row.tenant_logo_dark_url,
      },
      accept_terms_version: TERMS_VERSION,
      disclaimer:
        'Leia o documento, confirme o seu nome tal como registado e aceite os termos para assinar eletronicamente.',
    },
  };
}

export async function submitPublicSignature(params: {
  rawToken: string;
  acceptTerms: boolean;
  confirmedName: string;
  signatureImageBase64: string;
  req: Request;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  if (params.acceptTerms !== true) {
    return { httpStatus: 400, body: { error: 'É necessário aceitar os termos para assinar.', code: 'SIGNATURE_ACCEPT_REQUIRED' } };
  }
  const nameNorm = normalizeSignerName(params.confirmedName);
  if (nameNorm.length < 2) {
    return { httpStatus: 400, body: { error: 'Nome de confirmação inválido.', code: 'SIGNATURE_NAME_INVALID' } };
  }
  const sigCheck = validateSignaturePngBase64(params.signatureImageBase64);
  if (!sigCheck.ok) {
    const msg: Record<string, string> = {
      SIGNATURE_DRAWING_REQUIRED: 'Desenhe a sua assinatura no campo indicado.',
      SIGNATURE_DRAWING_INVALID: 'Assinatura desenhada inválida. Tente novamente.',
      SIGNATURE_DRAWING_TOO_SMALL: 'Assinatura demasiado simples ou vazia. Desenhe de novo.',
      SIGNATURE_DRAWING_TOO_LARGE: 'Assinatura demasiado grande. Limpe e desenhe de novo.',
      SIGNATURE_DRAWING_NOT_PNG: 'Formato de assinatura inválido.',
    };
    return {
      httpStatus: 400,
      body: { error: msg[sigCheck.code] ?? 'Assinatura inválida.', code: sigCheck.code },
    };
  }

  const trimmed = String(params.rawToken || '').trim();
  if (trimmed.length < 32) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  const hash = hashInviteToken(trimmed);
  const base = await loadSignatureInviteByTokenHash(hash);
  if (!base) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  const st = computePublicSignatureGetState(base);
  if (st.kind !== 'pending') {
    if (st.kind === 'already_signed') {
      return { httpStatus: 409, body: { error: 'Este convite já foi utilizado.', code: 'SIGNATURE_ALREADY_COMPLETED' } };
    }
    return {
      httpStatus: 410,
      body: {
        error: humanizeUnavailableReason(base, st.reason),
        code: 'SIGNATURE_INVITE_UNAVAILABLE',
        reason: st.reason ?? 'unknown',
      },
    };
  }
  if (normalizeSignerName(base.signer_name).toLowerCase() !== nameNorm.toLowerCase()) {
    return {
      httpStatus: 400,
      body: { error: 'O nome confirmado não coincide com o signatário deste convite.', code: 'SIGNATURE_NAME_MISMATCH' },
    };
  }

  const clientIp = getClientIp(params.req);
  const userAgent = getUserAgent(params.req);
  const signedAtIso = new Date().toISOString();

  const signaturePayload = {
    method: 'public_invite_esign_v1',
    invite_id: base.invite_id,
    confirmed_name: nameNorm,
    accepted_terms: true,
    accepted_terms_version: TERMS_VERSION,
    client_ip: clientIp,
    user_agent: userAgent,
    signed_at: signedAtIso,
    signature_image_png_base64: sigCheck.base64,
    signature_captured_at: signedAtIso,
  };

  const activation = { becameActive: false };
  try {
    await withTenantRlsContext(base.tenant_id, async () => {
      await pool.query('BEGIN');
      try {
        const lock = await pool.query<{ id: string }>(
          `SELECT id FROM contract_signer_signature_invites
           WHERE id = $1 AND token_hash = $2
           FOR UPDATE`,
          [base.invite_id, hash]
        );
        if (lock.rows.length === 0) {
          throw new Error('invite_lock_failed');
        }
        const inv = await pool.query<{ consumed_at: string | null; revoked_at: string | null }>(
          `SELECT consumed_at, revoked_at FROM contract_signer_signature_invites WHERE id = $1`,
          [base.invite_id]
        );
        const ir = inv.rows[0];
        if (!ir || ir.revoked_at || ir.consumed_at) {
          throw new Error('invite_no_longer_valid');
        }
        const sg = await pool.query<{ signed_at: string | null }>(
          `SELECT signed_at FROM contract_signers WHERE id = $1 FOR UPDATE`,
          [base.signer_id]
        );
        if (sg.rows[0]?.signed_at) {
          throw new Error('signer_already_signed');
        }

        await pool.query(
          `UPDATE contract_signers
           SET signed_at = now(),
               signature_data = $2::jsonb
           WHERE id = $1`,
          [base.signer_id, JSON.stringify(signaturePayload)]
        );

        await pool.query(
          `UPDATE contract_signer_signature_invites
           SET consumed_at = now(),
               signer_name_confirmed = $2,
               client_ip = $3,
               user_agent = $4,
               accepted_terms_version = $5
           WHERE id = $1`,
          [base.invite_id, nameNorm, clientIp, userAgent, TERMS_VERSION]
        );

        const cnt = await pool.query<{ total: number; signed: number; status: string }>(
          `SELECT
             (SELECT COUNT(*)::int FROM contract_signers WHERE contract_id = $1) AS total,
             (SELECT COUNT(*)::int FROM contract_signers WHERE contract_id = $1 AND signed_at IS NOT NULL) AS signed,
             (SELECT status::text FROM contracts WHERE id = $1) AS status`,
          [base.contract_id]
        );
        const { total, signed, status: curStatus } = cnt.rows[0]!;

        let nextStatus = curStatus;
        if (total > 0 && signed >= total) {
          nextStatus = 'ACTIVE';
        } else if (total > 0 && signed > 0 && signed < total) {
          nextStatus = 'PARTIALLY_SIGNED';
        }

        if (nextStatus !== curStatus && canTransitionStatus(curStatus, nextStatus)) {
          await pool.query(`UPDATE contracts SET status = $2::contract_status, updated_at = now() WHERE id = $1`, [
            base.contract_id,
            nextStatus,
          ]);
          if (nextStatus === 'ACTIVE') {
            activation.becameActive = true;
            const { applySignatureTenancyOnActivationInTx } = await import('./contractSnapshotMergeService.js');
            await applySignatureTenancyOnActivationInTx(pool, base.contract_id);
          }
        }

        await pool.query(
          `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
           VALUES ($1, 'PUBLIC_SIGNATURE_COMPLETED', $2, $3::jsonb, NULL)`,
          [
            base.contract_id,
            `Assinatura pública concluída por ${nameNorm}.`,
            JSON.stringify({
              signer_id: base.signer_id,
              invite_id: base.invite_id,
              client_ip: clientIp,
              user_agent: userAgent,
              contract_status_after: nextStatus,
              signature_image_stored: true,
            }),
          ]
        );

        await pool.query('COMMIT');
      } catch (e) {
        await pool.query('ROLLBACK');
        throw e;
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'invite_lock_failed' || msg === 'invite_no_longer_valid') {
      return { httpStatus: 409, body: { error: 'Convite inválido ou já utilizado.', code: 'SIGNATURE_CONFLICT' } };
    }
    if (msg === 'signer_already_signed') {
      return { httpStatus: 409, body: { error: 'Signatário já assinou.', code: 'SIGNATURE_ALREADY_COMPLETED' } };
    }
    console.error('submitPublicSignature:', err);
    return { httpStatus: 500, body: { error: 'Internal server error' } };
  }

  if (activation.becameActive) {
    publishContractSignedNotification({
      pool,
      tenantId: base.tenant_id,
      contractId: base.contract_id,
      preferredSenderUserId: null,
    });
  }

  return {
    httpStatus: 200,
    body: {
      ok: true,
      message: 'Assinatura registada com sucesso.',
      signer_name: nameNorm,
      signed_at: signedAtIso,
    },
  };
}

function contractAllowsSignatureInvite(status: string): boolean {
  return status === 'PENDING_SIGNATURE' || status === 'PARTIALLY_SIGNED';
}

async function loadContractSnapshotForInvite(contractId: string): Promise<{ status: string; snapshot: string | null } | null> {
  const r = await pool.query<{
    status: string;
    content_snapshot_html: string | null;
    content_html: string | null;
  }>(`SELECT status::text AS status, content_snapshot_html, content_html FROM contracts WHERE id = $1`, [contractId]);
  const row = r.rows[0];
  if (!row) return null;
  const snap =
    row.content_snapshot_html && String(row.content_snapshot_html).trim()
      ? row.content_snapshot_html
      : row.content_html ?? null;
  return { status: row.status, snapshot: snap };
}

export async function getSignatureInviteMetaForSigner(params: {
  contractId: string;
  signerId: string;
  requesterUserId: string;
}): Promise<{ has_active_invite: boolean; created_at: string | null; expires_at: string | null } | null> {
  const signer = await findSignerInTenant(params.signerId, params.requesterUserId);
  if (!signer || signer.contract_id !== params.contractId) return null;
  const r = await pool.query<{ created_at: string; expires_at: string | null }>(
    `SELECT created_at, expires_at FROM contract_signer_signature_invites
     WHERE contract_signer_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL
     LIMIT 1`,
    [params.signerId]
  );
  const row = r.rows[0];
  return {
    has_active_invite: !!row,
    created_at: row?.created_at ?? null,
    expires_at: row?.expires_at ?? null,
  };
}

export async function issueSignatureInvite(params: {
  contractId: string;
  signerId: string;
  requesterUserId: string;
  regenerate: boolean;
  createdByUserId: string;
}): Promise<
  | { ok: true; raw_token: string; frontend_path: string; created_at: string; expires_at: string | null }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_ELIGIBLE' | 'ALREADY_EXISTS' | 'CONFLICT'; created_at?: string }
> {
  const signer = await findSignerInTenant(params.signerId, params.requesterUserId);
  if (!signer || signer.contract_id !== params.contractId) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  const c = await loadContractSnapshotForInvite(params.contractId);
  if (!c || !contractAllowsSignatureInvite(c.status)) {
    return { ok: false, code: 'NOT_ELIGIBLE' };
  }
  if (!hasMeaningfulDocumentHtml(c.snapshot)) {
    return { ok: false, code: 'NOT_ELIGIBLE' };
  }
  const sg = await pool.query<{ signed_at: string | null }>(
    `SELECT signed_at FROM contract_signers WHERE id = $1`,
    [params.signerId]
  );
  if (sg.rows[0]?.signed_at) {
    return { ok: false, code: 'NOT_ELIGIBLE' };
  }

  const existing = await pool.query<{ created_at: string }>(
    `SELECT created_at FROM contract_signer_signature_invites
     WHERE contract_signer_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL
     LIMIT 1`,
    [params.signerId]
  );
  if (existing.rows[0] && !params.regenerate) {
    return { ok: false, code: 'ALREADY_EXISTS', created_at: existing.rows[0].created_at };
  }

  const tenantR = await pool.query<{ tenant_id: string }>(
    `SELECT u.tenant_id FROM contracts c INNER JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [params.contractId]
  );
  const tenantId = tenantR.rows[0]?.tenant_id;
  if (!tenantId) return { ok: false, code: 'NOT_FOUND' };

  const raw = generateRawInviteToken();
  const tokenHash = hashInviteToken(raw);
  const expiresAt = resolveInviteExpiresAt();

  let createdAt = '';
  let insertConflict = false;
  await withTenantRlsContext(tenantId, async () => {
    await pool.query('BEGIN');
    try {
      await pool.query(
        `UPDATE contract_signer_signature_invites SET revoked_at = now()
         WHERE contract_signer_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL`,
        [params.signerId]
      );
      const ins = await pool.query<{ created_at: string }>(
        `INSERT INTO contract_signer_signature_invites (contract_signer_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING created_at`,
        [params.signerId, tokenHash, expiresAt]
      );
      createdAt = ins.rows[0]!.created_at;
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
         VALUES ($1, 'SIGNATURE_INVITE_ISSUED', $2, $3::jsonb, $4)`,
        [
          params.contractId,
          params.regenerate
            ? 'Convite de assinatura pública regenerado para o signatário.'
            : 'Convite de assinatura pública emitido para o signatário.',
          JSON.stringify({
            signer_id: params.signerId,
            regenerate: params.regenerate,
            action: params.regenerate ? 'REGENERATE' : 'ISSUE',
          }),
          params.createdByUserId,
        ]
      );
      await pool.query('COMMIT');
    } catch (e: unknown) {
      await pool.query('ROLLBACK');
      const err = e as { code?: string };
      if (err?.code === '23505') {
        insertConflict = true;
      } else {
        throw e;
      }
    }
  });

  if (insertConflict) {
    return { ok: false, code: 'CONFLICT' };
  }

  return {
    ok: true,
    raw_token: raw,
    frontend_path: `/contract-sign/${raw}`,
    created_at: createdAt,
    expires_at: expiresAt,
  };
}

export async function revokeSignatureInvite(params: {
  contractId: string;
  signerId: string;
  requesterUserId: string;
  createdByUserId: string;
}): Promise<boolean> {
  const signer = await findSignerInTenant(params.signerId, params.requesterUserId);
  if (!signer || signer.contract_id !== params.contractId) return false;

  const tenantR = await pool.query<{ tenant_id: string }>(
    `SELECT u.tenant_id FROM contracts c INNER JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [params.contractId]
  );
  const tenantId = tenantR.rows[0]?.tenant_id;
  if (!tenantId) return false;

  await withTenantRlsContext(tenantId, async () => {
    const u = await pool.query(
      `UPDATE contract_signer_signature_invites SET revoked_at = now()
       WHERE contract_signer_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL`,
      [params.signerId]
    );
    if ((u.rowCount ?? 0) > 0) {
      await pool.query(
        `INSERT INTO contract_events (contract_id, event_type, description, metadata, created_by)
         VALUES ($1, 'SIGNATURE_INVITE_REVOKED', $2, $3::jsonb, $4)`,
        [
          params.contractId,
          'Convite de assinatura pública revogado.',
          JSON.stringify({ signer_id: params.signerId, action: 'REVOKE' }),
          params.createdByUserId,
        ]
      );
    }
  });
  return true;
}
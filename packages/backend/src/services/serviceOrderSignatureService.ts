/**
 * OS-S4 — Envio para assinatura, tokens públicos, convites e submissão.
 */
import type { Request } from 'express';
import { pool, withTenantRlsContext } from '../utils/db.js';
import {
  ServiceOrderDomainError,
  getServiceOrderById,
  insertServiceOrderEvent,
  type ServiceOrderRow,
} from './serviceOrdersService.js';
import {
  buildServiceOrderDocumentHtml,
  loadServiceOrderDocumentModel,
  stripServiceOrderBrandNameWhenLogoPresent,
} from './serviceOrderDocumentModel.js';
import {
  buildServiceOrderPdfBuffer,
  persistServiceOrderDocumentHtml,
  resolveTenantLogoAssets,
} from './serviceOrderPdfService.js';
import {
  decryptServiceOrderTokenFromStorage,
  encryptServiceOrderTokenForStorage,
  generateServiceOrderRawToken,
  hashServiceOrderPublicToken,
  resolveServiceOrderInviteExpiresAt,
  resolveServiceOrderViewExpiresAt,
} from './serviceOrderTokenCrypto.js';
import { validateSignaturePngBase64 } from './contractSignatureInviteService.js';
import {
  publishServiceOrderSentNotifications,
  publishServiceOrderSharedNotifications,
  publishServiceOrderSignedNotification,
} from './notificationsEngine/serviceOrderTransactionalNotifications.js';

const TERMS_VERSION = 'v1';

export type ServiceOrderSignerRole = 'client' | 'technician';

export type ServiceOrderSignerRow = {
  id: string;
  tenant_id: string;
  service_order_id: string;
  role: ServiceOrderSignerRole;
  name: string;
  email: string | null;
  tax_id: string | null;
  whatsapp_phone: string | null;
  signing_order: number;
  signed_at: string | null;
  signature_data: Record<string, unknown> | null;
  created_at: string;
};

/** Inclui `signed` para permitir criar/reemitir convite do técnico após o cliente assinar. */
const SENDABLE = new Set(['draft', 'scheduled', 'in_progress', 'sent', 'awaiting_signature', 'signed']);

/** Statuses em que "Enviar OS" (link de visualização) muda para `sent`. */
const SHAREABLE = new Set(['draft', 'scheduled', 'in_progress', 'sent']);

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

export function normalizeServiceOrderSignerName(s: string): string {
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

export async function listServiceOrderSigners(
  tenantId: string,
  serviceOrderId: string,
): Promise<ServiceOrderSignerRow[]> {
  const r = await pool.query<ServiceOrderSignerRow>(
    `SELECT * FROM public.service_order_signers
     WHERE tenant_id = $1 AND service_order_id = $2
     ORDER BY signing_order ASC, created_at ASC`,
    [tenantId, serviceOrderId],
  );
  return r.rows;
}

export async function getActivePublicViewTokenMeta(
  tenantId: string,
  serviceOrderId: string,
): Promise<{
  has_active: boolean;
  created_at: string | null;
  expires_at: string | null;
  raw_token: string | null;
  frontend_path: string | null;
}> {
  const r = await pool.query<{
    created_at: string;
    expires_at: string | null;
    token_ciphertext: string | null;
  }>(
    `SELECT created_at, expires_at, token_ciphertext
     FROM public.service_order_public_view_tokens
     WHERE tenant_id = $1 AND service_order_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [tenantId, serviceOrderId],
  );
  const row = r.rows[0];
  if (!row) {
    return { has_active: false, created_at: null, expires_at: null, raw_token: null, frontend_path: null };
  }
  const raw = decryptServiceOrderTokenFromStorage(row.token_ciphertext);
  return {
    has_active: true,
    created_at: row.created_at,
    expires_at: row.expires_at,
    raw_token: raw,
    frontend_path: raw ? `/service-order-view/${raw}` : null,
  };
}

async function withLogoResolvedModel(
  tenantId: string,
  serviceOrderId: string,
): Promise<Awaited<ReturnType<typeof loadServiceOrderDocumentModel>>> {
  const model = await loadServiceOrderDocumentModel(tenantId, serviceOrderId);
  if (!model) return null;
  const logo = await resolveTenantLogoAssets(model.tenant.logo_url);
  return {
    ...model,
    tenant: { ...model.tenant, logo_url: logo.htmlSrc },
  };
}

async function freezeDocument(tenantId: string, serviceOrderId: string): Promise<string> {
  const model = await withLogoResolvedModel(tenantId, serviceOrderId);
  if (!model) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  const html = buildServiceOrderDocumentHtml(model);
  await persistServiceOrderDocumentHtml({
    tenantId,
    serviceOrderId,
    html,
    freeze: true,
  });
  await pool.query(
    `UPDATE public.service_orders
     SET content_html = $3,
         content_snapshot_html = COALESCE(content_snapshot_html, $3),
         document_frozen_at = COALESCE(document_frozen_at, now()),
         updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [serviceOrderId, tenantId, html],
  );
  return html;
}

async function refreshSnapshotWithSignatures(tenantId: string, serviceOrderId: string): Promise<void> {
  const model = await withLogoResolvedModel(tenantId, serviceOrderId);
  if (!model) return;
  const signers = await listServiceOrderSigners(tenantId, serviceOrderId);
  const html = buildServiceOrderDocumentHtml(model, { signers });
  await pool.query(
    `UPDATE public.service_orders
     SET content_html = $3,
         content_snapshot_html = $3,
         updated_at = now()
     WHERE id = $1 AND tenant_id = $2`,
    [serviceOrderId, tenantId, html],
  );
}

async function upsertClientAndTechnicianSigners(params: {
  tenantId: string;
  order: ServiceOrderRow;
  includeTechnician: boolean;
}): Promise<ServiceOrderSignerRow[]> {
  const snap = (params.order.client_snapshot ?? {}) as Record<string, unknown>;
  const clientName = normalizeServiceOrderSignerName(str(snap.name) || str(params.order.client_name));
  if (clientName.length < 2) {
    throw new ServiceOrderDomainError(
      'Informe o cliente (nome) antes de enviar para assinatura.',
      400,
      'client_required',
    );
  }
  const clientEmail = str(snap.email) || null;
  const clientPhone = str(snap.phone) || str(snap.whatsapp) || null;
  const clientTax = str(snap.document) || str(snap.cpf_cnpj) || null;

  const existingClient = await pool.query<{ id: string; signed_at: string | null }>(
    `SELECT id, signed_at FROM public.service_order_signers
     WHERE service_order_id = $1 AND role = 'client'
     LIMIT 1`,
    [params.order.id],
  );
  if (!existingClient.rows[0]) {
    await pool.query(
      `INSERT INTO public.service_order_signers (
         tenant_id, service_order_id, role, name, email, tax_id, whatsapp_phone, signing_order
       ) VALUES ($1, $2, 'client', $3, $4, $5, $6, 1)`,
      [params.tenantId, params.order.id, clientName, clientEmail, clientTax, clientPhone],
    );
  } else if (!existingClient.rows[0].signed_at) {
    await pool.query(
      `UPDATE public.service_order_signers
       SET name = $2,
           email = COALESCE($3, email),
           tax_id = COALESCE($4, tax_id),
           whatsapp_phone = COALESCE($5, whatsapp_phone)
       WHERE id = $1`,
      [existingClient.rows[0].id, clientName, clientEmail, clientTax, clientPhone],
    );
  }

  // Técnico: responsável da OS, senão o criador (sem responsável o convite do técnico nunca existia).
  if (params.includeTechnician) {
    const techUserId = params.order.responsible_user_id || params.order.created_by;
    if (techUserId) {
      const u = await pool.query<{
        full_name: string | null;
        email: string | null;
      }>(
        `SELECT TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) AS full_name,
                u.email
         FROM public.users u
         LEFT JOIN public.profiles p ON p.id = u.id
         WHERE u.id = $1 AND u.tenant_id = $2
         LIMIT 1`,
        [techUserId, params.tenantId],
      );
      const tech = u.rows[0];
      const techName = normalizeServiceOrderSignerName(
        (tech?.full_name || '').trim() || tech?.email || 'Técnico',
      );
      if (techName.length >= 2) {
        const existingTech = await pool.query<{ id: string; signed_at: string | null }>(
          `SELECT id, signed_at FROM public.service_order_signers
           WHERE service_order_id = $1 AND role = 'technician'
           LIMIT 1`,
          [params.order.id],
        );
        if (!existingTech.rows[0]) {
          await pool.query(
            `INSERT INTO public.service_order_signers (
               tenant_id, service_order_id, role, name, email, signing_order
             ) VALUES ($1, $2, 'technician', $3, $4, 2)`,
            [params.tenantId, params.order.id, techName, tech?.email ?? null],
          );
        } else if (!existingTech.rows[0].signed_at) {
          await pool.query(
            `UPDATE public.service_order_signers
             SET name = $2, email = COALESCE($3, email)
             WHERE id = $1`,
            [existingTech.rows[0].id, techName, tech?.email ?? null],
          );
        }
      }
    }
  }

  return listServiceOrderSigners(params.tenantId, params.order.id);
}

async function issueViewToken(params: {
  tenantId: string;
  serviceOrderId: string;
  regenerate: boolean;
}): Promise<{ raw_token: string; frontend_path: string; expires_at: string | null }> {
  const existing = await pool.query<{ id: string; token_ciphertext: string | null; expires_at: string | null }>(
    `SELECT id, token_ciphertext, expires_at FROM public.service_order_public_view_tokens
     WHERE tenant_id = $1 AND service_order_id = $2 AND revoked_at IS NULL
     LIMIT 1`,
    [params.tenantId, params.serviceOrderId],
  );
  if (existing.rows[0] && !params.regenerate) {
    const raw = decryptServiceOrderTokenFromStorage(existing.rows[0].token_ciphertext);
    if (raw) {
      return {
        raw_token: raw,
        frontend_path: `/service-order-view/${raw}`,
        expires_at: existing.rows[0].expires_at,
      };
    }
  }

  const raw = generateServiceOrderRawToken();
  const hash = hashServiceOrderPublicToken(raw);
  const cipher = encryptServiceOrderTokenForStorage(raw);
  const expiresAt = resolveServiceOrderViewExpiresAt();

  await pool.query(
    `UPDATE public.service_order_public_view_tokens
     SET revoked_at = now()
     WHERE tenant_id = $1 AND service_order_id = $2 AND revoked_at IS NULL`,
    [params.tenantId, params.serviceOrderId],
  );
  await pool.query(
    `INSERT INTO public.service_order_public_view_tokens
       (tenant_id, service_order_id, token_hash, token_ciphertext, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.tenantId, params.serviceOrderId, hash, cipher, expiresAt],
  );

  return { raw_token: raw, frontend_path: `/service-order-view/${raw}`, expires_at: expiresAt };
}

async function issueInviteForSigner(params: {
  tenantId: string;
  signerId: string;
  regenerate: boolean;
}): Promise<
  | { ok: true; raw_token: string; frontend_path: string; expires_at: string | null }
  | { ok: false; code: 'ALREADY_EXISTS' | 'ALREADY_SIGNED' | 'NOT_FOUND' }
> {
  const sg = await pool.query<{ signed_at: string | null }>(
    `SELECT signed_at FROM public.service_order_signers WHERE id = $1 AND tenant_id = $2`,
    [params.signerId, params.tenantId],
  );
  if (!sg.rows[0]) return { ok: false, code: 'NOT_FOUND' };
  if (sg.rows[0].signed_at) return { ok: false, code: 'ALREADY_SIGNED' };

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.service_order_signer_signature_invites
     WHERE service_order_signer_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL
     LIMIT 1`,
    [params.signerId],
  );
  if (existing.rows[0] && !params.regenerate) {
    return { ok: false, code: 'ALREADY_EXISTS' };
  }

  const raw = generateServiceOrderRawToken();
  const hash = hashServiceOrderPublicToken(raw);
  const expiresAt = resolveServiceOrderInviteExpiresAt();

  await pool.query(
    `UPDATE public.service_order_signer_signature_invites
     SET revoked_at = now()
     WHERE service_order_signer_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL`,
    [params.signerId],
  );
  await pool.query(
    `INSERT INTO public.service_order_signer_signature_invites
       (tenant_id, service_order_signer_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [params.tenantId, params.signerId, hash, expiresAt],
  );

  return {
    ok: true,
    raw_token: raw,
    frontend_path: `/service-order-sign/${raw}`,
    expires_at: expiresAt,
  };
}

export type SendForSignatureInviteItem = {
  signer_id: string;
  role: string;
  name: string;
  token?: string;
  frontend_path?: string;
  expires_at?: string | null;
  already_active?: boolean;
  already_signed?: boolean;
};

export type SendForSignatureResult = {
  order: NonNullable<Awaited<ReturnType<typeof getServiceOrderById>>>;
  view: { token: string; frontend_path: string; expires_at: string | null };
  invites: SendForSignatureInviteItem[];
};

export async function sendServiceOrderForSignature(params: {
  tenantId: string;
  userId: string;
  serviceOrderId: string;
  includeTechnician?: boolean;
  regenerate?: boolean;
}): Promise<SendForSignatureResult> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  if (!SENDABLE.has(order.status)) {
    throw new ServiceOrderDomainError(
      'Status atual não permite envio para assinatura.',
      409,
      'invalid_status',
    );
  }

  const regenerate = params.regenerate === true;
  let view: SendForSignatureResult['view'] = {
    token: '',
    frontend_path: '',
    expires_at: null,
  };
  let invites: SendForSignatureInviteItem[] = [];

  await withTenantRlsContext(params.tenantId, async () => {
    await freezeDocument(params.tenantId, params.serviceOrderId);

    const signers = await upsertClientAndTechnicianSigners({
      tenantId: params.tenantId,
      order,
      includeTechnician: params.includeTechnician !== false,
    });

    const issuedView = await issueViewToken({
      tenantId: params.tenantId,
      serviceOrderId: params.serviceOrderId,
      regenerate,
    });
    view = {
      token: issuedView.raw_token,
      frontend_path: issuedView.frontend_path,
      expires_at: issuedView.expires_at,
    };

    invites = [];
    for (const signer of signers) {
      const issued = await issueInviteForSigner({
        tenantId: params.tenantId,
        signerId: signer.id,
        regenerate,
      });
      if (issued.ok) {
        invites.push({
          signer_id: signer.id,
          role: signer.role,
          name: signer.name,
          token: issued.raw_token,
          frontend_path: issued.frontend_path,
          expires_at: issued.expires_at,
        });
      } else if (issued.code === 'ALREADY_EXISTS') {
        invites.push({
          signer_id: signer.id,
          role: signer.role,
          name: signer.name,
          already_active: true,
        });
      } else if (issued.code === 'ALREADY_SIGNED') {
        invites.push({
          signer_id: signer.id,
          role: signer.role,
          name: signer.name,
          already_signed: true,
        });
      }
    }

    // Não reabrir OS já assinada (só completa convites do técnico).
    if (order.status !== 'awaiting_signature' && order.status !== 'signed') {
      await pool.query(
        `UPDATE public.service_orders
         SET status = 'awaiting_signature', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [params.serviceOrderId, params.tenantId],
      );
    }

    const client = await pool.connect();
    try {
      await insertServiceOrderEvent(client, {
        tenantId: params.tenantId,
        serviceOrderId: params.serviceOrderId,
        eventType: 'sent_for_signature',
        payload: {
          regenerate,
          invite_count: invites.filter((i) => i.token).length,
        },
        createdBy: params.userId,
      });
    } finally {
      client.release();
    }
  });

  const full = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!full) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }

  publishServiceOrderSentNotifications({
    pool,
    tenantId: params.tenantId,
    serviceOrderId: params.serviceOrderId,
    actorUserId: params.userId,
    viewPath: view.frontend_path,
    invites: invites
      .filter((i): i is SendForSignatureInviteItem & { token: string; frontend_path: string } =>
        Boolean(i.token && i.frontend_path),
      )
      .map((i) => ({
        signer_id: i.signer_id,
        token: i.token,
        frontend_path: i.frontend_path,
      })),
  });

  return { order: full, view, invites };
}

export type SendServiceOrderToClientResult = {
  order: NonNullable<Awaited<ReturnType<typeof getServiceOrderById>>>;
  view: { token: string; frontend_path: string; expires_at: string | null };
};

/** Emite link público de visualização, notifica o cliente e define status `sent`. */
export async function sendServiceOrderToClient(params: {
  tenantId: string;
  userId: string;
  serviceOrderId: string;
  regenerate?: boolean;
}): Promise<SendServiceOrderToClientResult> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  if (!SHAREABLE.has(order.status)) {
    throw new ServiceOrderDomainError(
      'Status atual não permite envio da OS ao cliente.',
      409,
      'invalid_status',
    );
  }

  const regenerate = params.regenerate === true || order.status === 'sent';
  let view: SendServiceOrderToClientResult['view'] = {
    token: '',
    frontend_path: '',
    expires_at: null,
  };

  await withTenantRlsContext(params.tenantId, async () => {
    await freezeDocument(params.tenantId, params.serviceOrderId);

    const issuedView = await issueViewToken({
      tenantId: params.tenantId,
      serviceOrderId: params.serviceOrderId,
      regenerate,
    });
    view = {
      token: issuedView.raw_token,
      frontend_path: issuedView.frontend_path,
      expires_at: issuedView.expires_at,
    };

    if (order.status !== 'sent') {
      await pool.query(
        `UPDATE public.service_orders
         SET status = 'sent', updated_at = now()
         WHERE id = $1 AND tenant_id = $2`,
        [params.serviceOrderId, params.tenantId],
      );
    }

    const client = await pool.connect();
    try {
      await insertServiceOrderEvent(client, {
        tenantId: params.tenantId,
        serviceOrderId: params.serviceOrderId,
        eventType: 'sent_to_client',
        payload: { regenerate, view_path: view.frontend_path },
        createdBy: params.userId,
      });
    } finally {
      client.release();
    }
  });

  const full = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!full) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }

  publishServiceOrderSharedNotifications({
    pool,
    tenantId: params.tenantId,
    serviceOrderId: params.serviceOrderId,
    actorUserId: params.userId,
    viewPath: view.frontend_path,
  });

  return { order: full, view };
}

export async function revokeServiceOrderPublicLinks(params: {
  tenantId: string;
  userId: string;
  serviceOrderId: string;
}): Promise<void> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  if (order.status !== 'awaiting_signature') {
    throw new ServiceOrderDomainError(
      'Só é possível revogar links enquanto aguarda assinatura.',
      409,
      'invalid_status',
    );
  }

  await withTenantRlsContext(params.tenantId, async () => {
    await pool.query(
      `UPDATE public.service_order_public_view_tokens
       SET revoked_at = now()
       WHERE tenant_id = $1 AND service_order_id = $2 AND revoked_at IS NULL`,
      [params.tenantId, params.serviceOrderId],
    );
    await pool.query(
      `UPDATE public.service_order_signer_signature_invites i
       SET revoked_at = now()
       FROM public.service_order_signers s
       WHERE i.service_order_signer_id = s.id
         AND s.service_order_id = $1
         AND s.tenant_id = $2
         AND i.revoked_at IS NULL
         AND i.consumed_at IS NULL`,
      [params.serviceOrderId, params.tenantId],
    );
    const client = await pool.connect();
    try {
      await insertServiceOrderEvent(client, {
        tenantId: params.tenantId,
        serviceOrderId: params.serviceOrderId,
        eventType: 'signature_links_revoked',
        payload: {},
        createdBy: params.userId,
      });
    } finally {
      client.release();
    }
  });
}

/** Atualiza o nome do técnico responsável (antes de assinar). */
export async function updateServiceOrderSignerName(params: {
  tenantId: string;
  serviceOrderId: string;
  signerId: string;
  name: string;
}): Promise<{ id: string; name: string; role: string }> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  const nameNorm = normalizeServiceOrderSignerName(params.name);
  if (nameNorm.length < 2) {
    throw new ServiceOrderDomainError('Informe um nome válido (mín. 2 caracteres).', 400, 'invalid_name');
  }

  const signer = await pool.query<{
    id: string;
    role: string;
    signed_at: string | null;
    name: string;
  }>(
    `SELECT id, role, signed_at, name FROM public.service_order_signers
     WHERE id = $1 AND service_order_id = $2 AND tenant_id = $3`,
    [params.signerId, params.serviceOrderId, params.tenantId],
  );
  const row = signer.rows[0];
  if (!row) {
    throw new ServiceOrderDomainError('Signatário não encontrado.', 404, 'not_found');
  }
  if (row.role !== 'technician') {
    throw new ServiceOrderDomainError(
      'Só é possível editar o nome do técnico por este fluxo.',
      400,
      'invalid_role',
    );
  }
  if (row.signed_at) {
    throw new ServiceOrderDomainError(
      'Não é possível alterar o nome após a assinatura.',
      409,
      'already_signed',
    );
  }

  await pool.query(
    `UPDATE public.service_order_signers
     SET name = $2
     WHERE id = $1`,
    [row.id, nameNorm],
  );

  return { id: row.id, name: nameNorm, role: row.role };
}

export async function reissueSignerInvite(params: {
  tenantId: string;
  userId: string;
  serviceOrderId: string;
  signerId: string;
}): Promise<{ token: string; frontend_path: string; expires_at: string | null }> {
  const order = await getServiceOrderById(params.tenantId, params.serviceOrderId);
  if (!order) {
    throw new ServiceOrderDomainError('Ordem de serviço não encontrada.', 404, 'not_found');
  }
  const signer = await pool.query<{ id: string; role: string; signed_at: string | null }>(
    `SELECT id, role, signed_at FROM public.service_order_signers
     WHERE id = $1 AND service_order_id = $2 AND tenant_id = $3`,
    [params.signerId, params.serviceOrderId, params.tenantId],
  );
  if (!signer.rows[0]) {
    throw new ServiceOrderDomainError('Signatário não encontrado.', 404, 'not_found');
  }
  const role = signer.rows[0].role;
  const statusOk =
    order.status === 'awaiting_signature' ||
    (role === 'technician' &&
      !signer.rows[0].signed_at &&
      (order.status === 'signed' || order.status === 'invoiced' || order.status === 'completed'));
  if (!statusOk) {
    throw new ServiceOrderDomainError('OS não está aguardando assinatura.', 409, 'invalid_status');
  }

  let out: { token: string; frontend_path: string; expires_at: string | null } | null = null;
  await withTenantRlsContext(params.tenantId, async () => {
    const issued = await issueInviteForSigner({
      tenantId: params.tenantId,
      signerId: params.signerId,
      regenerate: true,
    });
    if (!issued.ok) {
      throw new ServiceOrderDomainError(
        issued.code === 'ALREADY_SIGNED'
          ? 'Signatário já assinou.'
          : 'Não foi possível reemitir o convite.',
        409,
        issued.code.toLowerCase(),
      );
    }
    out = {
      token: issued.raw_token,
      frontend_path: issued.frontend_path,
      expires_at: issued.expires_at,
    };
  });
  if (!out) {
    throw new ServiceOrderDomainError('Falha ao reemitir convite.', 500, 'issue_failed');
  }
  return out;
}

/* ---------- Público ---------- */

type InviteLookupRow = {
  tenant_id: string;
  service_order_id: string;
  signer_id: string;
  invite_id: string;
  service_order_number: number;
  status: string;
  content_snapshot_html: string | null;
  content_html: string | null;
  signer_name: string;
  signer_role: string;
  signer_signed_at: string | null;
  invite_revoked: boolean;
  invite_expired: boolean;
  invite_consumed: boolean;
  tenant_name: string | null;
  tenant_logo_url: string | null;
  tenant_logo_light_url: string | null;
  tenant_logo_dark_url: string | null;
};

export async function loadServiceOrderInviteByTokenHash(
  hash: string,
): Promise<InviteLookupRow | null> {
  const r = await pool.query<InviteLookupRow>(
    `SELECT * FROM get_service_order_signature_invite_by_token_hash($1)`,
    [hash],
  );
  return r.rows[0] ?? null;
}

export async function getPublicServiceOrderViewPayload(rawToken: string): Promise<{
  httpStatus: number;
  body: Record<string, unknown>;
} | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) {
    return { httpStatus: 404, body: { error: 'Link inválido.', code: 'VIEW_TOKEN_NOT_FOUND' } };
  }
  const hash = hashServiceOrderPublicToken(trimmed);
  const r = await pool.query<{
    tenant_id: string;
    service_order_id: string;
    service_order_number: number;
    status: string;
    content_snapshot_html: string | null;
    content_html: string | null;
    client_name: string | null;
    tenant_name: string | null;
    tenant_logo_url: string | null;
    tenant_logo_light_url: string | null;
    tenant_logo_dark_url: string | null;
    token_revoked: boolean;
    token_expired: boolean;
  }>(`SELECT * FROM get_service_order_public_view_by_token_hash($1)`, [hash]);
  const row = r.rows[0];
  if (!row || row.token_revoked || row.token_expired) {
    return { httpStatus: 404, body: { error: 'Link inválido ou expirado.', code: 'VIEW_TOKEN_NOT_FOUND' } };
  }
  if (row.status === 'cancelled' || row.status === 'draft') {
    return {
      httpStatus: 410,
      body: { error: 'Documento indisponível.', code: 'VIEW_UNAVAILABLE' },
    };
  }

  const signers = await pool.query<{
    id: string;
    name: string;
    email: string | null;
    tax_id: string | null;
    role: string;
    signed_at: string | null;
    signature_data: Record<string, unknown> | null;
  }>(
    `SELECT id, name, email, tax_id, role, signed_at, signature_data
     FROM public.service_order_signers
     WHERE service_order_id = $1
     ORDER BY signing_order, created_at`,
    [row.service_order_id],
  );

  const html = stripServiceOrderBrandNameWhenLogoPresent(
    (row.content_snapshot_html && row.content_snapshot_html.trim()) ||
      (row.content_html && row.content_html.trim()) ||
      '',
  );

  return {
    httpStatus: 200,
    body: {
      kind: 'service_order_public_view',
      title: `Ordem de Serviço Nº ${row.service_order_number}`,
      status: row.status,
      status_label: row.status,
      service_order_number: row.service_order_number,
      document_html: html,
      client_name: row.client_name,
      tenant: {
        name: row.tenant_name,
        logo_url: row.tenant_logo_url,
        logo_light_url: row.tenant_logo_light_url,
        logo_dark_url: row.tenant_logo_dark_url,
      },
      signers: signers.rows.map((s) => {
        const sd = s.signature_data || {};
        return {
          id: s.id,
          name: s.name,
          email: s.email,
          tax_id: s.tax_id,
          role: s.role,
          signed: Boolean(s.signed_at),
          signed_at: s.signed_at,
          signature_image_png_base64:
            typeof sd.signature_image_png_base64 === 'string' ? sd.signature_image_png_base64 : null,
          confirmed_name: typeof sd.confirmed_name === 'string' ? sd.confirmed_name : null,
        };
      }),
      disclaimer: 'Documento somente leitura. Use o link de assinatura enviado pela empresa para assinar.',
    },
  };
}

export async function getPublicServiceOrderViewPdfBuffer(rawToken: string): Promise<Buffer | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) return null;
  const hash = hashServiceOrderPublicToken(trimmed);
  const r = await pool.query<{
    tenant_id: string;
    service_order_id: string;
    token_revoked: boolean;
    token_expired: boolean;
    status: string;
  }>(`SELECT * FROM get_service_order_public_view_by_token_hash($1)`, [hash]);
  const row = r.rows[0];
  if (!row || row.token_revoked || row.token_expired) return null;
  if (row.status === 'cancelled' || row.status === 'draft') return null;
  const built = await buildServiceOrderPdfBuffer({
    tenantId: row.tenant_id,
    serviceOrderId: row.service_order_id,
    freeze: false,
  });
  return built?.buffer ?? null;
}

export async function getPublicServiceOrderSignaturePayload(rawToken: string): Promise<{
  httpStatus: number;
  body: Record<string, unknown>;
} | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  const hash = hashServiceOrderPublicToken(trimmed);
  const row = await loadServiceOrderInviteByTokenHash(hash);
  if (!row) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  if (row.invite_revoked || row.invite_expired) {
    return { httpStatus: 404, body: { error: 'Convite inválido ou expirado.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  if (row.signer_signed_at || row.invite_consumed) {
    const sd = await pool.query<{
      email: string | null;
      tax_id: string | null;
      signed_at: string | null;
      signature_data: Record<string, unknown> | null;
    }>(`SELECT email, tax_id, signed_at, signature_data FROM public.service_order_signers WHERE id = $1`, [
      row.signer_id,
    ]);
    return {
      httpStatus: 200,
      body: {
        kind: 'service_order_public_signature',
        state: 'already_signed',
        title: `Ordem de Serviço Nº ${row.service_order_number}`,
        service_order_number: row.service_order_number,
        signer_name: row.signer_name,
        signer_role: row.signer_role,
        signer_email: sd.rows[0]?.email ?? null,
        signer_tax_id: sd.rows[0]?.tax_id ?? null,
        signed_at: sd.rows[0]?.signed_at ?? row.signer_signed_at,
        signature_data: sd.rows[0]?.signature_data ?? null,
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
  // Técnico pode assinar após o cliente (signed/invoiced/completed); cliente só em awaiting_signature.
  const canSignStatus =
    row.status === 'awaiting_signature' ||
    (row.signer_role === 'technician' &&
      (row.status === 'signed' || row.status === 'invoiced' || row.status === 'completed'));
  if (!canSignStatus) {
    return {
      httpStatus: 410,
      body: {
        error: 'Esta ordem de serviço não aceita assinatura no estado atual.',
        code: 'SIGNATURE_INVITE_UNAVAILABLE',
      },
    };
  }
  const html = stripServiceOrderBrandNameWhenLogoPresent(
    (row.content_snapshot_html && row.content_snapshot_html.trim()) ||
      (row.content_html && row.content_html.trim()) ||
      '',
  );

  return {
    httpStatus: 200,
    body: {
      kind: 'service_order_public_signature',
      state: 'pending',
      title: `Ordem de Serviço Nº ${row.service_order_number}`,
      service_order_number: row.service_order_number,
      document_html: html,
      signer_name: row.signer_name,
      signer_role: row.signer_role,
      tenant: {
        name: row.tenant_name,
        logo_url: row.tenant_logo_url,
        logo_light_url: row.tenant_logo_light_url,
        logo_dark_url: row.tenant_logo_dark_url,
      },
      accept_terms_version: TERMS_VERSION,
      disclaimer:
        'Leia o documento, confirme o seu nome e aceite os termos para assinar eletronicamente a ordem de serviço.',
    },
  };
}

export async function getPublicServiceOrderSignPdfBuffer(rawToken: string): Promise<Buffer | null> {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.length < 32) return null;
  const hash = hashServiceOrderPublicToken(trimmed);
  const row = await loadServiceOrderInviteByTokenHash(hash);
  if (!row || row.invite_revoked || row.invite_expired) return null;
  const built = await buildServiceOrderPdfBuffer({
    tenantId: row.tenant_id,
    serviceOrderId: row.service_order_id,
    freeze: false,
  });
  return built?.buffer ?? null;
}

export async function submitPublicServiceOrderSignature(params: {
  rawToken: string;
  acceptTerms: boolean;
  confirmedName: string;
  signatureImageBase64: string;
  req: Request;
}): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  if (params.acceptTerms !== true) {
    return {
      httpStatus: 400,
      body: { error: 'É necessário aceitar os termos para assinar.', code: 'SIGNATURE_ACCEPT_REQUIRED' },
    };
  }
  const nameNorm = normalizeServiceOrderSignerName(params.confirmedName);
  if (nameNorm.length < 2) {
    return {
      httpStatus: 400,
      body: { error: 'Nome de confirmação inválido.', code: 'SIGNATURE_NAME_INVALID' },
    };
  }
  const sigCheck = validateSignaturePngBase64(params.signatureImageBase64);
  if (!sigCheck.ok) {
    return {
      httpStatus: 400,
      body: { error: 'Assinatura desenhada inválida.', code: sigCheck.code },
    };
  }

  const trimmed = String(params.rawToken || '').trim();
  if (trimmed.length < 32) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  const hash = hashServiceOrderPublicToken(trimmed);
  const base = await loadServiceOrderInviteByTokenHash(hash);
  if (!base) {
    return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  if (base.invite_revoked || base.invite_expired) {
    return { httpStatus: 404, body: { error: 'Convite inválido ou expirado.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
  }
  if (base.signer_signed_at || base.invite_consumed) {
    return {
      httpStatus: 409,
      body: { error: 'Este convite já foi utilizado.', code: 'SIGNATURE_ALREADY_COMPLETED' },
    };
  }
  const canSubmitStatus =
    base.status === 'awaiting_signature' ||
    (base.signer_role === 'technician' &&
      (base.status === 'signed' || base.status === 'invoiced' || base.status === 'completed'));
  if (!canSubmitStatus) {
    return {
      httpStatus: 410,
      body: { error: 'Assinatura indisponível.', code: 'SIGNATURE_INVITE_UNAVAILABLE' },
    };
  }
  if (normalizeServiceOrderSignerName(base.signer_name).toLowerCase() !== nameNorm.toLowerCase()) {
    return {
      httpStatus: 400,
      body: {
        error: 'O nome confirmado não coincide com o signatário deste convite.',
        code: 'SIGNATURE_NAME_MISMATCH',
      },
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

  let becameSigned = false;

  try {
    await withTenantRlsContext(base.tenant_id, async () => {
      await pool.query('BEGIN');
      try {
        const lock = await pool.query<{ id: string }>(
          `SELECT id FROM public.service_order_signer_signature_invites
           WHERE id = $1 AND token_hash = $2
           FOR UPDATE`,
          [base.invite_id, hash],
        );
        if (!lock.rows[0]) {
          throw new Error('INVITE_GONE');
        }
        const again = await pool.query<{ consumed_at: string | null; revoked_at: string | null }>(
          `SELECT consumed_at, revoked_at FROM public.service_order_signer_signature_invites WHERE id = $1`,
          [base.invite_id],
        );
        if (again.rows[0]?.consumed_at || again.rows[0]?.revoked_at) {
          throw new Error('ALREADY');
        }

        await pool.query(
          `UPDATE public.service_order_signers
           SET signed_at = $2::timestamptz, signature_data = $3::jsonb
           WHERE id = $1 AND signed_at IS NULL`,
          [base.signer_id, signedAtIso, JSON.stringify(signaturePayload)],
        );
        await pool.query(
          `UPDATE public.service_order_signer_signature_invites
           SET consumed_at = now(),
               signer_name_confirmed = $2,
               client_ip = $3,
               user_agent = $4,
               accepted_terms_version = $5
           WHERE id = $1`,
          [base.invite_id, nameNorm, clientIp, userAgent, TERMS_VERSION],
        );

        // Completo quando o cliente assinou (técnico opcional)
        const pendingClient = await pool.query<{ id: string }>(
          `SELECT id FROM public.service_order_signers
           WHERE service_order_id = $1 AND role = 'client' AND signed_at IS NULL
           LIMIT 1`,
          [base.service_order_id],
        );
        if (!pendingClient.rows[0]) {
          await pool.query(
            `UPDATE public.service_orders
             SET status = 'signed', signed_at = COALESCE(signed_at, $3::timestamptz), updated_at = now()
             WHERE id = $1 AND tenant_id = $2 AND status = 'awaiting_signature'`,
            [base.service_order_id, base.tenant_id, signedAtIso],
          );
          becameSigned = true;
        }

        const client = await pool.connect();
        try {
          await insertServiceOrderEvent(client, {
            tenantId: base.tenant_id,
            serviceOrderId: base.service_order_id,
            eventType: 'signed',
            payload: {
              signer_id: base.signer_id,
              role: base.signer_role,
              became_signed: becameSigned,
            },
            createdBy: null,
          });
        } finally {
          client.release();
        }

        await pool.query('COMMIT');
      } catch (e) {
        await pool.query('ROLLBACK');
        throw e;
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'ALREADY') {
      return {
        httpStatus: 409,
        body: { error: 'Este convite já foi utilizado.', code: 'SIGNATURE_ALREADY_COMPLETED' },
      };
    }
    if (msg === 'INVITE_GONE') {
      return { httpStatus: 404, body: { error: 'Convite inválido.', code: 'SIGNATURE_INVITE_NOT_FOUND' } };
    }
    throw e;
  }

  try {
    await refreshSnapshotWithSignatures(base.tenant_id, base.service_order_id);
  } catch (e) {
    console.warn('[service-order] refresh snapshot after sign failed', e);
  }

  if (becameSigned) {
    publishServiceOrderSignedNotification({
      pool,
      tenantId: base.tenant_id,
      serviceOrderId: base.service_order_id,
      actorUserId: null,
    });
    // OS-S5 — auto_on_sign (best-effort; falha não reverte assinatura)
    void import('./serviceOrderInvoiceConversionService.js')
      .then(({ maybeAutoInvoiceAfterServiceOrderSigned }) =>
        maybeAutoInvoiceAfterServiceOrderSigned({
          tenantId: base.tenant_id,
          serviceOrderId: base.service_order_id,
        }),
      )
      .catch((e) => console.warn('[service-order] auto_on_sign hook failed', e));
  }

  return {
    httpStatus: 200,
    body: {
      kind: 'service_order_public_signature',
      state: 'signed',
      message: 'Assinatura registada com sucesso.',
      service_order_signed: becameSigned,
    },
  };
}

/**
 * Fase 3 — publicação transacional a partir de módulos de negócio.
 * Fire-and-forget: erros em log; nunca lançam para o chamador.
 */
import type { Pool } from 'pg';
import {
  isBusinessNotificationEventKeyAllowed,
  isBusinessNotificationPilotTenantAllowed,
  isNotificationsEngineBusinessEventsEnabled,
  isNotificationsEngineEnabled,
} from '../../config/notificationsEngineEnv.js';
import { neLogInfo, neLogWarn as neLogWarnEngine } from './notificationEngineLog.js';
import {
  runTransactionalNotification,
  isSkippedByTenantPreference,
} from './notificationEngineOrchestrator.js';
import { scheduleBillingNotificationSideEffect } from './billingNotificationFlush.js';
import { resolveWhatsAppSenderUserIdForTenant } from './whatsappSenderResolve.js';
import {
  buildAbsoluteProposalPublicLinkUrl,
  decryptProposalPublicLinkToken,
  proposalPublicLinkPathFromRawToken,
  saveProposalPublicLinkCiphertext,
} from '../proposalPublicLinkCrmStore.js';
import { issueNewPublicTokenForProposal } from '../proposalPublicViewService.js';
import { decryptPublicViewTokenFromStorage } from '../contractPublicViewService.js';
import type { SignatureInviteBootstrapItem } from '../contractInviteBootstrapService.js';
import { formatBrazilPhoneDigitsForDisplay } from '../../utils/brPhoneDisplay.js';

function resolveFrontendBaseUrl(): string {
  const raw = (process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL || '').split(',')[0]?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length < 10) return null;
  return d;
}

const PG_UNDEFINED_COLUMN = '42703';

function pgErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return null;
}

function formatBrlDecimal(amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return String(amount);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDueDatePt(iso: string): string {
  const s = String(iso).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return iso;
}

function enqueue(label: string, fn: () => Promise<void>): void {
  scheduleBillingNotificationSideEffect(label, fn);
}

async function gateAndPublish(
  pool: Pool,
  input: {
    eventKey: string;
    tenantId: string;
    preferredSenderUserId: string | null | undefined;
    entityType: string;
    entityId: string | null;
    idempotencyKey: string;
    recipientPhone: string | null;
    recipientType: string;
    mergeContext: Record<string, string>;
    eventOccurredAt: Date | null;
    actor: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  if (!isNotificationsEngineEnabled()) return;
  if (!isNotificationsEngineBusinessEventsEnabled()) return;
  if (!isBusinessNotificationPilotTenantAllowed(input.tenantId)) {
    neLogWarnEngine('business_pilot_skip', { tenant_id: input.tenantId, event_key: input.eventKey });
    return;
  }
  if (!isBusinessNotificationEventKeyAllowed(input.eventKey)) {
    neLogWarnEngine('business_event_key_allowlist_skip', {
      tenant_id: input.tenantId,
      event_key: input.eventKey,
      hint: 'Defina NOTIFICATIONS_ENGINE_BUSINESS_EVENTS_KEYS vazio para todos os eventos, ou inclua este event_key.',
    });
    return;
  }

  const phone = normalizeWhatsappPhone(input.recipientPhone);
  if (!phone) {
    console.warn(
      `[notifications-engine/business] skip ${input.eventKey}: sem telefone normalizado (tenant ${input.tenantId})`,
    );
    return;
  }

  const senderUserId = await resolveWhatsAppSenderUserIdForTenant(
    pool,
    input.tenantId,
    input.preferredSenderUserId,
  );
  if (!senderUserId) {
    console.warn(
      `[notifications-engine/business] skip ${input.eventKey}: sem remetente WhatsApp no tenant ${input.tenantId}`,
    );
    return;
  }

  const result = await runTransactionalNotification({
    pool,
    tenantId: input.tenantId,
    senderUserId,
    eventKey: input.eventKey,
    entityType: input.entityType,
    entityId: input.entityId,
    idempotencyKey: input.idempotencyKey,
    recipientPhone: phone,
    recipientType: input.recipientType,
    mergeContext: input.mergeContext,
    eventOccurredAt: input.eventOccurredAt,
    actor: input.actor,
    metadata: input.metadata,
  });

  if (!result.ok) {
    console.error(`[notifications-engine/business] ${input.eventKey} falhou`, result.error, result.details);
    return;
  }
  if (isSkippedByTenantPreference(result)) {
    return;
  }
  if (result.deliveryId && !result.duplicate) {
    console.log(
      '[BILLING_NOTIFY_DELIVERY_CREATED]',
      JSON.stringify({
        event_key: input.eventKey,
        tenant_id: input.tenantId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        delivery_id: result.deliveryId,
        idempotency_key: input.idempotencyKey,
        status: result.status,
        ts: new Date().toISOString(),
      }),
    );
  }
}

async function loadRecipientForProposal(
  pool: Pool,
  tenantId: string,
  clientId: string | null,
  leadId: string | null,
): Promise<{ name: string; phone: string } | null> {
  if (clientId) {
    const r = await pool.query<{ name: string | null; phone: string | null }>(
      `SELECT c.name, c.phone
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [clientId, tenantId],
    );
    const row = r.rows[0];
    if (row) {
      const ph = normalizeWhatsappPhone(row.phone);
      if (ph) {
        // Alinhar a faturas: nome vazio não pode bloquear envio se houver telefone (invoice usa `|| 'Cliente'`).
        return { name: row.name?.trim() || 'Cliente', phone: ph };
      }
      neLogWarnEngine('proposal_recipient_client_no_phone', {
        tenant_id: tenantId,
        client_id: clientId,
      });
    } else {
      neLogWarnEngine('proposal_recipient_client_not_found', { tenant_id: tenantId, client_id: clientId });
    }
  }
  if (leadId) {
    const r = await pool.query<{ name: string | null; phone: string | null }>(
      `SELECT l.name, l.phone
       FROM leads l
       INNER JOIN users u ON u.id = l.user_id
       WHERE l.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [leadId, tenantId],
    );
    const row = r.rows[0];
    if (row) {
      const ph = normalizeWhatsappPhone(row.phone);
      if (ph) {
        return { name: row.name?.trim() || 'Lead', phone: ph };
      }
      neLogWarnEngine('proposal_recipient_lead_no_phone', { tenant_id: tenantId, lead_id: leadId });
    } else {
      neLogWarnEngine('proposal_recipient_lead_not_found', { tenant_id: tenantId, lead_id: leadId });
    }
  }
  return null;
}

async function loadProposalNotificationRow(
  pool: Pool,
  proposalId: string,
  tenantId: string,
): Promise<{
  id: string;
  title: string;
  amount: string;
  user_id: string;
  client_id: string | null;
  lead_id: string | null;
  tenant_name: string;
  public_link_token_ciphertext: string | null;
} | null> {
  type Row = {
    id: string;
    title: string;
    amount: string;
    user_id: string;
    client_id: string | null;
    lead_id: string | null;
    tenant_name: string;
    public_link_token_ciphertext: string | null;
  };
  const params: [string, string] = [proposalId, tenantId];
  const sqlWithCipher = `SELECT p.id::text AS id, p.title, p.amount::text, p.user_id::text AS user_id,
            p.client_id::text AS client_id, p.lead_id::text AS lead_id,
            t.name AS tenant_name, p.public_link_token_ciphertext
     FROM proposals p
     INNER JOIN users u ON u.id = p.user_id
     INNER JOIN tenants t ON t.id = u.tenant_id
     WHERE p.id = $1 AND u.tenant_id = $2
     LIMIT 1`;
  try {
    const r = await pool.query<Row>(sqlWithCipher, params);
    return r.rows[0] ?? null;
  } catch (e) {
    if (pgErrorCode(e) !== PG_UNDEFINED_COLUMN) throw e;
    neLogWarnEngine('proposal_notification_schema_no_public_link_ciphertext', {
      tenant_id: tenantId,
      proposal_id: proposalId,
      hint: 'Coluna proposals.public_link_token_ciphertext ausente (migration não aplicada). Notificações usam URL do POST / fallback de token.',
    });
    const r = await pool.query<Row>(
      `SELECT p.id::text AS id, p.title, p.amount::text, p.user_id::text AS user_id,
              p.client_id::text AS client_id, p.lead_id::text AS lead_id,
              t.name AS tenant_name, NULL::text AS public_link_token_ciphertext
       FROM proposals p
       INNER JOIN users u ON u.id = p.user_id
       INNER JOIN tenants t ON t.id = u.tenant_id
       WHERE p.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      params,
    );
    return r.rows[0] ?? null;
  }
}

function buildProposalPublicUrl(ciphertext: string | null): string {
  const base = resolveFrontendBaseUrl();
  const raw = decryptProposalPublicLinkToken(ciphertext);
  if (!raw) return '';
  const path = proposalPublicLinkPathFromRawToken(raw);
  return base ? `${base}${path}` : path;
}

/** `proposal.sent` precisa de URL no merge; ciphertext pode estar ausente se PROPOSAL_WEBHOOK_SECRET_KEY não grava no BD. */
async function resolveProposalSentMergePublicUrl(params: {
  pool: Pool;
  tenantId: string;
  proposalId: string;
  ciphertext: string | null;
  resolvedPublicProposalUrl?: string | null;
}): Promise<string> {
  const fromRequest = params.resolvedPublicProposalUrl?.trim();
  if (fromRequest) {
    neLogInfo('proposal_sent_public_link_from_request', {
      tenant_id: params.tenantId,
      proposal_id: params.proposalId,
    });
    return fromRequest;
  }

  let url = buildProposalPublicUrl(params.ciphertext);
  if (url) return url;

  try {
    const { rawToken } = await issueNewPublicTokenForProposal({
      proposalId: params.proposalId,
      tenantId: params.tenantId,
    });
    await saveProposalPublicLinkCiphertext(params.proposalId, rawToken);
    url = buildAbsoluteProposalPublicLinkUrl(rawToken);
    if (url) {
      neLogInfo('proposal_sent_public_link_fallback_mint', {
        tenant_id: params.tenantId,
        proposal_id: params.proposalId,
      });
    }
    return url;
  } catch (e) {
    console.warn('[notifications-engine/business] proposal.sent: falha ao emitir link público de fallback', e);
    return '';
  }
}

/** URL da página pública de pagamento (`/pay/:uuid`). */
function buildCustomerInvoicePayAbsoluteUrl(paymentToken: string | null | undefined): string {
  const base = resolveFrontendBaseUrl();
  const t = paymentToken != null && String(paymentToken).trim() ? String(paymentToken).trim() : '';
  if (!t || !base) return '';
  return `${base}/pay/${t}`;
}

/** Link read-only do contrato (`/contract-view/:token`) quando existe token ativo. */
async function loadContractPublicViewAbsoluteUrl(
  pool: Pool,
  contractId: string,
  tenantId: string,
): Promise<string> {
  const r = await pool.query<{ token_ciphertext: string | null }>(
    `SELECT vt.token_ciphertext
     FROM contract_public_view_tokens vt
     INNER JOIN contracts c ON c.id = vt.contract_id
     INNER JOIN users u ON u.id = c.user_id
     WHERE c.id = $1::uuid AND u.tenant_id = $2::uuid AND vt.revoked_at IS NULL
     ORDER BY vt.created_at DESC
     LIMIT 1`,
    [contractId, tenantId],
  );
  const raw = decryptPublicViewTokenFromStorage(r.rows[0]?.token_ciphertext ?? null);
  if (!raw) return '';
  const base = resolveFrontendBaseUrl();
  const path = `/contract-view/${raw}`;
  return base ? `${base}${path}` : path;
}

export type PublishProposalNotificationParams = {
  pool: Pool;
  tenantId: string;
  proposalId: string;
  eventKey: 'proposal.sent' | 'proposal.accepted' | 'proposal.rejected';
  actorUserId: string;
  actor: Record<string, unknown>;
  /**
   * URL absoluta já resolvida no mesmo pedido HTTP (ex.: token emitido no POST mas ciphertext não gravado
   * quando PROPOSAL_WEBHOOK_SECRET_KEY está ausente — o job assíncrono só lia o BD e perdia o link).
   */
  resolvedPublicProposalUrl?: string | null;
};

/** Execução direta (await no create/update quando a ordem link → evento importa). */
export async function runProposalNotificationAfterStatusChangeNow(params: PublishProposalNotificationParams): Promise<void> {
  const row = await loadProposalNotificationRow(params.pool, params.proposalId, params.tenantId);
  if (!row) {
    neLogWarnEngine('proposal_notify_row_not_found', {
      tenant_id: params.tenantId,
      proposal_id: params.proposalId,
      event_key: params.eventKey,
    });
    return;
  }
  const recipient = await loadRecipientForProposal(
    params.pool,
    params.tenantId,
    row.client_id,
    row.lead_id,
  );
  if (!recipient) {
    neLogWarnEngine('proposal_notify_skip_no_recipient', {
      tenant_id: params.tenantId,
      proposal_id: params.proposalId,
      event_key: params.eventKey,
      client_id: row.client_id,
      lead_id: row.lead_id,
    });
    return;
  }

  console.info(
    '[notifications-engine/business] proposal_notify_attempt',
    JSON.stringify({
      tenant_id: params.tenantId,
      proposal_id: params.proposalId,
      event_key: params.eventKey,
      idempotency_key: `${params.eventKey}:${params.proposalId}`,
      entity_type: 'proposal',
      actor_user_id: params.actorUserId,
    }),
  );

  let publicUrl = buildProposalPublicUrl(row.public_link_token_ciphertext);
  if (params.eventKey === 'proposal.sent') {
    publicUrl = await resolveProposalSentMergePublicUrl({
      pool: params.pool,
      tenantId: params.tenantId,
      proposalId: params.proposalId,
      ciphertext: row.public_link_token_ciphertext,
      resolvedPublicProposalUrl: params.resolvedPublicProposalUrl,
    });
    if (!publicUrl) {
      console.warn(
        '[notifications-engine/business] skip proposal.sent: link público indisponível após BD, URL do pedido e fallback',
      );
      return;
    }
  }

  const merge: Record<string, string> = {
    'tenant.name': row.tenant_name,
    'client.name': recipient.name,
    'proposal.title': row.title,
    'proposal.total': formatBrlDecimal(row.amount),
  };
  if (publicUrl) merge['proposal.public_link'] = publicUrl;

  await gateAndPublish(params.pool, {
    eventKey: params.eventKey,
    tenantId: params.tenantId,
    preferredSenderUserId: params.actorUserId,
    entityType: 'proposal',
    entityId: params.proposalId,
    idempotencyKey: `${params.eventKey}:${params.proposalId}`,
    recipientPhone: recipient.phone,
    recipientType: 'customer',
    mergeContext: merge,
    eventOccurredAt: new Date(),
    actor: params.actor,
    metadata: {
      engine: 'notifications_engine',
      phase: 3,
      source: 'proposals',
      proposal_id: params.proposalId,
    },
  });
}

export function publishProposalNotificationAfterStatusChange(params: PublishProposalNotificationParams): void {
  enqueue(`proposal ${params.eventKey}`, () => runProposalNotificationAfterStatusChangeNow(params));
}

/**
 * Envia `contract.sent` por WhatsApp:
 * - um delivery por signatário com `whatsapp_phone`, usando o link de assinatura daquele participante;
 * - se ninguém tiver WhatsApp, mantém compatibilidade: um envio para o telefone do cliente CRM com o primeiro link emitido no bootstrap.
 */
export function publishContractSentNotifications(params: {
  pool: Pool;
  tenantId: string;
  contractId: string;
  actorUserId: string;
  bootstrap: SignatureInviteBootstrapItem[];
}): void {
  enqueue('contract.sent', async () => {
    const base = resolveFrontendBaseUrl();

    const contractRow = await params.pool.query<{
      title: string;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
    }>(
      `SELECT c.title, t.name AS tenant_name,
              cl.name AS client_name, cl.phone AS client_phone
       FROM contracts c
       INNER JOIN users u ON u.id = c.user_id
       INNER JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [params.contractId, params.tenantId],
    );
    const row = contractRow.rows[0];
    if (!row) return;

    const clientName = row.client_name?.trim() || 'Cliente';
    const publicViewUrl = await loadContractPublicViewAbsoluteUrl(
      params.pool,
      params.contractId,
      params.tenantId,
    );

    const signersRes = await params.pool.query<{
      id: string;
      name: string;
      email: string;
      whatsapp_phone: string | null;
    }>(
      `SELECT id::text AS id, name, email, whatsapp_phone
       FROM contract_signers
       WHERE contract_id = $1::uuid
       ORDER BY signing_order NULLS LAST, created_at`,
      [params.contractId],
    );
    const signerById = new Map(signersRes.rows.map((s) => [s.id, s]));

    const buildMergeContext = (
      signUrlAbsolute: string,
      signer: { name: string; email: string; whatsapp_phone: string | null },
    ): Record<string, string> => {
      const waDigits = String(signer.whatsapp_phone ?? '').replace(/\D/g, '');
      return {
        'tenant.name': row.tenant_name,
        'client.name': clientName,
        'contract.title': row.title,
        'contract.sign_link': signUrlAbsolute,
        'contract.public_view_link': publicViewUrl,
        'signer.name': signer.name?.trim() || 'Assinante',
        'signer.email': signer.email?.trim() || '',
        'signer.whatsapp': waDigits ? formatBrazilPhoneDigitsForDisplay(waDigits) : '',
      };
    };

    let anySignerWhatsApp = false;

    for (const item of params.bootstrap) {
      if (!('token' in item) || typeof item.token !== 'string') continue;
      const sid = item.signer_id;
      const signer = signerById.get(sid);
      if (!signer) continue;
      const phone = normalizeWhatsappPhone(signer.whatsapp_phone);
      if (!phone) continue;

      const signUrlAbsolute = base ? `${base}${item.frontend_path}` : item.frontend_path;

      await gateAndPublish(params.pool, {
        eventKey: 'contract.sent',
        tenantId: params.tenantId,
        preferredSenderUserId: params.actorUserId,
        entityType: 'contract',
        entityId: params.contractId,
        idempotencyKey: `contract.sent:${params.contractId}:${sid}`,
        recipientPhone: phone,
        recipientType: 'customer',
        mergeContext: buildMergeContext(signUrlAbsolute, signer),
        eventOccurredAt: new Date(),
        actor: { type: 'user', user_id: params.actorUserId },
        metadata: {
          engine: 'notifications_engine',
          phase: 3,
          source: 'contracts',
          contract_id: params.contractId,
          signer_id: sid,
        },
      });
      anySignerWhatsApp = true;
    }

    if (anySignerWhatsApp) return;

    const firstWithToken = params.bootstrap.find((it): it is SignatureInviteBootstrapItem & { token: string; frontend_path: string } =>
      'token' in it && typeof (it as { token?: unknown }).token === 'string',
    );
    if (!firstWithToken) {
      console.warn(
        '[notifications-engine/business] skip contract.sent: sem convite com token reemitível e sem WhatsApp nos signatários',
      );
      return;
    }

    const legacyPhone = normalizeWhatsappPhone(row.client_phone);
    if (!legacyPhone) {
      console.warn(
        '[notifications-engine/business] skip contract.sent: nenhum WhatsApp em signatários e cliente CRM sem telefone',
      );
      return;
    }

    const signUrlAbsolute = base ? `${base}${firstWithToken.frontend_path}` : firstWithToken.frontend_path;
    const firstSigner = signersRes.rows[0];
    const fallbackSigner = firstSigner ?? {
      name: clientName,
      email: '',
      whatsapp_phone: null,
    };

    await gateAndPublish(params.pool, {
      eventKey: 'contract.sent',
      tenantId: params.tenantId,
      preferredSenderUserId: params.actorUserId,
      entityType: 'contract',
      entityId: params.contractId,
      idempotencyKey: `contract.sent:${params.contractId}`,
      recipientPhone: legacyPhone,
      recipientType: 'customer',
      mergeContext: buildMergeContext(signUrlAbsolute, fallbackSigner),
      eventOccurredAt: new Date(),
      actor: { type: 'user', user_id: params.actorUserId },
      metadata: {
        engine: 'notifications_engine',
        phase: 3,
        source: 'contracts',
        contract_id: params.contractId,
        fallback: 'client_phone',
      },
    });
  });
}

export function publishContractSignedNotification(params: {
  pool: Pool;
  tenantId: string;
  contractId: string;
  preferredSenderUserId: string | null;
}): void {
  enqueue('contract.signed', async () => {
    const r = await params.pool.query<{
      title: string;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
      owner_user_id: string;
    }>(
      `SELECT c.title, t.name AS tenant_name,
              cl.name AS client_name, cl.phone AS client_phone,
              c.user_id::text AS owner_user_id
       FROM contracts c
       INNER JOIN users u ON u.id = c.user_id
       INNER JOIN tenants t ON t.id = u.tenant_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [params.contractId, params.tenantId],
    );
    const row = r.rows[0];
    if (!row) return;
    const phone = normalizeWhatsappPhone(row.client_phone);
    if (!phone) {
      console.warn('[notifications-engine/business] skip contract.signed: cliente sem telefone');
      return;
    }
    const clientName = row.client_name?.trim() || 'Cliente';
    const preferred = params.preferredSenderUserId ?? row.owner_user_id;
    const publicViewUrl = await loadContractPublicViewAbsoluteUrl(
      params.pool,
      params.contractId,
      params.tenantId,
    );
    await gateAndPublish(params.pool, {
      eventKey: 'contract.signed',
      tenantId: params.tenantId,
      preferredSenderUserId: preferred,
      entityType: 'contract',
      entityId: params.contractId,
      idempotencyKey: `contract.signed:${params.contractId}`,
      recipientPhone: phone,
      recipientType: 'customer',
      mergeContext: {
        'tenant.name': row.tenant_name,
        'client.name': clientName,
        'contract.title': row.title,
        'contract.public_view_link': publicViewUrl,
      },
      eventOccurredAt: new Date(),
      actor: { type: 'public_action', source: 'contract_signature' },
      metadata: { engine: 'notifications_engine', phase: 3, source: 'contracts', contract_id: params.contractId },
    });
  });
}

export function publishInvoiceCreatedNotification(params: {
  pool: Pool;
  tenantId: string;
  invoiceId: string;
  preferredSenderUserId: string | null;
}): void {
  enqueue('invoice.created', async () => {
    const r = await params.pool.query<{
      invoice_number: string | null;
      amount_cents: number;
      due_date: string;
      payment_token: string | null;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
    }>(
      `SELECT ci.invoice_number, ci.amount_cents, ci.due_date::text AS due_date,
              ci.payment_token::text AS payment_token, tn.name AS tenant_name,
              cl.name AS client_name, cl.phone AS client_phone
       FROM customer_invoices ci
       INNER JOIN tenants tn ON tn.id = ci.tenant_id
       LEFT JOIN clients cl ON cl.id = ci.client_id
       WHERE ci.id = $1 AND ci.tenant_id = $2
       LIMIT 1`,
      [params.invoiceId, params.tenantId],
    );
    const row = r.rows[0];
    if (!row) return;
    const phone = normalizeWhatsappPhone(row.client_phone);
    if (!phone) {
      console.warn('[notifications-engine/business] skip invoice.created: sem telefone de cliente');
      return;
    }
    const num = row.invoice_number?.trim() || params.invoiceId;
    const clientName = row.client_name?.trim() || 'Cliente';
    const payUrl = buildCustomerInvoicePayAbsoluteUrl(row.payment_token);
    await gateAndPublish(params.pool, {
      eventKey: 'invoice.created',
      tenantId: params.tenantId,
      preferredSenderUserId: params.preferredSenderUserId,
      entityType: 'customer_invoice',
      entityId: params.invoiceId,
      idempotencyKey: `invoice.created:${params.invoiceId}`,
      recipientPhone: phone,
      recipientType: 'customer',
      mergeContext: {
        'tenant.name': row.tenant_name,
        'client.name': clientName,
        'invoice.number': num,
        'invoice.total': formatBrlCents(row.amount_cents),
        'invoice.due_date': formatDueDatePt(row.due_date),
        'invoice.public_link': payUrl,
      },
      eventOccurredAt: new Date(),
      actor: { type: 'system', source: 'customer_invoice' },
      metadata: { engine: 'notifications_engine', phase: 3, source: 'invoices', invoice_id: params.invoiceId },
    });
  });
}

export function publishInvoicePaidNotification(params: {
  pool: Pool;
  tenantId: string;
  invoiceId: string;
  preferredSenderUserId: string | null;
}): void {
  enqueue('invoice.paid', async () => {
    const r = await params.pool.query<{
      invoice_number: string | null;
      amount_cents: number;
      payment_token: string | null;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
    }>(
      `SELECT ci.invoice_number, ci.amount_cents, ci.payment_token::text AS payment_token, tn.name AS tenant_name,
              cl.name AS client_name, cl.phone AS client_phone
       FROM customer_invoices ci
       INNER JOIN tenants tn ON tn.id = ci.tenant_id
       LEFT JOIN clients cl ON cl.id = ci.client_id
       WHERE ci.id = $1 AND ci.tenant_id = $2
       LIMIT 1`,
      [params.invoiceId, params.tenantId],
    );
    const row = r.rows[0];
    if (!row) return;
    const phone = normalizeWhatsappPhone(row.client_phone);
    if (!phone) {
      console.warn('[notifications-engine/business] skip invoice.paid: sem telefone de cliente');
      return;
    }
    const num = row.invoice_number?.trim() || params.invoiceId;
    const clientName = row.client_name?.trim() || 'Cliente';
    const payUrl = buildCustomerInvoicePayAbsoluteUrl(row.payment_token);
    await gateAndPublish(params.pool, {
      eventKey: 'invoice.paid',
      tenantId: params.tenantId,
      preferredSenderUserId: params.preferredSenderUserId,
      entityType: 'customer_invoice',
      entityId: params.invoiceId,
      idempotencyKey: `invoice.paid:${params.invoiceId}`,
      recipientPhone: phone,
      recipientType: 'customer',
      mergeContext: {
        'tenant.name': row.tenant_name,
        'client.name': clientName,
        'invoice.number': num,
        'invoice.total': formatBrlCents(row.amount_cents),
        'invoice.public_link': payUrl,
      },
      eventOccurredAt: new Date(),
      actor: { type: 'system', source: 'customer_invoice_status' },
      metadata: { engine: 'notifications_engine', phase: 3, source: 'invoices', invoice_id: params.invoiceId },
    });
  });
}

/** Digest diário (Fase 4): idempotência por `invoiceId` + dia UTC (`YYYY-MM-DD`). */
export function publishInvoiceDueSoonDigest(params: {
  pool: Pool;
  tenantId: string;
  invoiceId: string;
  idempotencyDay: string;
  preferredSenderUserId: string | null;
}): void {
  enqueue('invoice.due_soon', async () => {
    const r = await params.pool.query<{
      invoice_number: string | null;
      amount_cents: number;
      due_date: string;
      payment_token: string | null;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
    }>(
      `SELECT ci.invoice_number, ci.amount_cents, ci.due_date::text AS due_date,
              ci.payment_token::text AS payment_token, tn.name AS tenant_name,
              cl.name AS client_name, cl.phone AS client_phone
       FROM customer_invoices ci
       INNER JOIN tenants tn ON tn.id = ci.tenant_id
       LEFT JOIN clients cl ON cl.id = ci.client_id
       WHERE ci.id = $1 AND ci.tenant_id = $2
         AND ci.status IN ('pending','waiting_payment','processing')
       LIMIT 1`,
      [params.invoiceId, params.tenantId],
    );
    const row = r.rows[0];
    if (!row) return;
    const phone = normalizeWhatsappPhone(row.client_phone);
    if (!phone) return;
    const num = row.invoice_number?.trim() || params.invoiceId;
    const clientName = row.client_name?.trim() || 'Cliente';
    const payUrl = buildCustomerInvoicePayAbsoluteUrl(row.payment_token);
    await gateAndPublish(params.pool, {
      eventKey: 'invoice.due_soon',
      tenantId: params.tenantId,
      preferredSenderUserId: params.preferredSenderUserId,
      entityType: 'customer_invoice',
      entityId: params.invoiceId,
      idempotencyKey: `invoice.due_soon:${params.invoiceId}:${params.idempotencyDay}`,
      recipientPhone: phone,
      recipientType: 'customer',
      mergeContext: {
        'tenant.name': row.tenant_name,
        'client.name': clientName,
        'invoice.number': num,
        'invoice.total': formatBrlCents(row.amount_cents),
        'invoice.due_date': formatDueDatePt(row.due_date),
        'invoice.public_link': payUrl,
      },
      eventOccurredAt: new Date(),
      actor: { type: 'system', source: 'invoice_digest_worker' },
      metadata: {
        engine: 'notifications_engine',
        phase: 4,
        source: 'invoice_digest',
        invoice_id: params.invoiceId,
        digest_day: params.idempotencyDay,
      },
    });
  });
}

export function publishInvoiceOverdueDigest(params: {
  pool: Pool;
  tenantId: string;
  invoiceId: string;
  idempotencyDay: string;
  preferredSenderUserId: string | null;
}): void {
  enqueue('invoice.overdue', async () => {
    const r = await params.pool.query<{
      invoice_number: string | null;
      amount_cents: number;
      due_date: string;
      payment_token: string | null;
      tenant_name: string;
      client_name: string | null;
      client_phone: string | null;
    }>(
      `SELECT ci.invoice_number, ci.amount_cents, ci.due_date::text AS due_date,
              ci.payment_token::text AS payment_token, tn.name AS tenant_name,
              cl.name AS client_name, cl.phone AS client_phone
       FROM customer_invoices ci
       INNER JOIN tenants tn ON tn.id = ci.tenant_id
       LEFT JOIN clients cl ON cl.id = ci.client_id
       WHERE ci.id = $1 AND ci.tenant_id = $2
         AND ci.status IN ('pending','waiting_payment','processing','overdue')
       LIMIT 1`,
      [params.invoiceId, params.tenantId],
    );
    const row = r.rows[0];
    if (!row) return;
    const phone = normalizeWhatsappPhone(row.client_phone);
    if (!phone) return;
    const num = row.invoice_number?.trim() || params.invoiceId;
    const clientName = row.client_name?.trim() || 'Cliente';
    const payUrl = buildCustomerInvoicePayAbsoluteUrl(row.payment_token);
    await gateAndPublish(params.pool, {
      eventKey: 'invoice.overdue',
      tenantId: params.tenantId,
      preferredSenderUserId: params.preferredSenderUserId,
      entityType: 'customer_invoice',
      entityId: params.invoiceId,
      idempotencyKey: `invoice.overdue:${params.invoiceId}:${params.idempotencyDay}`,
      recipientPhone: phone,
      recipientType: 'customer',
      mergeContext: {
        'tenant.name': row.tenant_name,
        'client.name': clientName,
        'invoice.number': num,
        'invoice.total': formatBrlCents(row.amount_cents),
        'invoice.due_date': formatDueDatePt(row.due_date),
        'invoice.public_link': payUrl,
      },
      eventOccurredAt: new Date(),
      actor: { type: 'system', source: 'invoice_digest_worker' },
      metadata: {
        engine: 'notifications_engine',
        phase: 4,
        source: 'invoice_digest',
        invoice_id: params.invoiceId,
        digest_day: params.idempotencyDay,
      },
    });
  });
}

/**
 * Fase 4 — Webhook Mercado Pago: notificação → GET /v1/payments/:id (fonte da verdade) → fatura CRM.
 * Não confia no corpo do POST para status final; Asaas + MP paralelo preserva colunas do Asaas.
 */
import { pool } from '../utils/db.js';
import type { CustomerInvoiceRow } from './customerInvoiceService.js';
import { getInvoiceById } from './customerBillingService.js';
import { updateCustomerInvoiceStatus } from './customerInvoiceService.js';
import { getMercadoPagoAccessTokenForTenant } from './mercadoPagoIntegrationService.js';
import { findTenantIdByMercadoPagoCollectorId } from './mercadoPagoCredentialsRepository.js';
import { getMercadoPagoPayment, type MercadoPagoPaymentResource } from '../modules/gateways/mercado_pago/client/mercadoPagoPaymentsApi.js';
import {
  isMercadoPagoGatewayEnabled,
  getMercadoPagoWebhookSecret,
  getMercadoPagoWebhookTsToleranceMs,
} from '../config/mercadoPagoGatewayEnv.js';
import {
  extractMercadoPagoManifestDataId,
  verifyMercadoPagoWebhookSignature,
} from './mercadoPagoWebhookSignature.js';
import { insertPaymentEvent, markPaymentEventProcessed } from '../modules/payments/webhook/paymentEventsService.js';
import type { ProcessedResult } from '../modules/payments/webhook/paymentEventsService.js';
import { canTransition, normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import type { InternalPaymentStatus } from '../modules/payments/paymentGatewayTypes.js';
import { runPostPaidCleanupForCustomerInvoice } from './billingGatewayChargeService.js';
import { createClientTimelineEvent } from './clientTimelineEventsService.js';
import { billingLog } from './billingLogger.js';
import { hasInvoicePaymentAttemptsTable, updateInvoicePaymentAttemptStatus } from './customerInvoicePaymentAttemptsService.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';

const GATEWAY = 'mercado_pago';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/** payment_id do MP: somente dígitos, tamanho razoável (evita injeção / lixo). */
function isValidMercadoPagoPaymentId(id: string): boolean {
  const t = id.trim();
  if (t.length < 1 || t.length > 32) return false;
  return /^\d+$/.test(t);
}

function headerOne(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) {
      if (typeof v === 'string' && v.trim() !== '') return v;
      if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim() !== '') return v[0];
    }
  }
  return undefined;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

export function parseMercadoPagoWebhook(params: {
  body: unknown;
  query: Record<string, string | string[] | undefined>;
}): { paymentId: string | null; mpUserId: string | null; action: string } {
  const q = params.query;
  const topic = typeof q.topic === 'string' ? q.topic : Array.isArray(q.topic) ? q.topic[0] : '';
  const qid = typeof q.id === 'string' ? q.id : Array.isArray(q.id) ? q.id[0] : '';
  if (topic === 'payment' && qid) {
    return { paymentId: String(qid), mpUserId: null, action: 'query_payment' };
  }
  const b = params.body;
  if (b == null || typeof b !== 'object' || Array.isArray(b)) {
    return { paymentId: null, mpUserId: null, action: 'unknown' };
  }
  const o = b as Record<string, unknown>;
  const action = str(o.action) || 'unknown';
  const userRaw = o.user_id;
  const mpUserId = userRaw == null || userRaw === '' ? null : String(userRaw);
  const type = str(o.type);
  const data = o.data;
  if (type === 'payment' && data && typeof data === 'object' && !Array.isArray(data)) {
    const id = (data as Record<string, unknown>).id;
    if (id != null) return { paymentId: String(id), mpUserId, action };
  }
  return { paymentId: null, mpUserId, action };
}

function buildStableEventId(body: unknown, paymentId: string, action: string): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const id = (body as Record<string, unknown>).id;
    if (id != null) return `mp_notif_${String(id)}`;
  }
  return `mp_pay_${paymentId}_${action}`;
}

async function mergeInvoiceGatewayMetadata(invoiceId: string, patch: Record<string, unknown>): Promise<void> {
  const cur = await pool.query<{ gateway_metadata: Record<string, unknown> | null }>(
    `SELECT gateway_metadata FROM customer_invoices WHERE id = $1 LIMIT 1`,
    [invoiceId],
  );
  const prev = cur.rows[0]?.gateway_metadata ?? {};
  const next = { ...prev, ...patch };
  await pool.query(
    `UPDATE customer_invoices SET gateway_metadata = $1::jsonb, updated_at = now() WHERE id = $2`,
    [JSON.stringify(next), invoiceId],
  );
}

function mercadoPagoPaymentSnapshot(payment: MercadoPagoPaymentResource): Record<string, unknown> {
  return {
    id: payment.id != null ? String(payment.id) : null,
    status: payment.status ?? null,
    status_detail: payment.status_detail ?? null,
    external_reference: payment.external_reference ?? null,
    transaction_amount: payment.transaction_amount ?? null,
    currency_id: payment.currency_id ?? null,
    date_approved: payment.date_approved ?? null,
    date_last_updated: payment.date_last_updated ?? null,
    collector_id: payment.collector_id != null ? String(payment.collector_id) : null,
    order_id: payment.order && typeof payment.order === 'object' ? (payment.order as { id?: unknown }).id ?? null : null,
  };
}

async function resolveInvoiceForPayment(
  tenantId: string,
  payment: MercadoPagoPaymentResource,
): Promise<CustomerInvoiceRow | null> {
  const ext = str(payment.external_reference);
  const meta = payment.metadata && typeof payment.metadata === 'object' ? (payment.metadata as Record<string, unknown>) : {};
  const metaInv = str(meta.invoice_id);
  const candidate = ext || metaInv;
  if (candidate && isUuid(candidate)) {
    const inv = await getInvoiceById(tenantId, candidate);
    if (inv) return inv;
  }
  const pref =
    payment.order && typeof payment.order === 'object'
      ? str((payment.order as Record<string, unknown>).id)
      : '';
  if (!pref) return null;

  const schema = await getCustomerInvoiceSchema();
  const r = await pool.query<CustomerInvoiceRow>(
    `SELECT ${schema.selectListBare}
     FROM customer_invoices
     WHERE tenant_id = $1::uuid
       AND (
         (gateway_metadata->'mercado_pago_checkout'->>'preference_id') = $2
         OR (gateway = 'mercado_pago' AND gateway_reference_id = $2)
       )
     LIMIT 1`,
    [tenantId, pref],
  );
  return r.rows[0] ?? null;
}

async function findMercadoPagoAttemptForInvoice(
  invoiceId: string,
  tenantId: string,
): Promise<{ id: string; gateway_reference_id: string | null } | null> {
  if (!(await hasInvoicePaymentAttemptsTable())) return null;
  const r = await pool.query<{ id: string; gateway_reference_id: string | null }>(
    `SELECT id, gateway_reference_id
     FROM customer_invoice_payment_attempts
     WHERE invoice_id = $1 AND tenant_id = $2::uuid AND gateway = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [invoiceId, tenantId, GATEWAY],
  );
  return r.rows[0] ?? null;
}

function paidAtFromPayment(payment: MercadoPagoPaymentResource): Date | undefined {
  const d = str(payment.date_approved);
  if (!d) return undefined;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export async function processMercadoPagoWebhookNotification(params: {
  body: unknown;
  query: Record<string, string | string[] | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}): Promise<{ ok: boolean; log?: string; httpStatus?: number; errorCode?: string }> {
  if (!isMercadoPagoGatewayEnabled()) {
    return { ok: false, log: 'feature_disabled' };
  }

  /** Correlação com logs do Mercado Pago (header x-request-id); não é secreto. */
  const requestIdLog = headerOne(params.headers, 'x-request-id');

  const parsed = parseMercadoPagoWebhook(params);
  const paymentId = parsed.paymentId;
  const action = parsed.action;

  if (!paymentId) {
    console.warn('[mercado_pago.webhook]', {
      result: 'ignored',
      reason: 'no_payment_id',
      action,
      request_id: requestIdLog,
    });
    return { ok: true, log: 'no_payment_id' };
  }

  if (!isValidMercadoPagoPaymentId(paymentId)) {
    console.warn('[mercado_pago.webhook]', {
      result: 'rejected',
      reason: 'invalid_payment_id_format',
      request_id: requestIdLog,
    });
    return { ok: false, httpStatus: 400, errorCode: 'invalid_payment_id', log: 'invalid_payment_id' };
  }

  const manifestDataId = extractMercadoPagoManifestDataId(params.query, params.body, paymentId);
  const secret = getMercadoPagoWebhookSecret();
  const sigResult = verifyMercadoPagoWebhookSignature({
    webhookSecret: secret,
    tsToleranceMs: getMercadoPagoWebhookTsToleranceMs(),
    xSignatureHeader: headerOne(params.headers, 'x-signature'),
    xRequestIdHeader: requestIdLog,
    manifestDataId,
  });

  if (!sigResult.ok) {
    console.warn('[mercado_pago.webhook]', {
      result: 'rejected',
      reason: sigResult.reason,
      request_id: requestIdLog,
      payment_id: paymentId,
    });
    return {
      ok: false,
      httpStatus: 401,
      errorCode: 'invalid_signature',
      log: sigResult.reason,
    };
  }

  if (sigResult.mode === 'skipped_no_secret') {
    console.warn('[mercado_pago.webhook]', {
      result: 'signature_validation_skipped',
      request_id: requestIdLog,
      payment_id: paymentId,
      message:
        'MERCADO_PAGO_WEBHOOK_SECRET não configurado; aceito sem validar x-signature (modo compatível). Configure o segredo do Webhook no painel MP e nesta env.',
    });
  }

  let mpUserId = parsed.mpUserId;
  const topic = typeof params.query.topic === 'string' ? params.query.topic : '';
  if (!mpUserId && topic === 'payment') {
    console.warn('[mercado_pago.webhook]', {
      result: 'ignored',
      reason: 'missing_user_id_query_mode',
      payment_id: paymentId,
    });
    return { ok: true, log: 'missing_user_id' };
  }

  if (!mpUserId) {
    console.warn('[mercado_pago.webhook]', { result: 'ignored', reason: 'missing_user_id', payment_id: paymentId });
    return { ok: true, log: 'missing_user_id' };
  }

  const tenantId = await findTenantIdByMercadoPagoCollectorId(mpUserId);
  if (!tenantId) {
    console.warn('[mercado_pago.webhook]', {
      result: 'ignored',
      reason: 'tenant_not_found_for_collector',
      payment_id: paymentId,
    });
    return { ok: true, log: 'tenant_not_found' };
  }

  const eventId = buildStableEventId(params.body, paymentId, action);
  const payloadObj =
    params.body && typeof params.body === 'object' && !Array.isArray(params.body)
      ? (params.body as Record<string, unknown>)
      : {};

  const ins = await insertPaymentEvent({
    gateway: GATEWAY,
    eventId,
    referenceId: paymentId,
    payload: payloadObj,
  });

  if (!ins.inserted) {
    return { ok: true, log: 'duplicate_event' };
  }

  const fail = async (pr: ProcessedResult) => {
    await markPaymentEventProcessed({ gateway: GATEWAY, eventId, processedResult: pr });
  };

  try {
    const accessToken = await getMercadoPagoAccessTokenForTenant(tenantId);
    const payment = await getMercadoPagoPayment(accessToken, paymentId);

    const collector = payment.collector_id != null ? String(payment.collector_id) : '';
    if (collector && collector !== String(mpUserId)) {
      console.warn('[mercado_pago.webhook]', {
        result: 'rejected',
        reason: 'collector_mismatch',
        payment_id: paymentId,
        tenant_id: tenantId,
      });
      await fail({
        previous_status: 'n/a',
        new_status: 'pending',
        action: 'no_change',
        reason: 'collector_id da API não coincide com user_id do webhook',
      });
      return { ok: true, log: 'collector_mismatch' };
    }

    const invoice = await resolveInvoiceForPayment(tenantId, payment);
    if (!invoice) {
      await fail({
        previous_status: 'n/a',
        new_status: 'pending',
        action: 'no_change',
        reason: 'Fatura não encontrada para external_reference/preference',
      });
      return { ok: true, log: 'invoice_not_found' };
    }

    const extRef = str(payment.external_reference);
    if (extRef && isUuid(extRef) && extRef !== invoice.id) {
      await fail({
        previous_status: invoice.status,
        new_status: 'pending',
        action: 'no_change',
        reason: 'external_reference não bate com a fatura resolvida',
      });
      return { ok: true, log: 'reference_mismatch' };
    }

    const rawStatus = str(payment.status) || 'pending';
    const internal = normalizeGatewayStatus(GATEWAY, rawStatus) as InternalPaymentStatus;

    billingLog('invoice', 'mercado_pago_webhook_received', {
      tenant_id: tenantId,
      invoice_id: invoice.id,
      payment_id: paymentId,
      mp_status: rawStatus,
      action,
      ...(requestIdLog ? { request_id: requestIdLog } : {}),
    });
    if (invoice.client_id) {
      await createClientTimelineEvent({
        tenantId,
        clientId: invoice.client_id,
        eventName: 'mercado_pago_webhook_received',
        source: 'finance',
        actorType: 'integration',
        actorId: null,
        referenceType: 'customer_invoice',
        referenceId: invoice.id,
        eventKey: `mp_wh_${eventId}`,
        metadata: {
          payment_id: paymentId,
          mp_status: rawStatus,
          action,
          ...(requestIdLog ? { request_id: requestIdLog } : {}),
        },
      }).catch(() => {});
    }

    const hybridAsaas = invoice.gateway === 'asaas';
    /** Coluna `gateway_status` não reflete status MP quando o gateway principal é Asaas (preserva debug Asaas). */
    const gatewayStatusForColumn = hybridAsaas ? null : rawStatus;

    const mpMetaPatch: Record<string, unknown> = {
      mercado_pago_payment: mercadoPagoPaymentSnapshot(payment),
      mercado_pago_webhook_last_action: action,
      mercado_pago_webhook_last_at: new Date().toISOString(),
    };
    if (internal === 'paid' && hybridAsaas) {
      mpMetaPatch.paid_by_gateway = GATEWAY;
      mpMetaPatch.mercado_pago_gateway_status = rawStatus;
    }

    await mergeInvoiceGatewayMetadata(invoice.id, mpMetaPatch);

    const currentStatus = invoice.status;
    if (!canTransition(currentStatus, internal)) {
      await markPaymentEventProcessed({
        gateway: GATEWAY,
        eventId,
        processedResult: {
          previous_status: currentStatus,
          new_status: internal,
          action: 'skipped_regression',
          reason: `Anti-regressão: ${currentStatus} → ${internal}`,
        },
      });
      return { ok: true, log: 'skipped_regression' };
    }

    if (internal === 'paid') {
      const paidAt = paidAtFromPayment(payment) ?? new Date();
      await updateCustomerInvoiceStatus(invoice.id, 'paid', paidAt, gatewayStatusForColumn);

      const clientId = invoice.client_id;
      if (clientId) {
        await createClientTimelineEvent({
          tenantId,
          clientId,
          eventName: 'invoice_paid',
          source: 'finance',
          actorType: 'system',
          actorId: null,
          referenceType: 'customer_invoice',
          referenceId: invoice.id,
          eventKey: `invoice_paid:${invoice.id}`,
          metadata: {
            gateway: GATEWAY,
            paid_via: hybridAsaas ? 'mercado_pago_parallel' : 'mercado_pago',
            mercado_pago_payment_id: str(payment.id),
          },
        }).catch((err) => console.error('[mercado_pago.webhook] timeline:', err));
      }

      const chargeId = invoice.charge_id;
      if (chargeId) {
        const { recalculateChargeStatus } = await import('./customerChargesService.js');
        await recalculateChargeStatus(chargeId).catch((err) =>
          console.error('[mercado_pago.webhook] recalculateChargeStatus:', err),
        );
      }

      const mpAttempt = await findMercadoPagoAttemptForInvoice(invoice.id, tenantId);
      const preferenceId =
        typeof invoice.gateway_metadata?.mercado_pago_checkout === 'object' &&
        invoice.gateway_metadata?.mercado_pago_checkout !== null
          ? str((invoice.gateway_metadata.mercado_pago_checkout as Record<string, unknown>).preference_id)
          : '';
      const cleanupRef =
        mpAttempt?.gateway_reference_id?.trim() ||
        preferenceId ||
        str(payment.id);

      if (mpAttempt) {
        await updateInvoicePaymentAttemptStatus({
          attemptId: mpAttempt.id,
          status: 'paid',
          gatewayStatus: rawStatus,
          paidAt,
        });
      }

      await runPostPaidCleanupForCustomerInvoice({
        invoiceId: invoice.id,
        tenantId,
        paidGatewayReferenceId: cleanupRef,
        gatewayStatusRaw: rawStatus,
        paidAt,
      }).catch((err) => console.error('[mercado_pago.webhook] post_paid_cleanup:', err));

      await markPaymentEventProcessed({
        gateway: GATEWAY,
        eventId,
        processedResult: {
          previous_status: currentStatus,
          new_status: 'paid',
          action: currentStatus === 'paid' ? 'no_change' : 'status_updated',
          reason: hybridAsaas ? 'paid_via_MP_parallel_asaas_gateway_preserved' : 'paid_via_MP',
        },
      });

      billingLog('invoice', 'mercado_pago_invoice_settled', {
        tenant_id: tenantId,
        invoice_id: invoice.id,
        payment_id: paymentId,
        hybrid_asaas: hybridAsaas,
      });

      console.log('[mercado_pago.webhook]', {
        result: 'applied',
        tenant_id: tenantId,
        invoice_id: invoice.id,
        payment_id: paymentId,
        internal_status: internal,
        request_id: requestIdLog,
      });
      return { ok: true, log: 'paid' };
    }

    await updateCustomerInvoiceStatus(invoice.id, internal, undefined, gatewayStatusForColumn);

    await markPaymentEventProcessed({
      gateway: GATEWAY,
      eventId,
      processedResult: {
        previous_status: currentStatus,
        new_status: internal,
        action: currentStatus === internal ? 'no_change' : 'status_updated',
        reason: `MP status ${rawStatus} → ${internal}`,
      },
    });

    console.log('[mercado_pago.webhook]', {
      result: 'applied',
      tenant_id: tenantId,
      invoice_id: invoice.id,
      payment_id: paymentId,
      internal_status: internal,
      request_id: requestIdLog,
    });
    return { ok: true, log: internal };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mercado_pago.webhook]', {
      result: 'error',
      payment_id: paymentId,
      request_id: requestIdLog,
      message: msg.slice(0, 200),
    });
    await pool.query(`DELETE FROM payment_events WHERE gateway = $1 AND event_id = $2`, [GATEWAY, eventId]);
    return { ok: false, log: msg.slice(0, 120) };
  }
}

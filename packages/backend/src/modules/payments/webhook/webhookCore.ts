/**
 * Webhook em 3 camadas: parser → webhookCore (este) → paymentDomainService.
 * Idempotência via payment_events; lookup por gateway_reference_id.
 * Fase 3 — PLANO-REFATORACAO-MULTI-GATEWAY.
 */
import type { GatewayWebhookParser, ParsedWebhookPayload } from '../paymentGatewayTypes.js';
import { getInvoiceByGatewayReferenceId } from '../../../services/invoiceService.js';
import { findCustomerInvoiceByGatewayReference } from '../../../services/customerInvoiceService.js';
import { findInvoiceAttemptByGatewayReference } from '../../../services/customerInvoicePaymentAttemptsService.js';
import { findTenantBillingPaymentAttemptByGatewayReference } from '../../../services/tenantBillingPaymentAttemptsService.js';
import { normalizeGatewayStatus } from './statusNormalizer.js';
import { insertPaymentEvent, markPaymentEventProcessed } from './paymentEventsService.js';
import {
  applyPaymentEvent,
  applyPaymentAttemptEvent,
  applyTenantBillingPaymentAttemptEvent,
} from './paymentDomainService.js';

const parsers = new Map<string, GatewayWebhookParser>();

export function registerGatewayParser(gatewayKey: string, parser: GatewayWebhookParser): void {
  parsers.set(gatewayKey, parser);
}

export type BillingOrInvoice =
  | { entityType: 'tenant_billing'; entityId: string; currentStatus: string; gateway: string | null }
  | { entityType: 'customer_invoice'; entityId: string; currentStatus: string; gateway: string | null };

/**
 * Busca em tenant_billing e, se não achar, em customer_invoices por (gateway, gateway_reference_id).
 */
export async function findBillingOrCustomerInvoice(
  gateway: string,
  referenceId: string
): Promise<BillingOrInvoice | null> {
  const billing = await getInvoiceByGatewayReferenceId(gateway, referenceId);
  if (billing) {
    return {
      entityType: 'tenant_billing',
      entityId: billing.id,
      currentStatus: billing.status,
      gateway: billing.gateway,
    };
  }
  const invoice = await findCustomerInvoiceByGatewayReference(gateway, referenceId);
  if (invoice) {
    return {
      entityType: 'customer_invoice',
      entityId: invoice.id,
      currentStatus: invoice.status,
      gateway: invoice.gateway,
    };
  }
  return null;
}

export interface HandleWebhookResult {
  status: 200 | 400 | 500;
  body: { received?: boolean; error?: string };
}

/**
 * Processa webhook: idempotência, parse, find, normalizar, aplicar status.
 * Retorna resultado para o controller responder (200/400/500).
 */
export async function handleWebhook(
  gatewayKey: string,
  payload: unknown
): Promise<HandleWebhookResult> {
  const parser = parsers.get(gatewayKey);
  if (!parser) {
    return { status: 400, body: { error: `Gateway desconhecido: ${gatewayKey}` } };
  }

  let parsed: ParsedWebhookPayload;
  try {
    parsed = parser.parsePayload(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 400, body: { error: `Payload inválido: ${msg}` } };
  }

  const { eventId, referenceId, externalStatus, metadata } = parsed;
  const payloadObj = (payload && typeof payload === 'object' && !Array.isArray(payload))
    ? (payload as Record<string, unknown>)
    : {};

  const { inserted, alreadyProcessed } = await insertPaymentEvent({
    gateway: gatewayKey,
    eventId,
    referenceId,
    payload: payloadObj,
  });

  if (!inserted) {
    return { status: 200, body: { received: true } };
  }

  const internalStatus = normalizeGatewayStatus(gatewayKey, externalStatus);
  const paymentMethod =
    metadata && typeof metadata === 'object' && typeof (metadata as { paymentMethod?: string }).paymentMethod === 'string'
      ? (metadata as { paymentMethod: string }).paymentMethod
      : null;

  const attempt = await findInvoiceAttemptByGatewayReference(gatewayKey, referenceId);
  if (attempt) {
    const { pool } = await import('../../../utils/db.js');
    const invoiceRow = await pool.query<{ status: string }>(
      `SELECT status FROM customer_invoices WHERE id = $1 LIMIT 1`,
      [attempt.invoice_id]
    );
    const invoiceCurrentStatus = invoiceRow.rows[0]?.status ?? 'pending';
    const processedResult = await applyPaymentAttemptEvent({
      attemptId: attempt.id,
      invoiceId: attempt.invoice_id,
      invoiceCurrentStatus,
      internalStatus,
      gatewayStatus: externalStatus,
      paidAt: internalStatus === 'paid' ? new Date() : undefined,
    });
    await markPaymentEventProcessed({
      gateway: gatewayKey,
      eventId,
      processedResult,
    });
    return { status: 200, body: { received: true } };
  }

  const tbAttempt = await findTenantBillingPaymentAttemptByGatewayReference(gatewayKey, referenceId);
  if (tbAttempt) {
    const { pool } = await import('../../../utils/db.js');
    const billingRow = await pool.query<{ status: string }>(
      `SELECT status FROM tenant_billing WHERE id = $1 LIMIT 1`,
      [tbAttempt.billing_id]
    );
    const billingCurrentStatus = billingRow.rows[0]?.status ?? 'pending';
    const processedResult = await applyTenantBillingPaymentAttemptEvent({
      attemptId: tbAttempt.id,
      billingId: tbAttempt.billing_id,
      billingCurrentStatus,
      internalStatus,
      gatewayStatus: externalStatus,
      paidAt: internalStatus === 'paid' ? new Date() : undefined,
    });
    await markPaymentEventProcessed({
      gateway: gatewayKey,
      eventId,
      processedResult,
    });
    return { status: 200, body: { received: true } };
  }

  let entity = await findBillingOrCustomerInvoice(gatewayKey, referenceId);
  if (!entity) {
    const meta =
      metadata && typeof metadata === 'object'
        ? (metadata as {
            conciliationIdentifier?: string;
            pixQrCodeId?: string;
          })
        : {};
    const conciliationCandidates = [
      typeof meta.conciliationIdentifier === 'string' ? meta.conciliationIdentifier.trim() : '',
      typeof meta.pixQrCodeId === 'string' ? meta.pixQrCodeId.trim() : '',
    ].filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

    for (const conciliationId of conciliationCandidates) {
      try {
        const { findTenantBillingByPixAutomaticConciliation } = await import(
          '../../../services/billing2/billingPixAutomaticService.js'
        );
        const { updateInvoiceGatewayData } = await import('../../../services/invoiceService.js');
        const byConc = await findTenantBillingByPixAutomaticConciliation(conciliationId);
        if (byConc) {
          await updateInvoiceGatewayData(byConc.id, {
            gateway: byConc.gateway ?? gatewayKey,
            payment_method: 'PIX',
            gateway_reference_id: referenceId,
            gateway_status: externalStatus,
            gateway_metadata: {
              pix_automatic_conciliation_id: conciliationId,
              pix_automatic_journey: 'authorization',
            },
          });
          entity = {
            entityType: 'tenant_billing',
            entityId: byConc.id,
            currentStatus: byConc.status,
            gateway: byConc.gateway,
          };
          break;
        }
      } catch (e) {
        console.error('[webhookCore] pix automatic conciliation lookup', e);
      }
    }
  }
  if (!entity) {
    await markPaymentEventProcessed({
      gateway: gatewayKey,
      eventId,
      processedResult: {
        previous_status: 'n/a',
        new_status: normalizeGatewayStatus(gatewayKey, externalStatus),
        action: 'no_change',
        reason: 'Entidade não encontrada (tenant_billing nem customer_invoice)',
      },
    });
    return { status: 200, body: { received: true } };
  }

  const processedResult = await applyPaymentEvent({
    entityType: entity.entityType,
    entityId: entity.entityId,
    currentStatus: entity.currentStatus,
    internalStatus,
    gatewayStatus: externalStatus,
    paidAt: internalStatus === 'paid' ? new Date() : undefined,
    paymentMethod: paymentMethod ?? undefined,
  });

  await markPaymentEventProcessed({
    gateway: gatewayKey,
    eventId,
    processedResult,
  });

  return { status: 200, body: { received: true } };
}

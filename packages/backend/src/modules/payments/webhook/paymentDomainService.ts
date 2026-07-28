/**
 * Regras de negócio do webhook: validar progressão, aplicar status, ativar plano.
 * Fase 3 — PLANO-REFATORACAO-MULTI-GATEWAY.
 */
import type { InternalPaymentStatus } from '../paymentGatewayTypes.js';
import { canTransition } from './statusNormalizer.js';
import { updateInvoiceStatus } from '../../../services/invoiceService.js';
import { updateCustomerInvoiceStatus } from '../../../services/customerInvoiceService.js';
import { updateInvoicePaymentAttemptStatus } from '../../../services/customerInvoicePaymentAttemptsService.js';
import { activatePlanFromBilling } from '../../../services/subscriptionService.js';
import type { ProcessedResult } from './paymentEventsService.js';
import { billingLog } from '../../../services/billingLogger.js';
import { deleteGatewayChargeIfSafe } from '../../../services/billingGatewayChargeService.js';
import {
  listPendingAttemptsForInvoiceExcept,
  markAttemptCancelledSuperseded,
} from '../../../services/customerInvoicePaymentAttemptsService.js';
import {
  updateTenantBillingPaymentAttemptStatus,
  activateTenantBillingPaymentAttempt,
  type TbAttemptStatus,
} from '../../../services/tenantBillingPaymentAttemptsService.js';
import { updateInvoiceGatewayData } from '../../../services/invoiceService.js';
import { createClientTimelineEvent } from '../../../services/clientTimelineEventsService.js';

export interface ApplyPaymentEventParams {
  entityType: 'tenant_billing' | 'customer_invoice';
  entityId: string;
  currentStatus: string;
  internalStatus: InternalPaymentStatus;
  gatewayStatus: string | null;
  paidAt?: Date | null;
  paymentMethod?: string | null;
}

export interface ApplyPaymentAttemptEventParams {
  attemptId: string;
  invoiceId: string;
  invoiceCurrentStatus: string;
  internalStatus: InternalPaymentStatus;
  gatewayStatus: string | null;
  paidAt?: Date | null;
}

/**
 * Aplica evento de pagamento: valida transição, atualiza status/gateway_status, ativa plano se paid (tenant_billing).
 */
export async function applyPaymentEvent(params: ApplyPaymentEventParams): Promise<ProcessedResult> {
  const {
    entityType,
    entityId,
    currentStatus,
    internalStatus,
    gatewayStatus,
    paidAt,
    paymentMethod,
  } = params;

  if (!canTransition(currentStatus, internalStatus)) {
    await updateGatewayStatusOnly(entityType, entityId, gatewayStatus);
    return {
      previous_status: currentStatus,
      new_status: internalStatus,
      action: 'skipped_regression',
      reason: `Regressão bloqueada: ${currentStatus} não pode voltar para ${internalStatus}`,
    };
  }

  if (entityType === 'tenant_billing') {
    await updateInvoiceStatus(
      entityId,
      internalStatus as 'pending' | 'paid' | 'overdue' | 'cancelled',
      internalStatus === 'paid' ? paidAt ?? new Date() : undefined,
      paymentMethod ?? null,
      gatewayStatus
    );
    if (internalStatus === 'paid') {
      await activatePlanFromBilling(entityId);
      if (currentStatus !== 'paid') {
        const { schedulePublishPlatformBillingPaymentConfirmed } = await import(
          '../../../services/platformNotifications/platformBusinessNotifications.js'
        );
        schedulePublishPlatformBillingPaymentConfirmed(entityId);
      }
      // Sprint 5 — limpa past_due → active (independente do engine; fail-open)
      try {
        const { getInvoiceById } = await import('../../../services/invoiceService.js');
        const inv = await getInvoiceById(entityId);
        if (inv?.subscription_id) {
          const { clearSubscriptionPastDueOnPaid } = await import(
            '../../../services/collectionPolicy/subscriptionPastDueWriter.js'
          );
          const { tenantBillingCorrelationId } = await import(
            '../../../services/billing2/billingCorrelationId.js'
          );
          await clearSubscriptionPastDueOnPaid({
            subscriptionId: inv.subscription_id,
            billingId: entityId,
            correlationId: tenantBillingCorrelationId(entityId),
          });
        }
        // Sprint B — cancela cobranças abertas deste ciclo (ex. Pix Auto + attempts); auth intacta.
        if (inv?.tenant_id) {
          const { cancelOpenTenantBillingCycleChargesAfterPaid } = await import(
            '../../../services/billingGatewayChargeService.js'
          );
          await cancelOpenTenantBillingCycleChargesAfterPaid({
            billingId: entityId,
            tenantId: inv.tenant_id,
            keepGatewayReferenceId: inv.gateway_reference_id,
            gatewayKeyFallback: inv.gateway,
            gatewayStatusRawForExtras: gatewayStatus,
          }).catch((err) =>
            console.error('[applyPaymentEvent] cycle_paid_cleanup failed:', err)
          );
        }
      } catch (clearErr: unknown) {
        console.warn(
          '[applyPaymentEvent] clear past_due / cycle cleanup skipped',
          clearErr instanceof Error ? clearErr.message : clearErr
        );
      }
      // Billing 2.0 Sprint 3 — extension point (noop se engine flag OFF).
      const { scheduleCollectionPolicyExtensionPoint } = await import(
        '../../../services/collectionPolicy/hook.js'
      );
      const { tenantBillingCorrelationId } = await import(
        '../../../services/billing2/billingCorrelationId.js'
      );
      scheduleCollectionPolicyExtensionPoint({
        type: 'payment.paid',
        occurred_at: new Date().toISOString(),
        billing_id: entityId,
        correlation_id: tenantBillingCorrelationId(entityId),
        attempt: 1,
        metadata: {
          previous_status: currentStatus,
          payment_method: paymentMethod ?? null,
        },
      });
    }
    return {
      previous_status: currentStatus,
      new_status: internalStatus,
      action: currentStatus === internalStatus ? 'no_change' : 'status_updated',
      reason: `tenant_billing ${entityId} → ${internalStatus}`,
    };
  }

  await updateCustomerInvoiceStatus(
    entityId,
    internalStatus,
    internalStatus === 'paid' ? paidAt ?? new Date() : undefined,
    gatewayStatus
  );
  if (internalStatus === 'paid') {
    const { pool } = await import('../../../utils/db.js');
    const invoiceRow = await pool.query<{
      charge_id: string | null;
      tenant_id: string | null;
      gateway_reference_id: string | null;
      client_id: string | null;
    }>(
      'SELECT charge_id, tenant_id, gateway_reference_id, client_id FROM customer_invoices WHERE id = $1 LIMIT 1',
      [entityId]
    );
    const invoice = invoiceRow.rows[0];
    const chargeId = invoice?.charge_id ?? null;
    if (chargeId) {
      const { recalculateChargeStatus } = await import('../../../services/customerChargesService.js');
      await recalculateChargeStatus(chargeId).catch((err) =>
        console.error('[paymentDomainService] recalculateChargeStatus failed:', err)
      );
    }

    /**
     * Limpeza pós-pagamento (Asaas):
     * excluir no gateway todas as outras cobranças abertas para a mesma invoice.
     * - não cancela a tentativa que foi paga
     * - falhas no cancel são tratadas silenciosamente (sem quebrar fluxo)
     * - idempotente via seleção somente de tentativas pendentes (pending/waiting/processing/overdue).
     */
    const tenantId = invoice?.tenant_id;
    const clientId = invoice?.client_id ?? null;
    const invoiceGatewayReferenceId = invoice?.gateway_reference_id ?? null;

    if (tenantId && clientId) {
      await createClientTimelineEvent({
        tenantId,
        clientId,
        eventName: 'invoice_paid',
        source: 'finance',
        actorType: 'system',
        actorId: null,
        referenceType: 'customer_invoice',
        referenceId: entityId,
        eventKey: `invoice_paid:${entityId}`,
        metadata: {
          gateway_status: gatewayStatus,
        },
      });
    }

    if (tenantId && invoiceGatewayReferenceId) {
      // Tentativa paga atual: preferimos a que bate com gateway_reference_id da invoice.
      const paidAttemptRow = await pool.query<{ id: string; gateway_reference_id: string | null }>(
        `SELECT id, gateway_reference_id
         FROM customer_invoice_payment_attempts
         WHERE invoice_id = $1 AND gateway_reference_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [entityId, invoiceGatewayReferenceId]
      );
      const paidAttemptId = paidAttemptRow.rows[0]?.id ?? null;
      const paidAttemptGatewayReferenceId = paidAttemptRow.rows[0]?.gateway_reference_id ?? null;

      if (paidAttemptId) {
        billingLog('invoice', 'payment_cleanup_started', {
          invoice_id: entityId,
          attempt_id: paidAttemptId,
          gateway_reference_id: paidAttemptGatewayReferenceId ?? undefined,
        });

        try {
          const rows = await listPendingAttemptsForInvoiceExcept(entityId, paidAttemptId);
          for (const row of rows) {
            const refId = row.gateway_reference_id ?? '';
            if (!refId) continue;

            let cancelled = false;
            let cancelError: string | undefined;
            try {
              const del = await deleteGatewayChargeIfSafe({
                tenantId,
                gatewayKey: row.gateway,
                gatewayReferenceId: refId,
                gatewayStatusRaw: row.gateway_status,
                ctx: {
                  invoice_id: entityId,
                  attempt_id: row.id,
                  reason: 'superseded_by_paid',
                },
              });
              cancelled = del.deleted === true || del.skipped === true;
              if (!cancelled && del.error) cancelError = del.error;
            } catch (e) {
              cancelError = e instanceof Error ? e.message : String(e);
            }

            if (cancelled) {
              billingLog('invoice', 'payment_cleanup_cancel_success', {
                invoice_id: entityId,
                attempt_id: row.id,
                gateway_reference_id: refId,
              });
            } else {
              billingLog('invoice', 'payment_cleanup_cancel_failed', {
                invoice_id: entityId,
                attempt_id: row.id,
                gateway_reference_id: refId,
                error: cancelError ?? 'cancel_skipped_or_failed',
              });
            }

            // Atualização no banco para manter consistência (histórico preservado).
            try {
              await markAttemptCancelledSuperseded(row.id, {
                reason: 'superseded_by_other_attempt_paid',
                superseded_by: 'paid_other',
              });
            } catch (dbErr) {
              billingLog('invoice', 'payment_cleanup_cancel_failed', {
                invoice_id: entityId,
                attempt_id: row.id,
                gateway_reference_id: refId,
                error: dbErr instanceof Error ? dbErr.message : String(dbErr),
              });
            }
          }
        } catch (cleanupErr) {
          console.error('[paymentDomainService] payment_cleanup failed:', cleanupErr);
        } finally {
          billingLog('invoice', 'payment_cleanup_completed', {
            invoice_id: entityId,
            attempt_id: paidAttemptId,
            gateway_reference_id: paidAttemptGatewayReferenceId ?? undefined,
          });
        }
      }
    }
  }
  return {
    previous_status: currentStatus,
    new_status: internalStatus,
    action: currentStatus === internalStatus ? 'no_change' : 'status_updated',
    reason: `customer_invoice ${entityId} → ${internalStatus}`,
  };
}

/**
 * Aplica evento em tentativa de pagamento e consolida status na fatura agregada.
 * Fase 2: tentativa é atualizada primeiro; invoice só evolui sem regressão.
 */
/**
 * Webhook em cobrança vinculada a `tenant_billing_payment_attempts` (checkout plano SaaS).
 */
export async function applyTenantBillingPaymentAttemptEvent(params: {
  attemptId: string;
  billingId: string;
  billingCurrentStatus: string;
  internalStatus: InternalPaymentStatus;
  gatewayStatus: string | null;
  paidAt?: Date;
}): Promise<ProcessedResult> {
  const { attemptId, billingId, billingCurrentStatus, internalStatus, gatewayStatus, paidAt } = params;

  await updateTenantBillingPaymentAttemptStatus({
    attemptId,
    status: internalStatus as TbAttemptStatus,
    gatewayStatus,
    paidAt: internalStatus === 'paid' ? paidAt ?? new Date() : undefined,
  });

  let paymentMethodForAggregate: string | null = null;
  let keepGatewayReferenceId: string | null = null;
  let prevInvoiceGatewayReferenceId: string | null = null;
  let tenantIdForCleanup: string | null = null;
  let gatewayKeyForCleanup: string | null = null;

  if (internalStatus === 'paid') {
    const { pool } = await import('../../../utils/db.js');
    const { getInvoiceById } = await import('../../../services/invoiceService.js');
    const before = await getInvoiceById(billingId);
    prevInvoiceGatewayReferenceId = before?.gateway_reference_id?.trim() || null;
    tenantIdForCleanup = before?.tenant_id ?? null;

    const attRow = await pool.query<{
      payment_method: string;
      gateway: string;
      gateway_reference_id: string | null;
      gateway_metadata: unknown;
      idempotency_key: string | null;
    }>(
      `SELECT payment_method, gateway, gateway_reference_id, gateway_metadata, idempotency_key
       FROM tenant_billing_payment_attempts WHERE id = $1 LIMIT 1`,
      [attemptId]
    );
    const att = attRow.rows[0];
    if (att) {
      paymentMethodForAggregate = att.payment_method;
      keepGatewayReferenceId = att.gateway_reference_id?.trim() || null;
      gatewayKeyForCleanup = att.gateway;
      await activateTenantBillingPaymentAttempt(billingId, attemptId);
      await updateInvoiceGatewayData(billingId, {
        gateway: att.gateway,
        payment_method: att.payment_method,
        gateway_reference_id: att.gateway_reference_id,
        gateway_metadata:
          att.gateway_metadata && typeof att.gateway_metadata === 'object'
            ? (att.gateway_metadata as Record<string, unknown>)
            : {},
        gateway_status: gatewayStatus,
        idempotency_key: att.idempotency_key,
      });
    }
  }

  const processed = await applyPaymentEvent({
    entityType: 'tenant_billing',
    entityId: billingId,
    currentStatus: billingCurrentStatus,
    internalStatus,
    gatewayStatus,
    paidAt,
    paymentMethod: paymentMethodForAggregate ?? undefined,
  });

  // applyPaymentEvent já limpa attempts irmãos com keep = ref atual.
  // Garante cancel da ref anterior na linha principal (ex. instrução Pix Auto) se foi sobrescrita.
  if (
    internalStatus === 'paid' &&
    tenantIdForCleanup &&
    prevInvoiceGatewayReferenceId &&
    keepGatewayReferenceId &&
    prevInvoiceGatewayReferenceId !== keepGatewayReferenceId
  ) {
    const { cancelOpenTenantBillingCycleChargesAfterPaid } = await import(
      '../../../services/billingGatewayChargeService.js'
    );
    await cancelOpenTenantBillingCycleChargesAfterPaid({
      billingId,
      tenantId: tenantIdForCleanup,
      keepGatewayReferenceId,
      paidAttemptId: attemptId,
      extraCancelReferenceIds: [prevInvoiceGatewayReferenceId],
      gatewayKeyFallback: gatewayKeyForCleanup,
      gatewayStatusRawForExtras: gatewayStatus,
    }).catch((err) =>
      console.error('[applyTenantBillingPaymentAttemptEvent] cycle_paid_cleanup extras failed:', err)
    );
  }

  return processed;
}

export async function applyPaymentAttemptEvent(
  params: ApplyPaymentAttemptEventParams
): Promise<ProcessedResult> {
  const { attemptId, invoiceId, invoiceCurrentStatus, internalStatus, gatewayStatus, paidAt } = params;

  await updateInvoicePaymentAttemptStatus({
    attemptId,
    status: internalStatus,
    gatewayStatus,
    paidAt: internalStatus === 'paid' ? paidAt ?? new Date() : undefined,
  });

  if (!canTransition(invoiceCurrentStatus, internalStatus)) {
    await updateCustomerInvoiceStatus(invoiceId, invoiceCurrentStatus, undefined, gatewayStatus);
    return {
      previous_status: invoiceCurrentStatus,
      new_status: internalStatus,
      action: 'skipped_regression',
      reason: `Tentativa ${attemptId} atualizada; regressão bloqueada na invoice ${invoiceId}`,
    };
  }

  await updateCustomerInvoiceStatus(
    invoiceId,
    internalStatus,
    internalStatus === 'paid' ? paidAt ?? new Date() : undefined,
    gatewayStatus
  );

  if (internalStatus === 'paid') {
    const { pool } = await import('../../../utils/db.js');
    const chargeRow = await pool.query<{ charge_id: string | null }>(
      'SELECT charge_id FROM customer_invoices WHERE id = $1',
      [invoiceId]
    );
    const chargeId = chargeRow.rows[0]?.charge_id ?? null;
    if (chargeId) {
      const { recalculateChargeStatus } = await import('../../../services/customerChargesService.js');
      await recalculateChargeStatus(chargeId).catch((err) =>
        console.error('[paymentDomainService] recalculateChargeStatus failed:', err)
      );
    }
    const tenantRow = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM customer_invoices WHERE id = $1',
      [invoiceId]
    );
    const tenantId = tenantRow.rows[0]?.tenant_id;
    const clientRow = await pool.query<{ client_id: string | null }>(
      'SELECT client_id FROM customer_invoices WHERE id = $1',
      [invoiceId]
    );
    const clientId = clientRow.rows[0]?.client_id ?? null;
    if (tenantId && clientId) {
      await createClientTimelineEvent({
        tenantId,
        clientId,
        eventName: 'invoice_paid',
        source: 'finance',
        actorType: 'system',
        actorId: null,
        referenceType: 'customer_invoice',
        referenceId: invoiceId,
        eventKey: `invoice_paid:${invoiceId}`,
        metadata: {
          gateway_status: gatewayStatus,
        },
      });
    }
    if (tenantId) {
      const { supersedeOtherPendingAttemptsAfterPaid } = await import(
        '../../../services/billingGatewayChargeService.js'
      );
      await supersedeOtherPendingAttemptsAfterPaid(invoiceId, attemptId, tenantId).catch((err) =>
        console.error('[paymentDomainService] supersedeOtherPendingAttemptsAfterPaid failed:', err)
      );
    }
  }

  return {
    previous_status: invoiceCurrentStatus,
    new_status: internalStatus,
    action: invoiceCurrentStatus === internalStatus ? 'no_change' : 'status_updated',
    reason: `Tentativa ${attemptId} consolidada na invoice ${invoiceId} -> ${internalStatus}`,
  };
}

async function updateGatewayStatusOnly(
  entityType: 'tenant_billing' | 'customer_invoice',
  entityId: string,
  gatewayStatus: string | null
): Promise<void> {
  const { pool } = await import('../../../utils/db.js');
  if (entityType === 'tenant_billing') {
    await pool.query(
      `UPDATE tenant_billing SET gateway_status = COALESCE($1, gateway_status), updated_at = now() WHERE id = $2`,
      [gatewayStatus, entityId]
    );
  } else {
    await pool.query(
      `UPDATE customer_invoices SET gateway_status = COALESCE($1, gateway_status), updated_at = now() WHERE id = $2`,
      [gatewayStatus, entityId]
    );
  }
}

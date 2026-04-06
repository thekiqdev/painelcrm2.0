/**
 * Troca de método / preparação de cobrança no checkout SaaS — mesma linha de raciocínio de
 * `ensureReusablePaymentAttemptForSwitch` (faturas CRM): tentativa reutilizável por método,
 * idempotência, hidratação a partir da fatura principal, createCharge só quando necessário.
 */
import { pool } from '../utils/db.js';
import {
  buildSaasCheckoutChargeIdempotencyKey,
  getInvoiceById,
  updateInvoiceGatewayData,
  type TenantBillingRow,
} from './invoiceService.js';
import {
  isAttemptChargeStillUsable,
  OPEN_REUSABLE_ATTEMPT_STATUSES,
  type PaymentUrls,
} from './invoicePaymentAttemptReuseService.js';
import type { InvoiceAttemptStatus } from './customerInvoicePaymentAttemptsService.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import type { PaymentGateway, PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { billingLog } from './billingLogger.js';
import {
  activateTenantBillingPaymentAttempt,
  createTenantBillingPaymentAttempt,
  findReusableTenantBillingPaymentAttempt,
  getTenantBillingPaymentAttemptByIdempotency,
  hasTenantBillingPaymentAttemptsTable,
  markTenantBillingAttemptCancelledSuperseded,
  type TbAttemptPaymentMethod,
  type TenantBillingPaymentAttemptRow,
} from './tenantBillingPaymentAttemptsService.js';

function normPm(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase();
}

function paymentUrlsFromAttemptMeta(m: Record<string, unknown>): PaymentUrls {
  return {
    invoiceUrl: typeof m.invoiceUrl === 'string' ? m.invoiceUrl : undefined,
    bankSlipUrl: typeof m.bankSlipUrl === 'string' ? m.bankSlipUrl : undefined,
    bankSlipDigitableLine:
      typeof m.bankSlipDigitableLine === 'string' ? m.bankSlipDigitableLine : undefined,
    pixQrCode: typeof m.pixQrCode === 'string' ? m.pixQrCode : undefined,
    pixCopyPaste: typeof m.pixCopyPaste === 'string' ? m.pixCopyPaste : undefined,
  };
}

function urlsFromBillingGatewayMeta(meta: Record<string, unknown>): PaymentUrls {
  return paymentUrlsFromAttemptMeta(meta);
}

/** Payload já salvo em metadata — evita GET /payments no checkout quando status da linha já é reutilizável. */
function planCheckoutHasLocalPayload(method: PaymentMethod, urls: PaymentUrls): boolean {
  if (method === 'PIX') {
    return !!(urls.pixQrCode?.trim() || urls.pixCopyPaste?.trim());
  }
  if (method === 'BOLETO') {
    return !!(
      urls.bankSlipUrl?.trim() ||
      urls.invoiceUrl?.trim() ||
      urls.bankSlipDigitableLine?.trim()
    );
  }
  if (method === 'CREDIT_CARD') {
    return !!urls.invoiceUrl?.trim();
  }
  return false;
}

export type EnsureSaasPlanCheckoutAttemptResult = {
  billing: TenantBillingRow;
  paymentUrls: PaymentUrls;
};

export type EnsureSaasPlanCheckoutAttemptParams = {
  billing: TenantBillingRow;
  tenantId: string;
  requestedMethod: PaymentMethod;
  gateway: PaymentGateway;
  gatewayKey: string;
  amountCents: number;
  dueDateStr: string;
  invoiceNumber: string;
  /** Só necessário ao criar nova cobrança no gateway; reuso/hidratação não chamam ensureCustomer. */
  idempotencyKey?: string | null;
};

/**
 * Único fluxo de cobrança no checkout do plano quando a tabela de tentativas existe:
 * reuso por método → hidratação da linha principal → createCharge só se necessário.
 * Não cancela cobrança anterior no gateway ao trocar de método (permite reutilizar ao voltar).
 */
export async function ensureSaasPlanCheckoutPaymentAttemptForSwitch(
  params: EnsureSaasPlanCheckoutAttemptParams
): Promise<EnsureSaasPlanCheckoutAttemptResult> {
  const {
    billing: billingInput,
    tenantId,
    requestedMethod,
    gateway,
    gatewayKey,
    amountCents,
    dueDateStr,
    invoiceNumber,
    idempotencyKey,
  } = params;

  if (!(await hasTenantBillingPaymentAttemptsTable())) {
    throw new Error('tenant_billing_payment_attempts não disponível');
  }

  if (!gateway.createCharge) {
    throw new Error('Gateway de pagamento não suporta criação de cobrança');
  }

  const billingId = billingInput.id;
  const reqMethod = requestedMethod as TbAttemptPaymentMethod;

  if (idempotencyKey?.trim()) {
    const byIdem = await getTenantBillingPaymentAttemptByIdempotency(
      billingId,
      reqMethod,
      idempotencyKey.trim()
    );
    if (byIdem && OPEN_REUSABLE_ATTEMPT_STATUSES.has(byIdem.status as InvoiceAttemptStatus)) {
      await activateTenantBillingPaymentAttempt(billingId, byIdem.id);
      await updateInvoiceGatewayData(billingId, {
        gateway: byIdem.gateway,
        payment_method: byIdem.payment_method,
        gateway_reference_id: byIdem.gateway_reference_id,
        gateway_status: byIdem.gateway_status,
        idempotency_key: byIdem.idempotency_key,
        gateway_metadata: byIdem.gateway_metadata ?? {},
      });
      const m = (byIdem.gateway_metadata ?? {}) as Record<string, unknown>;
      const refreshed = await getInvoiceById(billingId);
      return {
        billing: refreshed ?? billingInput,
        paymentUrls: paymentUrlsFromAttemptMeta(m),
      };
    }
  }

  const openRow = await findReusableTenantBillingPaymentAttempt(billingId, reqMethod);
  if (openRow) {
    const mOpen = (openRow.gateway_metadata ?? {}) as Record<string, unknown>;
    const openUrls = paymentUrlsFromAttemptMeta(mOpen);
    const trustOpenLocal =
      planCheckoutHasLocalPayload(requestedMethod, openUrls) ||
      (requestedMethod === 'CREDIT_CARD' && !!openRow.gateway_reference_id?.trim());
    let openUsable = trustOpenLocal;
    if (!trustOpenLocal) {
      openUsable = await isAttemptChargeStillUsable(gateway, gatewayKey, openRow.gateway_reference_id);
    }
    if (openUsable) {
      await activateTenantBillingPaymentAttempt(billingId, openRow.id);
      await updateInvoiceGatewayData(billingId, {
        gateway: openRow.gateway,
        payment_method: openRow.payment_method,
        gateway_reference_id: openRow.gateway_reference_id,
        gateway_status: openRow.gateway_status,
        idempotency_key: openRow.idempotency_key,
        gateway_metadata: openRow.gateway_metadata ?? {},
      });
      billingLog('invoice', trustOpenLocal ? 'plan_checkout_switch_reuse_attempt_local' : 'plan_checkout_switch_reuse_attempt', {
        billing_id: billingId,
        attempt_id: openRow.id,
        gateway_reference_id: openRow.gateway_reference_id ?? undefined,
        payment_method: openRow.payment_method,
      });
      const refreshed = await getInvoiceById(billingId);
      return {
        billing: refreshed ?? billingInput,
        paymentUrls: paymentUrlsFromAttemptMeta(mOpen),
      };
    }

    await markTenantBillingAttemptCancelledSuperseded(openRow.id, {
      reason: 'charge_stale_or_removed_in_gateway',
      superseded_by: 'switch',
    });
    billingLog('invoice', 'plan_checkout_switch_reuse_invalidated', {
      billing_id: billingId,
      attempt_id: openRow.id,
      payment_method: openRow.payment_method,
    });
  }

  const billingRow = await pool.query<{
    payment_method: string | null;
    gateway_reference_id: string | null;
    gateway_metadata: Record<string, unknown> | null;
    gateway_status: string | null;
    idempotency_key: string | null;
    gateway: string | null;
  }>(
    `SELECT payment_method, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key, gateway
     FROM tenant_billing
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [billingId, tenantId]
  );

  const invoicePaymentMethod = billingRow.rows[0]?.payment_method ?? null;
  const invoiceGatewayReferenceId = billingRow.rows[0]?.gateway_reference_id ?? null;
  if (normPm(invoicePaymentMethod) === normPm(requestedMethod) && invoiceGatewayReferenceId) {
    const invoiceMetadata = (billingRow.rows[0]?.gateway_metadata ?? {}) as Record<string, unknown>;
    const invUrls = urlsFromBillingGatewayMeta(invoiceMetadata);
    const trustInvoiceLocal =
      planCheckoutHasLocalPayload(requestedMethod, invUrls) ||
      (requestedMethod === 'CREDIT_CARD' && !!invoiceGatewayReferenceId.trim());
    let gateInvoiceOk = trustInvoiceLocal;
    if (!trustInvoiceLocal) {
      gateInvoiceOk = await isAttemptChargeStillUsable(gateway, gatewayKey, invoiceGatewayReferenceId);
    }
    if (gateInvoiceOk) {
      const invoiceGatewayStatus = billingRow.rows[0]?.gateway_status ?? null;
      const inferredStatus = normalizeGatewayStatus(gatewayKey, invoiceGatewayStatus);

      let hydratedAttempt: TenantBillingPaymentAttemptRow | null = null;
      try {
        hydratedAttempt = await createTenantBillingPaymentAttempt({
          billing_id: billingId,
          tenant_id: tenantId,
          gateway: gatewayKey,
          payment_method: reqMethod,
          status: inferredStatus as TenantBillingPaymentAttemptRow['status'],
          gateway_status: invoiceGatewayStatus,
          gateway_reference_id: invoiceGatewayReferenceId,
          gateway_metadata: invoiceMetadata,
          idempotency_key: billingRow.rows[0]?.idempotency_key ?? null,
          is_active: true,
        });
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          const winner = await findReusableTenantBillingPaymentAttempt(billingId, reqMethod);
          if (winner) {
            const wm = (winner.gateway_metadata ?? {}) as Record<string, unknown>;
            const wUrls = paymentUrlsFromAttemptMeta(wm);
            const trustWinner =
              planCheckoutHasLocalPayload(requestedMethod, wUrls) ||
              (requestedMethod === 'CREDIT_CARD' && !!winner.gateway_reference_id?.trim());
            let usableWinner = trustWinner;
            if (!trustWinner) {
              usableWinner = await isAttemptChargeStillUsable(
                gateway,
                gatewayKey,
                winner.gateway_reference_id
              );
            }
            if (usableWinner) {
              await activateTenantBillingPaymentAttempt(billingId, winner.id);
              await updateInvoiceGatewayData(billingId, {
                gateway: winner.gateway,
                payment_method: winner.payment_method,
                gateway_reference_id: winner.gateway_reference_id,
                gateway_status: winner.gateway_status,
                idempotency_key: winner.idempotency_key,
                gateway_metadata: winner.gateway_metadata ?? {},
              });
              const m = (winner.gateway_metadata ?? {}) as Record<string, unknown>;
              const refreshed = await getInvoiceById(billingId);
              return {
                billing: refreshed ?? billingInput,
                paymentUrls: paymentUrlsFromAttemptMeta(m),
              };
            }
          }
        }
        throw err;
      }

      if (hydratedAttempt) {
        const m = (hydratedAttempt.gateway_metadata ?? {}) as Record<string, unknown>;
        billingLog('invoice', 'plan_checkout_hydrated_attempt', {
          billing_id: billingId,
          attempt_id: hydratedAttempt.id,
          payment_method: hydratedAttempt.payment_method,
        });
        const refreshed = await getInvoiceById(billingId);
        return {
          billing: refreshed ?? billingInput,
          paymentUrls: paymentUrlsFromAttemptMeta(m),
        };
      }
    }
  }

  const generatedIdem = buildSaasCheckoutChargeIdempotencyKey(billingId, requestedMethod);
  const allowedPaymentMethods: PaymentMethod[] = ['PIX', 'BOLETO', 'CREDIT_CARD'];

  const customerId = await gateway.ensureCustomer?.(tenantId);
  if (!customerId) throw new Error('ensureCustomer não retornou customerId');

  const chargeResult = await gateway.createCharge({
    customerId,
    amountCents,
    dueDate: dueDateStr,
    paymentMethod: requestedMethod,
    allowedPaymentMethods,
    description: invoiceNumber,
    idempotencyKey: generatedIdem,
    externalReference: tenantId,
  });

  const attemptMetadata = {
    invoiceUrl: chargeResult.invoiceUrl,
    bankSlipUrl: chargeResult.bankSlipUrl,
    bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
    pixQrCode: chargeResult.pixQrCode,
    pixCopyPaste: chargeResult.pixCopyPaste,
    allowed_payment_methods: allowedPaymentMethods,
  };

  try {
    const createdAttempt = await createTenantBillingPaymentAttempt({
      billing_id: billingId,
      tenant_id: tenantId,
      gateway: gatewayKey,
      payment_method: reqMethod,
      status: normalizeGatewayStatus(gatewayKey, chargeResult.status) as TenantBillingPaymentAttemptRow['status'],
      gateway_status: chargeResult.status,
      gateway_reference_id: chargeResult.paymentId,
      gateway_metadata: attemptMetadata,
      idempotency_key: generatedIdem,
      is_active: true,
    });

    await updateInvoiceGatewayData(billingId, {
      gateway: gatewayKey,
      payment_method: requestedMethod,
      gateway_reference_id: chargeResult.paymentId,
      gateway_status: chargeResult.status,
      idempotency_key: generatedIdem,
      gateway_metadata: attemptMetadata,
    });

    billingLog('invoice', 'plan_checkout_new_charge', {
      billing_id: billingId,
      attempt_id: createdAttempt?.id,
      gateway_reference_id: chargeResult.paymentId,
      payment_method: requestedMethod,
    });

    const refreshed = await getInvoiceById(billingId);
    return {
      billing: refreshed ?? billingInput,
      paymentUrls: {
        invoiceUrl: chargeResult.invoiceUrl,
        bankSlipUrl: chargeResult.bankSlipUrl,
        bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
        pixQrCode: chargeResult.pixQrCode,
        pixCopyPaste: chargeResult.pixCopyPaste,
      },
    };
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505') {
      const winner = await findReusableTenantBillingPaymentAttempt(billingId, reqMethod);
      if (winner && winner.gateway_reference_id) {
        if (winner.gateway_reference_id !== chargeResult.paymentId && typeof gateway.cancelPayment === 'function') {
          try {
            await gateway.cancelPayment(chargeResult.paymentId);
            billingLog('invoice', 'plan_checkout_cancelled_orphan_after_unique', {
              billing_id: billingId,
              orphan_payment_id: chargeResult.paymentId,
              kept_attempt_id: winner.id,
            });
          } catch (cancelErr) {
            billingLog('invoice', 'plan_checkout_orphan_cancel_failed', {
              billing_id: billingId,
              orphan_payment_id: chargeResult.paymentId,
              error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
            });
          }
        }
        await activateTenantBillingPaymentAttempt(billingId, winner.id);
        await updateInvoiceGatewayData(billingId, {
          gateway: winner.gateway,
          payment_method: winner.payment_method,
          gateway_reference_id: winner.gateway_reference_id,
          gateway_status: winner.gateway_status,
          idempotency_key: winner.idempotency_key,
          gateway_metadata: winner.gateway_metadata ?? {},
        });
        const m = (winner.gateway_metadata ?? {}) as Record<string, unknown>;
        const refreshed = await getInvoiceById(billingId);
        return {
          billing: refreshed ?? billingInput,
          paymentUrls: paymentUrlsFromAttemptMeta(m),
        };
      }
    }
    throw err;
  }
}

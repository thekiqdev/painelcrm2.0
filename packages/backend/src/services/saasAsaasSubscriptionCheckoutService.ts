/**
 * CA S2 — checkout SaaS com cartão via Assinatura Asaas (`POST /subscriptions`)
 * em vez de captura avulsa (`payWithCreditCard` em cobrança órfã).
 */
import { pool } from '../utils/db.js';
import { yyyyMmDdFromDbDateValue } from '../utils/calendarDateBr.js';
import type { PaymentGateway, GatewaySubscriptionCycle } from '../modules/payments/paymentGatewayTypes.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import { billingLog } from './billingLogger.js';
import type { TenantBillingRow } from './invoiceService.js';
import { updateInvoiceGatewayData, updateInvoiceStatus } from './invoiceService.js';
import { activatePlanFromBilling, ensureSaasSubscriptionLinkedToOpenBilling } from './subscriptionService.js';
import { PayWithCardError, type PayWithCardRequestBody } from './customerBillingService.js';
import type { TenantBillingPaymentAttemptRow } from './tenantBillingPaymentAttemptsService.js';
import {
  updateTenantBillingPaymentAttemptStatus,
  type TbAttemptStatus,
} from './tenantBillingPaymentAttemptsService.js';
import { isAbortLikeError } from '../modules/gateways/asaas/client/asaasClient.js';

const CONTRACT_REASONS = new Set(['plan_purchase', 'plan_upgrade', 'manual_charge']);

export function shouldUseAsaasSubscriptionForSaasCardCheckout(
  billing: Pick<TenantBillingRow, 'billing_reason'>
): boolean {
  const reason = billing.billing_reason ?? 'plan_purchase';
  return CONTRACT_REASONS.has(reason);
}

function mapBillingIntervalToGatewayCycle(interval: string | null | undefined): GatewaySubscriptionCycle {
  switch (String(interval || 'monthly').trim()) {
    case 'weekly':
      return 'weekly';
    case 'quarterly':
      return 'quarterly';
    case 'semi_annual':
      return 'semi_annual';
    case 'yearly':
      return 'yearly';
    default:
      return 'monthly';
  }
}

function todayYmdLocal(): string {
  return yyyyMmDdFromDbDateValue(new Date()) || new Date().toISOString().slice(0, 10);
}

function delayMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForFirstSubscriptionPayment(
  gateway: PaymentGateway,
  subscriptionId: string
): Promise<{ paymentId: string; status: string; paidAt?: string | null } | null> {
  if (typeof gateway.listSubscriptionPayments !== 'function') return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (attempt > 0) await delayMs(Math.min(2500, 300 * 2 ** (attempt - 1)));
    const rows = await gateway.listSubscriptionPayments(subscriptionId);
    if (!rows.length) continue;
    const paid = rows.find((p) => {
      const n = normalizeGatewayStatus('asaas', p.status);
      return n === 'paid';
    });
    return paid ?? rows[0];
  }
  return null;
}

async function persistAsaasSubscriptionIdOnLocalSub(params: {
  tenantId: string;
  subscriptionId: string | null;
  asaasSubscriptionId: string;
  gatewayKey: string;
}): Promise<string | null> {
  let subscriptionId = params.subscriptionId;
  if (!subscriptionId) {
    const subR = await pool.query<{ id: string }>(
      `SELECT id::text AS id FROM subscriptions
       WHERE tenant_id = $1::uuid AND type = 'saas'
         AND status IN ('active', 'past_due', 'trialing')
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END, updated_at DESC
       LIMIT 1`,
      [params.tenantId]
    );
    subscriptionId = subR.rows[0]?.id ?? null;
  }
  if (!subscriptionId) return null;
  await pool.query(
    `UPDATE subscriptions
     SET asaas_subscription_id = $1,
         asaas_subscription_gateway = $2,
         updated_at = now()
     WHERE id = $3::uuid AND tenant_id = $4::uuid AND type = 'saas'`,
    [params.asaasSubscriptionId, params.gatewayKey, subscriptionId, params.tenantId]
  );
  return subscriptionId;
}

export type ExecuteAsaasSubscriptionCardCheckoutParams = {
  billing: TenantBillingRow;
  billingId: string;
  gateway: PaymentGateway;
  gatewayKey: string;
  body: PayWithCardRequestBody;
  remoteIp: string;
  attempt: TenantBillingPaymentAttemptRow | null;
  billingMeta: Record<string, unknown>;
  /** Cobrança avulsa CREDIT_CARD preparada — cancelar após criar Assinatura. */
  orphanPaymentId: string | null;
};

/**
 * Cria Assinatura Asaas, vincula à subscription local e liquida a fatura se a 1ª cobrança já estiver paga.
 */
export async function executeSaasCardCheckoutViaAsaasSubscription(
  params: ExecuteAsaasSubscriptionCardCheckoutParams
): Promise<Record<string, unknown>> {
  const { billing, billingId, gateway, gatewayKey, body, attempt, billingMeta } = params;
  if (typeof gateway.createSubscription !== 'function') {
    throw new PayWithCardError(
      'Assinatura recorrente com cartão não está disponível neste provedor.',
      502,
      'gateway_error'
    );
  }
  if (typeof gateway.ensureCustomer !== 'function') {
    throw new PayWithCardError('Gateway sem ensureCustomer', 502, 'gateway_error');
  }

  const remoteIp = params.remoteIp?.trim();
  if (!remoteIp) {
    throw new PayWithCardError(
      'Não foi possível identificar o IP do pagador para o cartão.',
      400,
      'validation_error'
    );
  }

  // Draft local antes do paid (Pix Auto / CA).
  try {
    await ensureSaasSubscriptionLinkedToOpenBilling(billingId);
  } catch (e) {
    console.warn('[CA S2] ensureSaasSubscriptionLinkedToOpenBilling', e);
  }

  const existingSubId =
    typeof billingMeta.asaas_subscription_id === 'string'
      ? billingMeta.asaas_subscription_id.trim()
      : '';

  let asaasSubscriptionId = existingSubId;
  let creditCardToken: string | null = null;
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;

  try {
    if (!asaasSubscriptionId) {
      const customerId = await gateway.ensureCustomer(billing.tenant_id);
      const cycle = mapBillingIntervalToGatewayCycle(billing.billing_interval);
      const nextDueDate = todayYmdLocal();

      let createInput: Parameters<NonNullable<PaymentGateway['createSubscription']>>[0];
      if (body.use_saved_card === true) {
        const {
          getActiveSaasCardTokenBySubscriptionId,
          getActiveSaasCardTokenByTenantId,
        } = await import('./billing2/billingCardTokenStore.js');
        const saved = billing.subscription_id
          ? await getActiveSaasCardTokenBySubscriptionId(billing.subscription_id)
          : await getActiveSaasCardTokenByTenantId(billing.tenant_id);
        if (!saved?.card_token) {
          throw new PayWithCardError(
            'Não há cartão salvo para esta assinatura. Informe os dados do cartão.',
            409,
            'conflict'
          );
        }
        createInput = {
          customerId,
          amountCents: billing.amount_cents,
          nextDueDate,
          cycle,
          remoteIp,
          creditCardToken: saved.card_token,
          description: billing.invoice_number ?? `Plano ${billing.plan_id}`,
          externalReference: billingId,
        };
      } else {
        if (!body.credit_card || !body.cardholder) {
          throw new PayWithCardError('Verifique os dados do cartão e do titular.', 400, 'validation_error');
        }
        createInput = {
          customerId,
          amountCents: billing.amount_cents,
          nextDueDate,
          cycle,
          remoteIp,
          creditCard: {
            holderName: body.credit_card.holder_name.trim(),
            number: body.credit_card.number,
            expiryMonth: body.credit_card.expiry_month.trim(),
            expiryYear: body.credit_card.expiry_year.trim(),
            ccv: body.credit_card.cvv.trim(),
          },
          creditCardHolderInfo: {
            name: body.cardholder.name.trim(),
            email: body.cardholder.email.trim(),
            cpfCnpj: body.cardholder.cpf_cnpj,
            postalCode: body.cardholder.postal_code,
            addressNumber: body.cardholder.address_number.trim(),
            addressComplement: body.cardholder.address_complement ?? null,
            phone: body.cardholder.phone,
            mobilePhone: body.cardholder.mobile_phone ?? null,
          },
          description: billing.invoice_number ?? `Plano ${billing.plan_id}`,
          externalReference: billingId,
        };
      }

      const created = await gateway.createSubscription(createInput);
      asaasSubscriptionId = created.subscriptionId;
      creditCardToken = created.creditCardToken ?? null;
      cardBrand = created.cardBrand ?? null;
      cardLast4 = created.cardLast4 ?? null;
    } else if (typeof gateway.getSubscription === 'function') {
      const existing = await gateway.getSubscription(asaasSubscriptionId);
      if (existing) {
        creditCardToken = existing.creditCardToken ?? null;
        cardBrand = existing.cardBrand ?? null;
        cardLast4 = existing.cardLast4 ?? null;
      }
    }
  } catch (e: unknown) {
    if (e instanceof PayWithCardError) throw e;
    if (isAbortLikeError(e)) {
      throw new PayWithCardError(
        'A operação demorou demais. Verifique o status da cobrança em instantes.',
        504,
        'gateway_timeout'
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    const httpMatch = msg.match(/Asaas API (\d+):/);
    const code = httpMatch ? parseInt(httpMatch[1], 10) : 502;
    if (attempt) {
      await updateTenantBillingPaymentAttemptStatus({
        attemptId: attempt.id,
        status: 'failed',
        gatewayStatus: `error_${code}`,
      });
    }
    if (code === 400 || code === 402) {
      throw new PayWithCardError(
        'Não foi possível processar o cartão. Verifique os dados ou use outro cartão.',
        400,
        'invalid_card'
      );
    }
    throw new PayWithCardError(
      'Erro ao criar assinatura no provedor de pagamento. Tente novamente.',
      502,
      'gateway_error'
    );
  }

  const localSubId = await persistAsaasSubscriptionIdOnLocalSub({
    tenantId: billing.tenant_id,
    subscriptionId: billing.subscription_id,
    asaasSubscriptionId,
    gatewayKey,
  });

  const firstPay = await waitForFirstSubscriptionPayment(gateway, asaasSubscriptionId);
  const gwStatus = firstPay?.status ?? 'PENDING';
  const paymentId = firstPay?.paymentId ?? asaasSubscriptionId;
  const internalStatus = firstPay
    ? normalizeGatewayStatus(gatewayKey, gwStatus)
    : 'waiting_payment';
  const paidAtDate =
    internalStatus === 'paid'
      ? firstPay?.paidAt
        ? new Date(firstPay.paidAt)
        : new Date()
      : undefined;

  let attemptRowStatus: TbAttemptStatus = 'waiting_payment';
  if (internalStatus === 'paid') attemptRowStatus = 'paid';
  else if (internalStatus === 'processing') attemptRowStatus = 'processing';
  else if (internalStatus === 'pending') attemptRowStatus = 'pending';
  else if (internalStatus === 'overdue') attemptRowStatus = 'overdue';

  if (attempt) {
    await updateTenantBillingPaymentAttemptStatus({
      attemptId: attempt.id,
      status: attemptRowStatus,
      gatewayStatus: gwStatus,
      paidAt: internalStatus === 'paid' ? paidAtDate : undefined,
    });
  }

  const mergedMeta: Record<string, unknown> = {
    ...billingMeta,
    ...(attempt?.gateway_metadata && typeof attempt.gateway_metadata === 'object'
      ? (attempt.gateway_metadata as Record<string, unknown>)
      : {}),
    card_capture_channel: 'asaas_subscription',
    asaas_subscription_id: asaasSubscriptionId,
    asaas_subscription_mode: true,
  };

  await updateInvoiceGatewayData(billingId, {
    gateway: gatewayKey,
    payment_method: 'CREDIT_CARD',
    gateway_reference_id: firstPay?.paymentId ?? billing.gateway_reference_id,
    gateway_status: gwStatus,
    idempotency_key: attempt?.idempotency_key ?? billing.idempotency_key,
    gateway_metadata: mergedMeta,
  });

  const statusForDb =
    internalStatus === 'paid'
      ? 'paid'
      : internalStatus === 'overdue'
        ? 'overdue'
        : internalStatus === 'cancelled'
          ? 'cancelled'
          : 'pending';

  await updateInvoiceStatus(
    billingId,
    statusForDb,
    internalStatus === 'paid' ? paidAtDate ?? new Date() : undefined,
    'CREDIT_CARD',
    gwStatus
  );

  if (internalStatus === 'paid') {
    await activatePlanFromBilling(billingId);
    if (creditCardToken?.trim() && localSubId) {
      try {
        const { upsertSaasCardToken, cardTokenAuditSafe } = await import(
          './billing2/billingCardTokenStore.js'
        );
        const { writeBillingAuditEvent } = await import('./collectionPolicy/billingAuditEventWriter.js');
        await upsertSaasCardToken({
          subscriptionId: localSubId,
          tenantId: billing.tenant_id,
          cardToken: creditCardToken.trim(),
          cardBrand,
          cardLast4,
          gateway: gatewayKey,
        });
        await writeBillingAuditEvent({
          actor: 'pay_with_card',
          actor_type: 'system',
          action: 'card.token_saved',
          entity_type: 'subscription',
          entity_id: localSubId,
          reason: 'asaas_subscription_create',
          origin: 'saas_asaas_subscription_checkout',
          payload: {
            tenant_id: billing.tenant_id,
            billing_id: billingId,
            asaas_subscription_id: asaasSubscriptionId,
            brand: cardBrand,
            last4: cardLast4,
            token_mask: cardTokenAuditSafe(creditCardToken),
          },
        });
      } catch (tokenErr) {
        console.error('[CA S2] token persist failed', tokenErr);
      }
    }
    const { schedulePublishPlatformBillingPaymentConfirmed } = await import(
      './platformNotifications/platformBusinessNotifications.js'
    );
    schedulePublishPlatformBillingPaymentConfirmed(billingId);

    const orphan = params.orphanPaymentId?.trim() || null;
    const keep = firstPay?.paymentId?.trim() || null;
    const extras = orphan && keep && orphan !== keep ? [orphan] : orphan && !keep ? [orphan] : [];
    if (extras.length || keep) {
      const { cancelOpenTenantBillingCycleChargesAfterPaid } = await import(
        './billingGatewayChargeService.js'
      );
      await cancelOpenTenantBillingCycleChargesAfterPaid({
        billingId,
        tenantId: billing.tenant_id,
        keepGatewayReferenceId: keep,
        paidAttemptId: attempt?.id ?? null,
        extraCancelReferenceIds: extras,
        gatewayKeyFallback: gatewayKey,
        gatewayStatusRawForExtras: gwStatus,
      }).catch((err) => console.error('[CA S2] cycle_paid_cleanup:', err));
    }
  } else if (params.orphanPaymentId?.trim() && typeof gateway.cancelPayment === 'function') {
    // Assinatura criada; cancela cobrança avulsa órfã (não é a recorrência).
    await gateway.cancelPayment(params.orphanPaymentId.trim()).catch((err) =>
      console.warn('[CA S2] cancel orphan charge failed', err)
    );
  }

  const responseBody: Record<string, unknown> = {
    ok: true,
    billing_status: internalStatus === 'waiting_payment' ? 'pending' : internalStatus,
    asaas_subscription_id: asaasSubscriptionId,
    attempt: attempt
      ? {
          id: attempt.id,
          payment_method: 'CREDIT_CARD',
          status: attemptRowStatus,
          gateway_status: gwStatus,
          gateway_reference_id: paymentId,
        }
      : null,
  };

  billingLog('invoice', 'saas_asaas_subscription_card_checkout', {
    billing_id: billingId,
    asaas_subscription_id: asaasSubscriptionId,
    payment_id: firstPay?.paymentId ?? null,
    billing_status: responseBody.billing_status,
  });

  return responseBody;
}

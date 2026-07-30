/**
 * Billing 2.0 Sprint 10 — Pix Automático (autorização + instrução via Asaas).
 * Flag billing2.pix_automatic OFF → callers devem skip (este módulo não liga nada sozinho).
 */
import { getActiveAsaasConfigForSaas, getActiveGateway } from '../../modules/payments/gatewayProvider.js';
import * as asaasClient from '../../modules/gateways/asaas/client/asaasClient.js';
import { getActiveConfig } from '../paymentGatewayConfigService.js';
import { getInvoiceById, updateInvoiceGatewayData } from '../invoiceService.js';
import { writeBillingAuditEvent } from '../collectionPolicy/billingAuditEventWriter.js';
import { scheduleCollectionPolicyExtensionPoint } from '../collectionPolicy/hook.js';
import { pool } from '../../utils/db.js';
import {
  getPixAutomaticAuthBySubscriptionId,
  getPixAutomaticAuthByTenantId,
  getSubscriptionByPixAuthorizationId,
  isWithinPixAutomaticInstructionWindow,
  mapBillingIntervalToPixFrequency,
  upsertPixAutomaticAuthorization,
  updatePixAutomaticAuthStatus,
  markPixAutomaticUserOptedOut,
  toPublicPixAutomaticStatus,
  type PixAutomaticAuthStatus,
} from './billingPixAutomaticStore.js';
import { isBilling2FlagEnabled } from './billingFeatureFlags.js';
import { ASAAS_PIX_AUTOMATIC_EVENT } from '../../modules/gateways/asaas/asaasEvents.js';

function ymd(d: string | Date | null | undefined): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d ?? '').slice(0, 10);
}

function extractAuthPayload(raw: Record<string, unknown>): {
  authorizationId: string;
  status: PixAutomaticAuthStatus;
  qrPayload: string | null;
  qrImage: string | null;
  conciliationId: string | null;
} {
  const authorizationId = typeof raw.id === 'string' ? raw.id : '';
  const statusRaw = typeof raw.status === 'string' ? raw.status.toLowerCase() : 'pending';
  const status: PixAutomaticAuthStatus =
    statusRaw === 'active'
      ? 'active'
      : statusRaw === 'cancelled' || statusRaw === 'canceled'
        ? 'cancelled'
        : statusRaw === 'expired'
          ? 'expired'
          : statusRaw === 'refused'
            ? 'refused'
            : 'pending';

  const immediate =
    raw.immediateQrCode && typeof raw.immediateQrCode === 'object'
      ? (raw.immediateQrCode as Record<string, unknown>)
      : null;
  const qrPayload =
    (immediate && typeof immediate.payload === 'string' ? immediate.payload : null) ??
    (typeof raw.payload === 'string' ? raw.payload : null);
  const qrImageRaw =
    (immediate && typeof immediate.encodedImage === 'string' ? immediate.encodedImage : null) ??
    (typeof raw.encodedImage === 'string' ? raw.encodedImage : null);
  // Mesmo padrão do PIX avulso (asaasService): <img src> precisa de data URL.
  const qrImage =
    qrImageRaw == null || qrImageRaw === ''
      ? null
      : qrImageRaw.startsWith('data:')
        ? qrImageRaw
        : `data:image/png;base64,${qrImageRaw}`;
  const conciliationId =
    (immediate && typeof immediate.conciliationIdentifier === 'string'
      ? immediate.conciliationIdentifier
      : null) ??
    (typeof raw.conciliationIdentifier === 'string' ? raw.conciliationIdentifier : null);

  return { authorizationId, status, qrPayload, qrImage, conciliationId };
}

export async function findTenantBillingByPixAutomaticConciliation(
  conciliationId: string
): Promise<{ id: string; status: string; gateway: string | null } | null> {
  const r = await pool.query<{ id: string; status: string; gateway: string | null }>(
    `SELECT tb.id, tb.status, tb.gateway
     FROM tenant_billing tb
     LEFT JOIN subscriptions s ON s.id = tb.subscription_id
     WHERE tb.gateway_metadata->>'pix_automatic_conciliation_id' = $1
        OR s.pix_automatic_conciliation_id = $1
     ORDER BY tb.created_at DESC
     LIMIT 1`,
    [conciliationId]
  );
  return r.rows[0] ?? null;
}

export async function findTenantBillingByPixAutomaticAuthId(
  authorizationId: string
): Promise<{ id: string; status: string; gateway: string | null } | null> {
  const r = await pool.query<{ id: string; status: string; gateway: string | null }>(
    `SELECT id, status, gateway
     FROM tenant_billing
     WHERE gateway_metadata->>'pix_automatic_authorization_id' = $1
       AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
     ORDER BY created_at DESC
     LIMIT 1`,
    [authorizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * Jornada 3 — cria autorização com QR composto (1º pagamento + consentimento).
 */
export async function startPixAutomaticAuthorizationForBilling(opts: {
  billingId: string;
  correlationId?: string | null;
}): Promise<{
  ok: true;
  authorization_id: string;
  status: PixAutomaticAuthStatus;
  qr_payload: string | null;
  qr_image: string | null;
} | { ok: false; detail: string }> {
  if (!(await isBilling2FlagEnabled('pix_automatic'))) {
    return { ok: false, detail: 'flag_pix_automatic_off' };
  }

  const inv = await getInvoiceById(opts.billingId);
  if (!inv) return { ok: false, detail: 'billing_not_found' };
  if (inv.status === 'paid' || inv.status === 'cancelled') {
    return { ok: false, detail: `billing_status_${inv.status}` };
  }
  if (inv.amount_cents <= 0) return { ok: false, detail: 'zero_amount' };

  const { gatewaySupports } = await import('../../modules/payments/gatewayCapabilities.js');
  const configProbe = await getActiveConfig('saas');
  const gwKey = configProbe?.gateway_key ?? 'asaas';
  if (!gatewaySupports(gwKey, 'pixAutomatic')) {
    return { ok: false, detail: 'gateway_capability_pix_automatic_unsupported' };
  }

  let invLinked = (await getInvoiceById(opts.billingId)) ?? inv;
  let resolvedSubscriptionId = invLinked.subscription_id;
  if (!resolvedSubscriptionId) {
    // Sprint A — fatura de checkout/pós-trial sem link: cria draft trialing
    try {
      const { ensureSaasSubscriptionLinkedToOpenBilling } = await import(
        '../subscriptionService.js'
      );
      const linked = await ensureSaasSubscriptionLinkedToOpenBilling(opts.billingId);
      resolvedSubscriptionId = linked?.subscriptionId ?? null;
      if (resolvedSubscriptionId) {
        invLinked = (await getInvoiceById(opts.billingId)) ?? invLinked;
      }
    } catch (e) {
      console.warn('[pixAutomatic] ensure subscription link', e);
    }
  }
  if (!resolvedSubscriptionId) return { ok: false, detail: 'missing_subscription_id' };
  const subscriptionId = resolvedSubscriptionId;
  const tenantId = invLinked.tenant_id;

  const existing = await getPixAutomaticAuthBySubscriptionId(subscriptionId);
  if (existing?.status === 'active' && existing.authorization_id) {
    return { ok: false, detail: 'auth_already_active' };
  }
  if (existing?.status === 'pending' && existing.qr_payload) {
    return {
      ok: true,
      authorization_id: existing.authorization_id!,
      status: 'pending',
      qr_payload: existing.qr_payload,
      qr_image: existing.qr_image,
    };
  }

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId });
  if (!gateway?.ensureCustomer) return { ok: false, detail: 'no_active_gateway' };
  const customerId = await gateway.ensureCustomer(tenantId);
  if (!customerId) return { ok: false, detail: 'ensure_customer_failed' };

  const asaasConfig = await getActiveAsaasConfigForSaas();
  const subMeta = await pool.query<{
    billing_interval: string | null;
    cycles_unlimited: boolean | null;
    max_cycles: number | null;
  }>(
    `SELECT billing_interval::text AS billing_interval,
            COALESCE(cycles_unlimited, true) AS cycles_unlimited,
            max_cycles
     FROM subscriptions WHERE id = $1::uuid`,
    [subscriptionId]
  );
  const frequency = mapBillingIntervalToPixFrequency(subMeta.rows[0]?.billing_interval);
  const due = ymd(invLinked.due_date);
  const value = invLinked.amount_cents / 100;
  const contractId = `saas-${subscriptionId.replace(/-/g, '').slice(0, 28)}`;

  const consumedR = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n
     FROM subscription_cycles
     WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid AND invoice_id IS NOT NULL
       AND invoice_id IS DISTINCT FROM $3::uuid`,
    [subscriptionId, tenantId, opts.invoiceId]
  );
  const { computePixAutomaticFinishDateYmd } = await import(
    '../crm/crmSubscriptionCyclesFinishDate.js'
  );
  const finishDate = computePixAutomaticFinishDateYmd({
    startDateYmd: due,
    billingInterval: subMeta.rows[0]?.billing_interval || 'monthly',
    maxCycles: subMeta.rows[0]?.max_cycles ?? null,
    cyclesUnlimited: subMeta.rows[0]?.cycles_unlimited !== false,
    consumedBeforeAuth: consumedR.rows[0]?.n ?? 0,
  });

  let raw: Record<string, unknown>;
  try {
    raw = await asaasClient.createPixAutomaticAuthorization(
      {
        customerId,
        frequency,
        contractId,
        startDate: due,
        value,
        description: (invLinked.invoice_number ?? 'Assinatura').slice(0, 35),
        immediateValue: value,
        immediateDueDate: due,
        immediateDescription: (invLinked.invoice_number ?? '1a cobranca').slice(0, 35),
        finishDate,
      },
      asaasConfig
    );
  } catch (e: unknown) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : 'asaas_create_auth_failed',
    };
  }

  const extracted = extractAuthPayload(raw);
  if (!extracted.authorizationId) {
    return { ok: false, detail: 'asaas_auth_missing_id' };
  }

  await upsertPixAutomaticAuthorization({
    subscriptionId,
    tenantId,
    authorizationId: extracted.authorizationId,
    status: extracted.status === 'active' ? 'active' : 'pending',
    gateway: 'asaas',
    contractId,
    qrPayload: extracted.qrPayload,
    qrImage: extracted.qrImage,
    conciliationId: extracted.conciliationId,
  });

  const config = await getActiveConfig('saas');
  const prevMeta =
    invLinked.gateway_metadata && typeof invLinked.gateway_metadata === 'object'
      ? (invLinked.gateway_metadata as Record<string, unknown>)
      : {};
  // Preserva QR do PIX avulso para restaurar se o usuário desligar o switch.
  const stashCopy =
    prevMeta.pix_automatic_journey === 'authorization' &&
    typeof prevMeta.standalone_pix_copy_paste === 'string'
      ? prevMeta.standalone_pix_copy_paste
      : typeof prevMeta.pix_copy_paste === 'string'
        ? prevMeta.pix_copy_paste
        : null;
  const stashQr =
    prevMeta.pix_automatic_journey === 'authorization' &&
    typeof prevMeta.standalone_pix_qr_code === 'string'
      ? prevMeta.standalone_pix_qr_code
      : typeof prevMeta.pix_qr_code === 'string'
        ? prevMeta.pix_qr_code
        : null;

  await updateInvoiceGatewayData(opts.billingId, {
    gateway: config?.gateway_key ?? 'asaas',
    payment_method: 'PIX',
    gateway_reference_id: invLinked.gateway_reference_id ?? null,
    gateway_status: 'PENDING_PIX_AUTOMATIC_AUTH',
    gateway_metadata: {
      standalone_pix_copy_paste: stashCopy,
      standalone_pix_qr_code: stashQr,
      pix_automatic_authorization_id: extracted.authorizationId,
      pix_automatic_conciliation_id: extracted.conciliationId,
      pix_copy_paste: extracted.qrPayload,
      pix_qr_code: extracted.qrImage,
      pix_automatic_journey: 'authorization',
    },
  });

  await writeBillingAuditEvent({
    actor: 'billing2_pix_automatic',
    actor_type: 'system',
    action: 'pix_automatic.authorization_started',
    entity_type: 'subscription',
    entity_id: subscriptionId,
    reason: 'consent_qr_created',
    origin: 'billing2',
    correlation_id: opts.correlationId ?? null,
    payload: {
      billing_id: opts.billingId,
      authorization_id: extracted.authorizationId,
      has_qr: !!extracted.qrPayload,
    },
  });

  return {
    ok: true,
    authorization_id: extracted.authorizationId,
    status: extracted.status === 'active' ? 'active' : 'pending',
    qr_payload: extracted.qrPayload,
    qr_image: extracted.qrImage,
  };
}

/**
 * Cria cobrança PIX vinculada a autorização ACTIVE (janela 2–10 dias úteis).
 */
export async function createPixAutomaticInstructionForBilling(opts: {
  billingId: string;
  correlationId?: string | null;
  attempt?: number;
}): Promise<{ ok: true; payment_id: string } | { ok: false; detail: string }> {
  if (!(await isBilling2FlagEnabled('pix_automatic'))) {
    return { ok: false, detail: 'flag_pix_automatic_off' };
  }

  const inv = await getInvoiceById(opts.billingId);
  if (!inv) return { ok: false, detail: 'billing_not_found' };
  if (inv.status === 'paid') return { ok: false, detail: 'already_paid' };
  if (inv.amount_cents <= 0) return { ok: false, detail: 'zero_amount' };

  const { gatewaySupports } = await import('../../modules/payments/gatewayCapabilities.js');
  const configProbe = await getActiveConfig('saas');
  const gwKey = configProbe?.gateway_key ?? 'asaas';
  if (!gatewaySupports(gwKey, 'pixAutomatic')) {
    return { ok: false, detail: 'gateway_capability_pix_automatic_unsupported' };
  }

  const auth = inv.subscription_id
    ? await getPixAutomaticAuthBySubscriptionId(inv.subscription_id)
    : await getPixAutomaticAuthByTenantId(inv.tenant_id);

  if (!auth?.authorization_id || auth.status !== 'active') {
    return { ok: false, detail: 'auth_not_active' };
  }

  const due = ymd(inv.due_date);
  if (!isWithinPixAutomaticInstructionWindow(due)) {
    return { ok: false, detail: 'outside_instruction_window' };
  }

  if (inv.gateway_reference_id?.trim()) {
    const meta =
      inv.gateway_metadata && typeof inv.gateway_metadata === 'object'
        ? (inv.gateway_metadata as Record<string, unknown>)
        : {};
    if (meta.pix_automatic_authorization_id === auth.authorization_id) {
      return { ok: true, payment_id: inv.gateway_reference_id.trim() };
    }
  }

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId: inv.tenant_id });
  if (!gateway) return { ok: false, detail: 'no_active_gateway' };
  const customerId = await gateway.ensureCustomer?.(inv.tenant_id);
  if (!customerId) return { ok: false, detail: 'ensure_customer_failed' };

  const idempotencyKey =
    inv.idempotency_key ??
    `saas_pix_auto_${opts.billingId}_${opts.attempt ?? 1}`;

  try {
    const charge = await gateway.createCharge({
      customerId,
      amountCents: inv.amount_cents,
      dueDate: due,
      paymentMethod: 'PIX',
      description: inv.invoice_number ?? `Pix Auto ${opts.billingId}`,
      idempotencyKey,
      externalReference: inv.tenant_id,
      pixAutomaticAuthorizationId: auth.authorization_id,
    });

    const config = await getActiveConfig('saas');
    await updateInvoiceGatewayData(opts.billingId, {
      gateway: config?.gateway_key ?? 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: charge.paymentId,
      gateway_status: charge.status,
      idempotency_key: idempotencyKey,
      gateway_metadata: {
        pix_automatic_authorization_id: auth.authorization_id,
        pix_automatic_journey: 'instruction',
        pix_copy_paste: charge.pixCopyPaste ?? null,
        pix_qr_code: charge.pixQrCode ?? null,
      },
    });

    await writeBillingAuditEvent({
      actor: 'billing2_pix_automatic',
      actor_type: 'system',
      action: 'pix_automatic.instruction_created',
      entity_type: 'tenant_billing',
      entity_id: opts.billingId,
      reason: 'instruction_within_window',
      origin: 'billing2',
      correlation_id: opts.correlationId ?? null,
      payload: {
        payment_id: charge.paymentId,
        authorization_id: auth.authorization_id,
      },
    });

    return { ok: true, payment_id: charge.paymentId };
  } catch (e: unknown) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : 'create_instruction_failed',
    };
  }
}

function mapWebhookEventToStatus(eventType: string): PixAutomaticAuthStatus | null {
  switch (eventType) {
    case ASAAS_PIX_AUTOMATIC_EVENT.AUTHORIZATION_ACTIVATED:
      return 'active';
    case ASAAS_PIX_AUTOMATIC_EVENT.AUTHORIZATION_CANCELLED:
      return 'cancelled';
    case ASAAS_PIX_AUTOMATIC_EVENT.AUTHORIZATION_EXPIRED:
      return 'expired';
    case ASAAS_PIX_AUTOMATIC_EVENT.AUTHORIZATION_REFUSED:
      return 'refused';
    case ASAAS_PIX_AUTOMATIC_EVENT.AUTHORIZATION_CREATED:
      return 'pending';
    default:
      return null;
  }
}

/**
 * Processa webhooks PIX_AUTOMATIC_RECURRING_* (auth + instruction refuse).
 */
export async function handlePixAutomaticWebhookEvent(opts: {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<{ handled: boolean; detail: string }> {
  const authorization =
    (opts.payload.pixAutomaticRecurringAuthorization as Record<string, unknown> | undefined) ??
    (opts.payload.authorization as Record<string, unknown> | undefined) ??
    (opts.payload.pixAutomaticAuthorization as Record<string, unknown> | undefined) ??
    null;

  const authorizationId =
    (authorization && typeof authorization.id === 'string' ? authorization.id : null) ??
    (typeof opts.payload.pixAutomaticAuthorizationId === 'string'
      ? opts.payload.pixAutomaticAuthorizationId
      : null);

  const instruction =
    (opts.payload.pixAutomaticRecurringPaymentInstruction as Record<string, unknown> | undefined) ??
    (opts.payload.paymentInstruction as Record<string, unknown> | undefined) ??
    null;

  // CRM0 / CRM5: elegibilidade de conta — ack sem liquidar fatura (handler completo em CRM5).
  if (opts.eventType === ASAAS_PIX_AUTOMATIC_EVENT.ELIGIBILITY_UPDATED) {
    await writeBillingAuditEvent({
      actor: 'asaas_webhook',
      actor_type: 'system',
      action: 'pix_automatic.eligibility_updated',
      entity_type: 'subscription',
      entity_id: null,
      reason: opts.eventType,
      origin: 'webhook',
      correlation_id: `pix_auto_evt:${opts.eventId}`,
      payload: {
        eligibility: opts.payload.eligibility ?? null,
        account: opts.payload.account ?? null,
      },
    });
    return { handled: true, detail: 'eligibility_updated_ack' };
  }

  if (
    opts.eventType === ASAAS_PIX_AUTOMATIC_EVENT.INSTRUCTION_REFUSED ||
    opts.eventType === ASAAS_PIX_AUTOMATIC_EVENT.INSTRUCTION_CANCELLED
  ) {
    const authId =
      authorizationId ??
      (instruction && typeof instruction.authorizationId === 'string'
        ? instruction.authorizationId
        : null);
    const sub = authId ? await getSubscriptionByPixAuthorizationId(authId) : null;
    scheduleCollectionPolicyExtensionPoint({
      type: 'pix_automatic.instruction_refused',
      occurred_at: new Date().toISOString(),
      tenant_id: sub?.tenant_id ?? undefined,
      subscription_id: sub?.subscription_id ?? undefined,
      correlation_id: `pix_auto_evt:${opts.eventId}`,
      metadata: { event_type: opts.eventType, authorization_id: authId },
    });
    await writeBillingAuditEvent({
      actor: 'asaas_webhook',
      actor_type: 'system',
      action: 'pix_automatic.instruction_refused',
      entity_type: 'subscription',
      entity_id: sub?.subscription_id ?? null,
      reason: opts.eventType,
      origin: 'webhook',
      correlation_id: `pix_auto_evt:${opts.eventId}`,
      payload: { authorization_id: authId },
    });
    return { handled: true, detail: 'instruction_event' };
  }

  if (!authorizationId) {
    return { handled: false, detail: 'missing_authorization_id' };
  }

  const nextStatus = mapWebhookEventToStatus(opts.eventType);
  if (nextStatus) {
    const updated = await updatePixAutomaticAuthStatus({
      authorizationId,
      status: nextStatus,
    });

    if (
      nextStatus === 'cancelled' ||
      nextStatus === 'expired' ||
      nextStatus === 'refused'
    ) {
      scheduleCollectionPolicyExtensionPoint({
        type: 'pix_automatic.authorization_lost',
        occurred_at: new Date().toISOString(),
        tenant_id: updated?.tenant_id ?? undefined,
        subscription_id: updated?.subscription_id ?? undefined,
        correlation_id: `pix_auto_evt:${opts.eventId}`,
        metadata: { event_type: opts.eventType, authorization_id: authorizationId },
      });
    }

    await writeBillingAuditEvent({
      actor: 'asaas_webhook',
      actor_type: 'system',
      action: `pix_automatic.auth_${nextStatus}`,
      entity_type: 'subscription',
      entity_id: updated?.subscription_id ?? null,
      reason: opts.eventType,
      origin: 'webhook',
      correlation_id: `pix_auto_evt:${opts.eventId}`,
      payload: { authorization_id: authorizationId, status: nextStatus },
    });

    // Jornada 3: AUTHORIZATION_ACTIVATED ⇒ 1º pagamento já liquidou.
    // O PAYMENT_RECEIVED auto-gerado pelo Asaas costuma vir sem externalReference e
    // com paymentId novo — não casa com gateway_reference_id antigo. Por isso liquidamos aqui.
    if (nextStatus === 'active') {
      const payment = opts.payload.payment as Record<string, unknown> | undefined;
      const paymentId = payment && typeof payment.id === 'string' ? payment.id : null;
      const paymentStatus =
        payment && typeof payment.status === 'string' ? payment.status : 'RECEIVED';

      const billing =
        (await findTenantBillingByPixAutomaticAuthId(authorizationId)) ??
        (updated
          ? (
              await pool.query<{ id: string; status: string }>(
                `SELECT id, status FROM tenant_billing
                 WHERE subscription_id = $1::uuid
                   AND status IN ('pending','waiting_payment','processing','overdue')
                 ORDER BY created_at DESC LIMIT 1`,
                [updated.subscription_id]
              )
            ).rows[0] ?? null
          : null);

      if (billing?.id) {
        if (paymentId) {
          await updateInvoiceGatewayData(billing.id, {
            gateway: 'asaas',
            payment_method: 'PIX',
            gateway_reference_id: paymentId,
            gateway_status: paymentStatus,
            gateway_metadata: {
              pix_automatic_authorization_id: authorizationId,
              pix_automatic_journey: 'authorization',
            },
          });
        }

        const openStatuses = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
        if (openStatuses.has(billing.status)) {
          try {
            const { applyPaymentEvent } = await import(
              '../../modules/payments/webhook/paymentDomainService.js'
            );
            await applyPaymentEvent({
              entityType: 'tenant_billing',
              entityId: billing.id,
              currentStatus: billing.status,
              internalStatus: 'paid',
              gatewayStatus: paymentStatus,
              paidAt: new Date(),
              paymentMethod: 'PIX',
            });
          } catch (e: unknown) {
            console.error('[pixAutomatic] settle on AUTHORIZATION_ACTIVATED failed', e);
          }
        }
      }

      // CRM5 / R1B — mesma regra para customer_invoices (auth type=customer).
      try {
        const {
          updateCrmPixAutomaticAuthStatus,
          getCrmSubscriptionByPixAuthorizationId,
        } = await import('../crm/crmPixAutomaticStore.js');
        const { settleCustomerInvoiceOnPixAutomaticActivated } = await import(
          '../crm/crmPixAutomaticService.js'
        );

        await updateCrmPixAutomaticAuthStatus({
          authorizationId,
          status: 'active',
        });
        const crmAuth = await getCrmSubscriptionByPixAuthorizationId(authorizationId);
        await settleCustomerInvoiceOnPixAutomaticActivated({
          authorizationId,
          subscriptionId: crmAuth?.subscription_id ?? updated?.subscription_id ?? null,
          paymentId,
          paymentStatus,
          eventId: opts.eventId,
        });
      } catch (e: unknown) {
        console.error('[pixAutomatic] CRM settle on AUTHORIZATION_ACTIVATED failed', e);
      }
    }

    return { handled: true, detail: `auth_status_${nextStatus}` };
  }

  return { handled: true, detail: 'event_ack' };
}

/**
 * Sprint C — SSOT de preferência Pix Automático (assinatura).
 * Não grava estado na fatura; só lê/escreve colunas em `subscriptions`.
 */
export function isPixAutomaticUserOptedOffStatus(
  status: PixAutomaticAuthStatus | string | null | undefined
): boolean {
  return (
    status === 'cancelled' ||
    status === 'cleared' ||
    status === 'refused' ||
    status === 'expired'
  );
}

export async function getPixAutomaticPreferenceForTenant(tenantId: string): Promise<{
  available: boolean;
  status: PixAutomaticAuthStatus | null;
  has_active: boolean;
  switch_on: boolean;
  /** Usuário desligou (ou auth perdida) — não reaplicar default ON / auto-enable. */
  user_opted_off: boolean;
  authorization_id: string | null;
  qr_payload: string | null;
  qr_image: string | null;
  subscription_id: string | null;
}> {
  const available = await isBilling2FlagEnabled('pix_automatic');
  const auth = await getPixAutomaticAuthByTenantId(tenantId);
  const pub = toPublicPixAutomaticStatus(auth);
  const status = pub?.status ?? null;
  const has_active = pub?.has_active ?? false;
  const user_opted_off = isPixAutomaticUserOptedOffStatus(status);
  const switch_on = !user_opted_off && (has_active || status === 'pending');
  return {
    available,
    status,
    has_active,
    switch_on,
    user_opted_off,
    authorization_id: auth?.authorization_id ?? null,
    qr_payload: pub?.qr_payload ?? null,
    qr_image: pub?.qr_image ?? null,
    subscription_id: auth?.subscription_id ?? null,
  };
}

/**
 * Após switch OFF: devolve QR/copia do PIX avulso na fatura aberta
 * (stash no enable ou GET /payments/{id}/pixQrCode).
 */
export async function restoreStandalonePixAfterPixAutomaticOff(opts: {
  tenantId: string;
  billingId?: string | null;
}): Promise<{
  billing_id: string | null;
  pix_copy_paste: string | null;
  pix_qr_code: string | null;
}> {
  let billingId = opts.billingId?.trim() || null;
  if (!billingId) {
    const r = await pool.query<{ id: string }>(
      `SELECT id
       FROM tenant_billing
       WHERE tenant_id = $1::uuid
         AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
         AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'plan_renewal')
       ORDER BY
         CASE WHEN gateway_status = 'PENDING_PIX_AUTOMATIC_AUTH' THEN 0 ELSE 1 END,
         created_at DESC
       LIMIT 1`,
      [opts.tenantId]
    );
    billingId = r.rows[0]?.id ?? null;
  }
  if (!billingId) {
    return { billing_id: null, pix_copy_paste: null, pix_qr_code: null };
  }

  const inv = await getInvoiceById(billingId);
  if (!inv || inv.tenant_id !== opts.tenantId) {
    return { billing_id: null, pix_copy_paste: null, pix_qr_code: null };
  }

  const meta =
    inv.gateway_metadata && typeof inv.gateway_metadata === 'object'
      ? (inv.gateway_metadata as Record<string, unknown>)
      : {};

  let copy =
    typeof meta.standalone_pix_copy_paste === 'string' ? meta.standalone_pix_copy_paste : null;
  let qr = typeof meta.standalone_pix_qr_code === 'string' ? meta.standalone_pix_qr_code : null;

  if ((!copy || !qr) && inv.gateway_reference_id?.trim()) {
    try {
      const asaasConfig = await getActiveAsaasConfigForSaas();
      const pixData = await asaasClient.getPixQrCode(inv.gateway_reference_id.trim(), asaasConfig);
      if (pixData?.payload && !copy) copy = pixData.payload;
      if (pixData?.encodedImage && !qr) {
        qr = pixData.encodedImage.startsWith('data:')
          ? pixData.encodedImage
          : `data:image/png;base64,${pixData.encodedImage}`;
      }
    } catch (e) {
      console.warn('[pixAutomatic] restore standalone PIX QR failed', e);
    }
  }

  if (qr && !qr.startsWith('data:') && !qr.startsWith('http')) {
    qr = `data:image/png;base64,${qr}`;
  }

  const config = await getActiveConfig('saas');
  const nextStatus =
    inv.gateway_status === 'PENDING_PIX_AUTOMATIC_AUTH' ? 'PENDING' : inv.gateway_status;

  await updateInvoiceGatewayData(billingId, {
    gateway: config?.gateway_key ?? inv.gateway ?? 'asaas',
    payment_method: inv.payment_method ?? 'PIX',
    gateway_reference_id: inv.gateway_reference_id ?? null,
    gateway_status: nextStatus,
    gateway_metadata: {
      pix_copy_paste: copy,
      pix_qr_code: qr,
      pix_automatic_authorization_id: null,
      pix_automatic_conciliation_id: null,
      pix_automatic_journey: null,
      standalone_pix_copy_paste: copy,
      standalone_pix_qr_code: qr,
    },
  });

  return { billing_id: billingId, pix_copy_paste: copy, pix_qr_code: qr };
}

/**
 * Sprint C — cancela autorização no Asaas + status local.
 * Sem auth no Asaas: ainda grava `cleared` (opt-out persistido).
 * Restaura QR do PIX avulso na fatura aberta (se houver).
 */
export async function cancelPixAutomaticAuthorizationForSubscription(opts: {
  tenantId: string;
  subscriptionId?: string | null;
  billingId?: string | null;
  correlationId?: string | null;
  reason?: string;
}): Promise<
  | {
      ok: true;
      detail: string;
      billing_id: string | null;
      pix_copy_paste: string | null;
      pix_qr_code: string | null;
    }
  | { ok: false; detail: string }
> {
  let auth = opts.subscriptionId
    ? await getPixAutomaticAuthBySubscriptionId(opts.subscriptionId)
    : await getPixAutomaticAuthByTenantId(opts.tenantId);

  let subscriptionId = auth?.subscription_id ?? opts.subscriptionId ?? null;
  if (!subscriptionId) {
    try {
      const { getOpenSaasSubscriptionByTenant } = await import('../billingSubscriptionService.js');
      const open = await getOpenSaasSubscriptionByTenant(opts.tenantId);
      subscriptionId = open?.id ?? null;
      if (subscriptionId && !auth) {
        auth = await getPixAutomaticAuthBySubscriptionId(subscriptionId);
      }
    } catch {
      /* ignore */
    }
  }

  if (!subscriptionId) {
    return { ok: false, detail: 'missing_subscription' };
  }

  if (isPixAutomaticUserOptedOffStatus(auth?.status)) {
    // Garante cleared mesmo se veio cancelled de webhook
    if (auth?.status !== 'cleared' && !auth?.authorization_id) {
      await markPixAutomaticUserOptedOut({
        subscriptionId,
        tenantId: opts.tenantId,
      });
    }
    const restored = await restoreStandalonePixAfterPixAutomaticOff({
      tenantId: opts.tenantId,
      billingId: opts.billingId,
    });
    return {
      ok: true,
      detail: `already_${auth?.status ?? 'cleared'}`,
      ...restored,
    };
  }

  if (auth?.authorization_id) {
    const asaasConfig = await getActiveAsaasConfigForSaas();
    try {
      await asaasClient.cancelPixAutomaticAuthorization(auth.authorization_id, asaasConfig);
    } catch (e: unknown) {
      console.warn(
        '[pixAutomatic] Asaas cancel auth failed; clearing local',
        e instanceof Error ? e.message : e
      );
    }
    await updatePixAutomaticAuthStatus({
      authorizationId: auth.authorization_id,
      status: 'cancelled',
    });
  } else {
    await markPixAutomaticUserOptedOut({
      subscriptionId,
      tenantId: opts.tenantId,
    });
  }

  await writeBillingAuditEvent({
    actor: 'billing2_pix_automatic',
    actor_type: 'system',
    action: 'pix_automatic.auth_cancelled_by_preference',
    entity_type: 'subscription',
    entity_id: subscriptionId,
    reason: opts.reason ?? 'switch_off_or_plan_cancel',
    origin: 'billing2',
    correlation_id: opts.correlationId ?? null,
    payload: {
      authorization_id: auth?.authorization_id ?? null,
      tenant_id: opts.tenantId,
    },
  });

  const restored = await restoreStandalonePixAfterPixAutomaticOff({
    tenantId: opts.tenantId,
    billingId: opts.billingId,
  });

  return {
    ok: true,
    detail: auth?.authorization_id ? 'cancelled' : 'opted_out_local',
    ...restored,
  };
}

/**
 * Sprint C — liga Pix Auto: precisa de fatura aberta (billing_id ou resolve a mais recente do plano).
 */
export async function enablePixAutomaticForTenant(opts: {
  tenantId: string;
  billingId?: string | null;
  correlationId?: string | null;
}): Promise<
  | {
      ok: true;
      authorization_id: string;
      status: PixAutomaticAuthStatus;
      qr_payload: string | null;
      qr_image: string | null;
      billing_id: string;
    }
  | { ok: false; detail: string }
> {
  if (!(await isBilling2FlagEnabled('pix_automatic'))) {
    return { ok: false, detail: 'flag_pix_automatic_off' };
  }

  let billingId = opts.billingId?.trim() || null;
  if (!billingId) {
    const r = await pool.query<{ id: string }>(
      `SELECT id
       FROM tenant_billing
       WHERE tenant_id = $1::uuid
         AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
         AND COALESCE(billing_reason, 'plan_purchase') IN ('plan_purchase', 'plan_upgrade', 'plan_renewal')
       ORDER BY created_at DESC
       LIMIT 1`,
      [opts.tenantId]
    );
    billingId = r.rows[0]?.id ?? null;
  }
  if (!billingId) {
    return { ok: false, detail: 'needs_open_billing' };
  }

  const inv = await getInvoiceById(billingId);
  if (!inv || inv.tenant_id !== opts.tenantId) {
    return { ok: false, detail: 'billing_not_found' };
  }

  const started = await startPixAutomaticAuthorizationForBilling({
    billingId,
    correlationId: opts.correlationId ?? `pix_auto_enable:${billingId}`,
  });
  if (!started.ok) return started;
  return {
    ok: true,
    authorization_id: started.authorization_id,
    status: started.status,
    qr_payload: started.qr_payload,
    qr_image: started.qr_image,
    billing_id: billingId,
  };
}

/**
 * Ops / recuperação: liquida fatura SaaS órfã do 1º pagamento Pix Automático
 * quando o PAYMENT_RECEIVED veio com paymentId novo e sem externalReference.
 */
export async function settleOrphanPixAutomaticFirstPayment(opts: {
  paymentId: string;
  pixQrCodeId?: string | null;
  conciliationId?: string | null;
  billingId?: string | null;
  gatewayStatus?: string | null;
}): Promise<{ ok: true; billing_id: string } | { ok: false; detail: string }> {
  const paymentId = opts.paymentId.trim();
  if (!paymentId) return { ok: false, detail: 'payment_id_required' };

  let billing: { id: string; status: string; gateway: string | null } | null = null;

  if (opts.billingId?.trim()) {
    const inv = await getInvoiceById(opts.billingId.trim());
    if (inv) billing = { id: inv.id, status: inv.status, gateway: inv.gateway };
  }

  const candidates = [opts.conciliationId, opts.pixQrCodeId]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

  for (const c of candidates) {
    if (billing) break;
    billing = await findTenantBillingByPixAutomaticConciliation(c);
  }

  if (!billing) {
    return { ok: false, detail: 'billing_not_found' };
  }

  await updateInvoiceGatewayData(billing.id, {
    gateway: billing.gateway ?? 'asaas',
    payment_method: 'PIX',
    gateway_reference_id: paymentId,
    gateway_status: opts.gatewayStatus ?? 'RECEIVED',
    gateway_metadata: {
      pix_automatic_journey: 'authorization',
      ...(candidates[0] ? { pix_automatic_conciliation_id: candidates[0] } : {}),
    },
  });

  const open = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
  if (open.has(billing.status)) {
    const { applyPaymentEvent } = await import(
      '../../modules/payments/webhook/paymentDomainService.js'
    );
    await applyPaymentEvent({
      entityType: 'tenant_billing',
      entityId: billing.id,
      currentStatus: billing.status,
      internalStatus: 'paid',
      gatewayStatus: opts.gatewayStatus ?? 'RECEIVED',
      paidAt: new Date(),
      paymentMethod: 'PIX',
    });
  }

  await writeBillingAuditEvent({
    actor: 'billing2_pix_automatic',
    actor_type: 'system',
    action: 'pix_automatic.orphan_first_payment_settled',
    entity_type: 'tenant_billing',
    entity_id: billing.id,
    reason: 'ops_reconcile_or_webhook_gap',
    origin: 'billing2',
    correlation_id: `pix_auto_orphan:${paymentId}`,
    payload: {
      payment_id: paymentId,
      pix_qr_code_id: opts.pixQrCodeId ?? null,
      conciliation_id: opts.conciliationId ?? null,
    },
  });

  return { ok: true, billing_id: billing.id };
}

/**
 * CRM1 — Pix Automático para customer_invoices / subscriptions type=customer.
 * Flag `crm.pix_automatic` OFF → callers recebem flag_off (módulo não liga sozinho).
 */
import { pool } from '../../utils/db.js';
import * as asaasClient from '../../modules/gateways/asaas/client/asaasClient.js';
import { getActiveGateway, getActiveAsaasConfigForCrm } from '../../modules/payments/gatewayProvider.js';
import { getActiveConfig } from '../paymentGatewayConfigService.js';
import {
  getCustomerInvoiceById,
  updateCustomerInvoiceGatewayData,
  updateCustomerInvoiceSubscriptionLink,
} from '../customerInvoiceService.js';
import { createSubscription } from '../billingSubscriptionService.js';
import { calculateNextBillingDate } from '../subscriptionService.js';
import { ensurePaymentCustomerForCrmClient } from '../paymentCustomersService.js';
import { mapBillingIntervalToPixFrequency } from '../billing2/billingPixAutomaticStore.js';
import { isCrmPixAutomaticEnabled, canOfferCrmPixAutomatic } from './crmPixAutomaticFlags.js';
import {
  getCrmPixAutomaticAuthBySubscriptionId,
  upsertCrmPixAutomaticAuthorization,
  markCrmPixAutomaticUserOptedOut,
  markCrmPixAutomaticRequested,
  toPublicPixAutomaticStatus,
  type PixAutomaticAuthStatus,
} from './crmPixAutomaticStore.js';

function isPixAutomaticUserOptedOffStatus(
  status: PixAutomaticAuthStatus | string | null | undefined
): boolean {
  return (
    status === 'cancelled' ||
    status === 'cleared' ||
    status === 'refused' ||
    status === 'expired'
  );
}
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

export async function findCustomerInvoiceByPixAutomaticConciliation(
  conciliationId: string
): Promise<{ id: string; status: string; gateway: string | null; tenant_id: string } | null> {
  const r = await pool.query<{
    id: string;
    status: string;
    gateway: string | null;
    tenant_id: string;
  }>(
    `SELECT ci.id, ci.status, ci.gateway, ci.tenant_id::text AS tenant_id
     FROM customer_invoices ci
     LEFT JOIN subscriptions s ON s.id = ci.subscription_id AND s.type = 'customer'
     WHERE ci.gateway_metadata->>'pix_automatic_conciliation_id' = $1
        OR s.pix_automatic_conciliation_id = $1
     ORDER BY ci.created_at DESC
     LIMIT 1`,
    [conciliationId]
  );
  return r.rows[0] ?? null;
}

export async function findCustomerInvoiceByPixAutomaticAuthId(
  authorizationId: string
): Promise<{
  id: string;
  status: string;
  gateway: string | null;
  tenant_id: string;
  gateway_reference_id: string | null;
  subscription_id: string | null;
} | null> {
  const r = await pool.query<{
    id: string;
    status: string;
    gateway: string | null;
    tenant_id: string;
    gateway_reference_id: string | null;
    subscription_id: string | null;
  }>(
    `SELECT id, status, gateway, tenant_id::text AS tenant_id, gateway_reference_id, subscription_id::text AS subscription_id
     FROM customer_invoices
     WHERE gateway_metadata->>'pix_automatic_authorization_id' = $1
       AND status IN ('pending', 'waiting_payment', 'processing', 'overdue')
     ORDER BY created_at DESC
     LIMIT 1`,
    [authorizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * CRM5 / R1B — AUTHORIZATION_ACTIVATED liquida fatura CRM aberta (1º pagamento Jornada 3).
 */
export async function settleCustomerInvoiceOnPixAutomaticActivated(opts: {
  authorizationId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  paymentStatus?: string | null;
  eventId?: string | null;
}): Promise<{ settled: boolean; invoice_id: string | null; detail: string }> {
  const openStatuses = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

  let invoice =
    (await findCustomerInvoiceByPixAutomaticAuthId(opts.authorizationId)) ?? null;

  if (!invoice && opts.subscriptionId) {
    const r = await pool.query<{
      id: string;
      status: string;
      gateway: string | null;
      tenant_id: string;
      gateway_reference_id: string | null;
      subscription_id: string | null;
    }>(
      `SELECT id, status, gateway, tenant_id::text AS tenant_id, gateway_reference_id, subscription_id::text AS subscription_id
       FROM customer_invoices
       WHERE subscription_id = $1::uuid
         AND status IN ('pending','waiting_payment','processing','overdue')
       ORDER BY created_at DESC
       LIMIT 1`,
      [opts.subscriptionId]
    );
    invoice = r.rows[0] ?? null;
  }

  if (!invoice?.id) {
    return { settled: false, invoice_id: null, detail: 'no_open_customer_invoice' };
  }
  if (!openStatuses.has(invoice.status)) {
    return { settled: false, invoice_id: invoice.id, detail: `invoice_status_${invoice.status}` };
  }

  const prevGatewayReferenceId = (invoice.gateway_reference_id ?? '').trim() || null;
  const paymentId = (opts.paymentId ?? '').trim() || null;
  const paymentStatus = (opts.paymentStatus ?? 'RECEIVED').trim() || 'RECEIVED';

  if (paymentId) {
    await updateCustomerInvoiceGatewayData(invoice.id, {
      gateway: invoice.gateway ?? 'asaas',
      payment_method: 'PIX',
      gateway_reference_id: paymentId,
      gateway_status: paymentStatus,
      gateway_metadata: {
        pix_automatic_authorization_id: opts.authorizationId,
        pix_automatic_journey: 'authorization',
      },
    });
  }

  try {
    const { applyPaymentEvent } = await import(
      '../../modules/payments/webhook/paymentDomainService.js'
    );
    await applyPaymentEvent({
      entityType: 'customer_invoice',
      entityId: invoice.id,
      currentStatus: invoice.status,
      internalStatus: 'paid',
      gatewayStatus: paymentStatus,
      paidAt: new Date(),
      paymentMethod: 'PIX',
    });
  } catch (e: unknown) {
    console.error('[crm.pixAutomatic] settle on AUTHORIZATION_ACTIVATED failed', e);
    return {
      settled: false,
      invoice_id: invoice.id,
      detail: e instanceof Error ? e.message : 'apply_payment_failed',
    };
  }

  // Cancela charge avulso antigo do ciclo (não cancela a auth).
  if (prevGatewayReferenceId && paymentId && prevGatewayReferenceId !== paymentId) {
    try {
      const { deleteGatewayChargeIfSafe } = await import('../billingGatewayChargeService.js');
      await deleteGatewayChargeIfSafe({
        tenantId: invoice.tenant_id,
        gatewayKey: invoice.gateway || 'asaas',
        gatewayReferenceId: prevGatewayReferenceId,
        gatewayStatusRaw: null,
        billingType: 'crm',
        ctx: {
          invoice_id: invoice.id,
          reason: 'cycle_paid_cleanup',
        },
      });
    } catch (e) {
      console.warn(
        '[crm.pixAutomatic] cancel prev standalone charge',
        e instanceof Error ? e.message : e
      );
    }
  }

  const { writeBillingAuditEvent } = await import('../collectionPolicy/billingAuditEventWriter.js');
  await writeBillingAuditEvent({
    actor: 'crm_pix_automatic',
    actor_type: 'webhook',
    action: 'pix_automatic.activated_settled_invoice',
    entity_type: 'customer_invoice',
    entity_id: invoice.id,
    reason: 'authorization_activated',
    origin: 'crm',
    correlation_id: opts.eventId ? `pix_auto_evt:${opts.eventId}` : null,
    payload: {
      authorization_id: opts.authorizationId,
      payment_id: paymentId,
      previous_gateway_reference_id: prevGatewayReferenceId,
    },
  });

  return { settled: true, invoice_id: invoice.id, detail: 'paid' };
}

/**
 * CRM5 — cancela auth Pix Auto ao cancelar assinatura customer (fail-open caller).
 */
export async function cancelPixAutomaticAuthorizationForCrmSubscription(opts: {
  tenantId: string;
  subscriptionId: string;
  correlationId?: string | null;
  reason?: string;
}): Promise<{ ok: true; detail: string } | { ok: false; detail: string }> {
  const auth = await getCrmPixAutomaticAuthBySubscriptionId(opts.subscriptionId);

  if (auth?.authorization_id && !isPixAutomaticUserOptedOffStatus(auth.status)) {
    const asaasConfig = await getActiveAsaasConfigForCrm(opts.tenantId);
    try {
      if (asaasConfig?.api_key) {
        await asaasClient.cancelPixAutomaticAuthorization(auth.authorization_id, asaasConfig);
      }
    } catch (e: unknown) {
      console.warn(
        '[crm.pixAutomatic] Asaas cancel auth on subscription cancel failed; clearing local',
        e instanceof Error ? e.message : e
      );
    }
  }

  await markCrmPixAutomaticUserOptedOut({
    subscriptionId: opts.subscriptionId,
    tenantId: opts.tenantId,
  });

  // Restaura PIX avulso na fatura aberta mais recente, se houver.
  const openInv = await pool.query<{ id: string }>(
    `SELECT id FROM customer_invoices
     WHERE subscription_id = $1::uuid AND tenant_id = $2::uuid
       AND status IN ('pending','waiting_payment','processing','overdue')
     ORDER BY created_at DESC LIMIT 1`,
    [opts.subscriptionId, opts.tenantId]
  );
  if (openInv.rows[0]?.id) {
    await restoreStandalonePixAfterCrmPixAutomaticOff({
      tenantId: opts.tenantId,
      invoiceId: openInv.rows[0].id,
    });
  }

  const { writeBillingAuditEvent } = await import('../collectionPolicy/billingAuditEventWriter.js');
  await writeBillingAuditEvent({
    actor: 'crm_pix_automatic',
    actor_type: 'system',
    action: 'pix_automatic.auth_cancelled',
    entity_type: 'subscription',
    entity_id: opts.subscriptionId,
    reason: opts.reason ?? 'subscription_cancelled',
    origin: 'crm',
    correlation_id: opts.correlationId ?? null,
    payload: { authorization_id: auth?.authorization_id ?? null },
  });

  return {
    ok: true,
    detail: auth?.authorization_id ? 'cancelled' : 'opted_out_local',
  };
}

/**
 * Draft `trialing` se a fatura avulsa ainda não tem subscription_id (D2 / Sprint A).
 */
export async function ensureCustomerSubscriptionLinkedToOpenInvoice(
  invoiceId: string
): Promise<{ subscriptionId: string } | null> {
  const inv = await getCustomerInvoiceById(invoiceId);
  if (!inv) return null;
  if (inv.subscription_id) return { subscriptionId: inv.subscription_id };
  if (!inv.client_id) return null;

  const due = ymd(inv.due_date);
  const anchorDay = new Date(`${due}T12:00:00Z`).getUTCDate();
  const periodEnd = calculateNextBillingDate(due, 'monthly', anchorDay);

  const subscription = await createSubscription({
    type: 'customer',
    tenant_id: inv.tenant_id,
    customer_id: inv.client_id,
    plan_id: null,
    amount_cents: inv.amount_cents,
    billing_interval: 'monthly',
    next_billing_date: periodEnd,
    current_period_start: due,
    current_period_end: periodEnd,
    billing_anchor_day: anchorDay,
    status: 'trialing',
    created_by: 'crm_pix_automatic',
    default_payment_method: 'PIX',
    gateway: inv.gateway ?? 'asaas',
  });

  await updateCustomerInvoiceSubscriptionLink(invoiceId, subscription.id, due, periodEnd);
  return { subscriptionId: subscription.id };
}

/**
 * Jornada 3 — cria autorização Asaas (QR composto) para fatura CRM.
 */
export async function startPixAutomaticAuthorizationForCustomerInvoice(opts: {
  invoiceId: string;
  tenantId?: string | null;
  correlationId?: string | null;
}): Promise<
  | {
      ok: true;
      authorization_id: string;
      status: PixAutomaticAuthStatus;
      qr_payload: string | null;
      qr_image: string | null;
      subscription_id: string;
    }
  | { ok: false; detail: string }
> {
  if (!(await isCrmPixAutomaticEnabled())) {
    return { ok: false, detail: 'flag_crm_pix_automatic_off' };
  }

  const inv = await getCustomerInvoiceById(opts.invoiceId);
  if (!inv) return { ok: false, detail: 'invoice_not_found' };
  if (opts.tenantId && inv.tenant_id !== opts.tenantId) {
    return { ok: false, detail: 'tenant_mismatch' };
  }
  if (inv.status === 'paid' || inv.status === 'cancelled') {
    return { ok: false, detail: `invoice_status_${inv.status}` };
  }
  if (inv.amount_cents <= 0) return { ok: false, detail: 'zero_amount' };
  if (!inv.client_id) return { ok: false, detail: 'missing_client_id' };

  const configProbe = await getActiveConfig('crm', inv.tenant_id);
  const gwKey = configProbe?.gateway_key ?? inv.gateway ?? 'asaas';
  const offer = await canOfferCrmPixAutomatic({ gatewayKey: gwKey });
  if (!offer.available) {
    return { ok: false, detail: `gate_${offer.reason}` };
  }

  let invLinked = inv;
  let subscriptionId = inv.subscription_id;
  if (!subscriptionId) {
    try {
      const linked = await ensureCustomerSubscriptionLinkedToOpenInvoice(opts.invoiceId);
      subscriptionId = linked?.subscriptionId ?? null;
      if (subscriptionId) {
        invLinked = (await getCustomerInvoiceById(opts.invoiceId)) ?? invLinked;
      }
    } catch (e) {
      console.warn('[crm.pixAutomatic] ensure subscription link', e);
    }
  }
  if (!subscriptionId) return { ok: false, detail: 'missing_subscription_id' };
  const tenantId = invLinked.tenant_id;

  const existing = await getCrmPixAutomaticAuthBySubscriptionId(subscriptionId);
  if (existing?.status === 'active' && existing.authorization_id) {
    return { ok: false, detail: 'auth_already_active' };
  }
  if (existing?.status === 'pending' && existing.qr_payload && existing.authorization_id) {
    // Propaga SSOT da assinatura para esta fatura (próximo ciclo / enable sem recriar auth).
    await updateCustomerInvoiceGatewayData(opts.invoiceId, {
      gateway: invLinked.gateway ?? 'asaas',
      payment_method: invLinked.payment_method ?? 'PIX',
      gateway_reference_id: invLinked.gateway_reference_id ?? null,
      gateway_status: invLinked.gateway_status ?? null,
      gateway_metadata: {
        pix_automatic_requested: true,
        pix_automatic_authorization_id: existing.authorization_id,
        pix_automatic_conciliation_id: existing.conciliation_id ?? null,
        pix_automatic_journey: 'authorization',
        pix_copy_paste: existing.qr_payload,
        pix_qr_code: existing.qr_image,
        pixCopyPaste: existing.qr_payload,
        pixQrCode: existing.qr_image,
      },
    });
    return {
      ok: true,
      authorization_id: existing.authorization_id,
      status: 'pending',
      qr_payload: existing.qr_payload,
      qr_image: existing.qr_image,
      subscription_id: subscriptionId,
    };
  }

  const gateway = await getActiveGateway({ billingType: 'crm', tenantId });
  if (!gateway) return { ok: false, detail: 'no_active_gateway' };

  const clientRow = await pool.query<{
    name: string;
    email: string | null;
    phone: string | null;
    cpf_cnpj: string | null;
  }>(
    `SELECT c.name, c.email, c.phone, c.cpf_cnpj
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1`,
    [invLinked.client_id, tenantId]
  );
  const client = clientRow.rows[0];
  if (!client) return { ok: false, detail: 'client_not_found' };
  if (!client.cpf_cnpj?.trim()) return { ok: false, detail: 'missing_cpf_cnpj' };
  const clientId = invLinked.client_id;
  if (!clientId) return { ok: false, detail: 'missing_client_id' };

  const customerId = await ensurePaymentCustomerForCrmClient(
    tenantId,
    gwKey,
    clientId,
    gateway,
    {
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? undefined,
      cpfCnpj: client.cpf_cnpj.trim(),
    }
  );
  if (!customerId) return { ok: false, detail: 'ensure_customer_failed' };

  const asaasConfig = await getActiveAsaasConfigForCrm(tenantId);
  if (!asaasConfig?.api_key) return { ok: false, detail: 'asaas_config_missing' };

  const subInterval = await pool.query<{ billing_interval: string | null }>(
    `SELECT billing_interval FROM subscriptions WHERE id = $1::uuid`,
    [subscriptionId]
  );
  const frequency = mapBillingIntervalToPixFrequency(subInterval.rows[0]?.billing_interval);
  const due = ymd(invLinked.due_date);
  const value = invLinked.amount_cents / 100;
  const contractId = `crm-${subscriptionId.replace(/-/g, '').slice(0, 28)}`;

  let raw: Record<string, unknown>;
  try {
    raw = await asaasClient.createPixAutomaticAuthorization(
      {
        customerId,
        frequency,
        contractId,
        startDate: due,
        value,
        description: (invLinked.invoice_number ?? 'Cobranca CRM').slice(0, 35),
        immediateValue: value,
        immediateDueDate: due,
        immediateDescription: (invLinked.invoice_number ?? '1a cobranca').slice(0, 35),
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

  await upsertCrmPixAutomaticAuthorization({
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

  const prevMeta =
    invLinked.gateway_metadata && typeof invLinked.gateway_metadata === 'object'
      ? (invLinked.gateway_metadata as Record<string, unknown>)
      : {};
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

  await updateCustomerInvoiceGatewayData(opts.invoiceId, {
    gateway: gwKey,
    payment_method: 'PIX',
    gateway_reference_id: invLinked.gateway_reference_id ?? null,
    gateway_status: 'PENDING_PIX_AUTOMATIC_AUTH',
    gateway_metadata: {
      standalone_pix_copy_paste: stashCopy,
      standalone_pix_qr_code: stashQr,
      pix_automatic_requested: true,
      pix_automatic_authorization_id: extracted.authorizationId,
      pix_automatic_conciliation_id: extracted.conciliationId,
      pix_copy_paste: extracted.qrPayload,
      pix_qr_code: extracted.qrImage,
      // GET /pay lê camelCase do charge avulso — espelhar para o QR composto.
      pixCopyPaste: extracted.qrPayload,
      pixQrCode: extracted.qrImage,
      pix_automatic_journey: 'authorization',
    },
  });

  return {
    ok: true,
    authorization_id: extracted.authorizationId,
    status: extracted.status === 'active' ? 'active' : 'pending',
    qr_payload: extracted.qrPayload,
    qr_image: extracted.qrImage,
    subscription_id: subscriptionId,
  };
}

export async function restoreStandalonePixAfterCrmPixAutomaticOff(opts: {
  tenantId: string;
  invoiceId: string;
}): Promise<{
  invoice_id: string | null;
  pix_copy_paste: string | null;
  pix_qr_code: string | null;
}> {
  const inv = await getCustomerInvoiceById(opts.invoiceId);
  if (!inv || inv.tenant_id !== opts.tenantId) {
    return { invoice_id: null, pix_copy_paste: null, pix_qr_code: null };
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
      const asaasConfig = await getActiveAsaasConfigForCrm(opts.tenantId);
      const pixData = await asaasClient.getPixQrCode(inv.gateway_reference_id.trim(), asaasConfig);
      if (pixData?.payload && !copy) copy = pixData.payload;
      if (pixData?.encodedImage && !qr) {
        qr = pixData.encodedImage.startsWith('data:')
          ? pixData.encodedImage
          : `data:image/png;base64,${pixData.encodedImage}`;
      }
    } catch (e) {
      console.warn('[crm.pixAutomatic] restore standalone PIX QR failed', e);
    }
  }

  if (qr && !qr.startsWith('data:') && !qr.startsWith('http')) {
    qr = `data:image/png;base64,${qr}`;
  }

  const nextStatus =
    inv.gateway_status === 'PENDING_PIX_AUTOMATIC_AUTH' ? 'PENDING' : inv.gateway_status;

  await updateCustomerInvoiceGatewayData(opts.invoiceId, {
    gateway: inv.gateway ?? 'asaas',
    payment_method: inv.payment_method ?? 'PIX',
    gateway_reference_id: inv.gateway_reference_id ?? null,
    gateway_status: nextStatus,
    gateway_metadata: {
      pix_copy_paste: copy,
      pix_qr_code: qr,
      pixCopyPaste: copy,
      pixQrCode: qr,
      pix_automatic_authorization_id: null,
      pix_automatic_conciliation_id: null,
      pix_automatic_journey: null,
      standalone_pix_copy_paste: copy,
      standalone_pix_qr_code: qr,
    },
  });

  return { invoice_id: opts.invoiceId, pix_copy_paste: copy, pix_qr_code: qr };
}

/**
 * Cancela auth Asaas (se houver) + opt-out `cleared` + restore PIX avulso.
 */
export async function cancelPixAutomaticAuthorizationForCustomerInvoice(opts: {
  tenantId: string;
  invoiceId: string;
  subscriptionId?: string | null;
  correlationId?: string | null;
}): Promise<
  | {
      ok: true;
      detail: string;
      invoice_id: string | null;
      pix_copy_paste: string | null;
      pix_qr_code: string | null;
    }
  | { ok: false; detail: string }
> {
  const inv = await getCustomerInvoiceById(opts.invoiceId);
  if (!inv || inv.tenant_id !== opts.tenantId) {
    return { ok: false, detail: 'invoice_not_found' };
  }

  const subscriptionId = opts.subscriptionId ?? inv.subscription_id;
  if (!subscriptionId) {
    const restored = await restoreStandalonePixAfterCrmPixAutomaticOff({
      tenantId: opts.tenantId,
      invoiceId: opts.invoiceId,
    });
    return { ok: true, detail: 'no_subscription_restored_pix', ...restored };
  }

  const auth = await getCrmPixAutomaticAuthBySubscriptionId(subscriptionId);

  if (auth?.authorization_id && !isPixAutomaticUserOptedOffStatus(auth.status)) {
    const asaasConfig = await getActiveAsaasConfigForCrm(opts.tenantId);
    try {
      if (asaasConfig?.api_key) {
        await asaasClient.cancelPixAutomaticAuthorization(auth.authorization_id, asaasConfig);
      }
    } catch (e: unknown) {
      console.warn(
        '[crm.pixAutomatic] Asaas cancel auth failed; clearing local',
        e instanceof Error ? e.message : e
      );
    }
  }

  await markCrmPixAutomaticUserOptedOut({
    subscriptionId,
    tenantId: opts.tenantId,
  });

  const restored = await restoreStandalonePixAfterCrmPixAutomaticOff({
    tenantId: opts.tenantId,
    invoiceId: opts.invoiceId,
  });

  return {
    ok: true,
    detail: auth?.authorization_id ? 'cancelled' : 'opted_out_local',
    ...restored,
  };
}

export async function getCrmPixAutomaticPreferenceForSubscription(opts: {
  subscriptionId: string;
  tenantId?: string | null;
  gatewayKey?: string | null;
}): Promise<{
  available: boolean;
  status: PixAutomaticAuthStatus | null;
  has_active: boolean;
  switch_on: boolean;
  user_opted_off: boolean;
  /** CRM7/CRM8 — sempre false; switch ON com requested/pending/active (SSOT). */
  default_on: boolean;
  authorization_id: string | null;
  qr_payload: string | null;
  qr_image: string | null;
  subscription_id: string | null;
  open_invoice_id: string | null;
}> {
  const auth = await getCrmPixAutomaticAuthBySubscriptionId(opts.subscriptionId);
  const pub = toPublicPixAutomaticStatus(auth);
  const status = pub?.status ?? null;
  const has_active = pub?.has_active ?? false;
  const user_opted_off = isPixAutomaticUserOptedOffStatus(status);
  const switch_on =
    !user_opted_off && (has_active || status === 'pending' || status === 'requested');
  const gwKey = opts.gatewayKey ?? auth?.gateway ?? 'asaas';
  const offer = await canOfferCrmPixAutomatic({ gatewayKey: gwKey });
  const available = offer.available || Boolean(auth?.authorization_id || status);

  let open_invoice_id: string | null = null;
  if (opts.tenantId) {
    const open = await findOpenCustomerInvoiceForSubscription({
      tenantId: opts.tenantId,
      subscriptionId: opts.subscriptionId,
    });
    open_invoice_id = open?.id ?? null;
  }

  return {
    available,
    status,
    has_active,
    switch_on,
    user_opted_off,
    // SSOT: nunca default ON cosmético — só requested/pending/active ligam o switch.
    default_on: false,
    authorization_id: auth?.authorization_id ?? null,
    qr_payload: pub?.qr_payload ?? null,
    qr_image: pub?.qr_image ?? null,
    subscription_id: auth?.subscription_id ?? opts.subscriptionId,
    open_invoice_id,
  };
}

export async function findOpenCustomerInvoiceForSubscription(opts: {
  tenantId: string;
  subscriptionId: string;
}): Promise<{ id: string; status: string } | null> {
  const r = await pool.query<{ id: string; status: string }>(
    `SELECT id, status
     FROM customer_invoices
     WHERE subscription_id = $1::uuid
       AND tenant_id = $2::uuid
       AND status IN ('pending','waiting_payment','processing','overdue')
     ORDER BY created_at DESC
     LIMIT 1`,
    [opts.subscriptionId, opts.tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * CRM7/CRM8 — enable a partir da assinatura.
 * Com fatura aberta → start auth Asaas.
 * Sem fatura → grava intenção `requested` (não cria fatura; não chama Asaas).
 */
export async function enablePixAutomaticForCrmSubscription(opts: {
  tenantId: string;
  subscriptionId: string;
  invoiceId?: string | null;
  correlationId?: string | null;
}): Promise<
  | {
      ok: true;
      authorization_id: string | null;
      status: PixAutomaticAuthStatus;
      qr_payload: string | null;
      qr_image: string | null;
      invoice_id: string | null;
      deferred?: boolean;
    }
  | { ok: false; detail: string }
> {
  if (!(await isCrmPixAutomaticEnabled())) {
    return { ok: false, detail: 'flag_crm_pix_automatic_off' };
  }

  const sub = await getCrmPixAutomaticAuthBySubscriptionId(opts.subscriptionId);
  const subRow = await pool.query<{
    id: string;
    tenant_id: string;
    type: string;
    gateway: string | null;
    status: string;
  }>(
    `SELECT id::text AS id, tenant_id::text AS tenant_id, type, gateway, status
     FROM subscriptions
     WHERE id = $1::uuid
     LIMIT 1`,
    [opts.subscriptionId]
  );
  const row = subRow.rows[0];
  if (!row || row.tenant_id !== opts.tenantId || row.type !== 'customer') {
    return { ok: false, detail: 'subscription_not_found' };
  }
  if (row.status !== 'active' && row.status !== 'trialing') {
    return { ok: false, detail: `subscription_status_${row.status}` };
  }

  if (sub?.status === 'active' && sub.authorization_id) {
    return { ok: false, detail: 'auth_already_active' };
  }

  const offer = await canOfferCrmPixAutomatic({ gatewayKey: row.gateway ?? 'asaas' });
  if (!offer.available) {
    return { ok: false, detail: `gate_${offer.reason}` };
  }

  let invoiceId = opts.invoiceId?.trim() || null;
  if (!invoiceId) {
    const open = await findOpenCustomerInvoiceForSubscription({
      tenantId: opts.tenantId,
      subscriptionId: opts.subscriptionId,
    });
    invoiceId = open?.id ?? null;
  }

  if (invoiceId) {
    const started = await startPixAutomaticAuthorizationForCustomerInvoice({
      invoiceId,
      tenantId: opts.tenantId,
      correlationId: opts.correlationId ?? `crm_pix_auto_enable:${opts.subscriptionId}`,
    });
    if (!started.ok) return started;
    return {
      ok: true,
      authorization_id: started.authorization_id,
      status: started.status,
      qr_payload: started.qr_payload,
      qr_image: started.qr_image,
      invoice_id: invoiceId,
    };
  }

  // CRM8 — intenção adiada (sem fatura aberta).
  if (sub?.status === 'pending' && sub.authorization_id) {
    return {
      ok: true,
      authorization_id: sub.authorization_id,
      status: 'pending',
      qr_payload: sub.qr_payload,
      qr_image: sub.qr_image,
      invoice_id: null,
      deferred: true,
    };
  }
  if (sub?.status === 'requested') {
    return {
      ok: true,
      authorization_id: null,
      status: 'requested',
      qr_payload: null,
      qr_image: null,
      invoice_id: null,
      deferred: true,
    };
  }

  await markCrmPixAutomaticRequested({
    subscriptionId: opts.subscriptionId,
    tenantId: opts.tenantId,
    gateway: row.gateway ?? 'asaas',
  });

  try {
    const { writeBillingAuditEvent } = await import('../collectionPolicy/billingAuditEventWriter.js');
    await writeBillingAuditEvent({
      actor: 'crm_pix_automatic',
      actor_type: 'system',
      action: 'pix_automatic.intent_requested',
      entity_type: 'subscription',
      entity_id: opts.subscriptionId,
      reason: 'enable_without_open_invoice',
      origin: 'crm',
      correlation_id: opts.correlationId ?? `crm_pix_auto_enable:${opts.subscriptionId}`,
      payload: {},
    });
  } catch (e) {
    console.warn('[crm.pixAutomatic] audit intent_requested', e);
  }

  return {
    ok: true,
    authorization_id: null,
    status: 'requested',
    qr_payload: null,
    qr_image: null,
    invoice_id: null,
    deferred: true,
  };
}

export type CrmPixAutomaticCreateResult = {
  requested: boolean;
  started: boolean;
  detail: string;
  warning?: boolean;
  authorization_id?: string | null;
  status?: PixAutomaticAuthStatus | null;
};

/**
 * CRM2 — após criar fatura: tenta start auth se pedido; degrada para PIX avulso se Asaas falhar.
 */
export async function finalizePixAutomaticOnCustomerInvoiceCreate(opts: {
  tenantId: string;
  invoiceId: string;
  pixAutomaticRequested: boolean;
  allowedPaymentMethods?: string[] | null;
}): Promise<CrmPixAutomaticCreateResult | null> {
  if (!opts.pixAutomaticRequested) return null;

  const inv = await getCustomerInvoiceById(opts.invoiceId);
  if (!inv || inv.tenant_id !== opts.tenantId) {
    return { requested: true, started: false, detail: 'invoice_not_found', warning: true };
  }

  const allowed = opts.allowedPaymentMethods;
  if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes('PIX')) {
    await updateCustomerInvoiceGatewayData(opts.invoiceId, {
      gateway: inv.gateway ?? 'asaas',
      payment_method: inv.payment_method ?? null,
      gateway_reference_id: inv.gateway_reference_id ?? null,
      gateway_status: inv.gateway_status ?? null,
      gateway_metadata: {
        pix_automatic_requested: true,
        pix_automatic_start_error: 'pix_not_in_allowed_methods',
      },
    });
    return {
      requested: true,
      started: false,
      detail: 'pix_not_in_allowed_methods',
      warning: true,
    };
  }

  if (!inv.client_id) {
    await updateCustomerInvoiceGatewayData(opts.invoiceId, {
      gateway: inv.gateway ?? 'asaas',
      payment_method: inv.payment_method ?? null,
      gateway_reference_id: inv.gateway_reference_id ?? null,
      gateway_status: inv.gateway_status ?? null,
      gateway_metadata: {
        pix_automatic_requested: true,
      },
    });
    return {
      requested: true,
      started: false,
      detail: 'deferred_until_client',
    };
  }

  const started = await startPixAutomaticAuthorizationForCustomerInvoice({
    invoiceId: opts.invoiceId,
    tenantId: opts.tenantId,
    correlationId: `crm2_create:${opts.invoiceId}`,
  });

  if (!started.ok) {
    await updateCustomerInvoiceGatewayData(opts.invoiceId, {
      gateway: inv.gateway ?? 'asaas',
      payment_method: inv.payment_method ?? null,
      gateway_reference_id: inv.gateway_reference_id ?? null,
      gateway_status: inv.gateway_status ?? null,
      gateway_metadata: {
        pix_automatic_requested: true,
        pix_automatic_start_error: started.detail,
      },
    });
    return {
      requested: true,
      started: false,
      detail: started.detail,
      warning: true,
    };
  }

  return {
    requested: true,
    started: true,
    detail: 'ok',
    authorization_id: started.authorization_id,
    status: started.status,
  };
}

/**
 * CRM4 — cria cobrança PIX vinculada a autorização ACTIVE (janela 2–10 dias úteis).
 * Espelho de `createPixAutomaticInstructionForBilling` (billing2).
 */
export async function createPixAutomaticInstructionForCustomerInvoice(opts: {
  invoiceId: string;
  tenantId?: string | null;
  correlationId?: string | null;
  attempt?: number;
  /** customerId já resolvido pelo orchestrator (opcional). */
  customerId?: string | null;
}): Promise<{ ok: true; payment_id: string } | { ok: false; detail: string }> {
  if (!(await isCrmPixAutomaticEnabled())) {
    return { ok: false, detail: 'flag_crm_pix_automatic_off' };
  }

  const inv = await getCustomerInvoiceById(opts.invoiceId);
  if (!inv) return { ok: false, detail: 'invoice_not_found' };
  if (opts.tenantId && inv.tenant_id !== opts.tenantId) {
    return { ok: false, detail: 'tenant_mismatch' };
  }
  if (inv.status === 'paid') return { ok: false, detail: 'already_paid' };
  if (inv.status === 'cancelled') return { ok: false, detail: 'invoice_cancelled' };
  if (inv.amount_cents <= 0) return { ok: false, detail: 'zero_amount' };

  const configProbe = await getActiveConfig('crm', inv.tenant_id);
  const gwKey = configProbe?.gateway_key ?? inv.gateway ?? 'asaas';
  const offer = await canOfferCrmPixAutomatic({ gatewayKey: gwKey });
  if (!offer.available) {
    return { ok: false, detail: `gate_${offer.reason}` };
  }

  const subscriptionId = inv.subscription_id;
  if (!subscriptionId) return { ok: false, detail: 'missing_subscription_id' };

  const auth = await getCrmPixAutomaticAuthBySubscriptionId(subscriptionId);
  if (!auth?.authorization_id || auth.status !== 'active') {
    return { ok: false, detail: 'auth_not_active' };
  }

  const { isWithinPixAutomaticInstructionWindow } = await import(
    '../billing2/billingPixAutomaticStore.js'
  );
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

  const gateway = await getActiveGateway({ billingType: 'crm', tenantId: inv.tenant_id });
  if (!gateway) return { ok: false, detail: 'no_active_gateway' };

  let customerId = opts.customerId?.trim() || null;
  if (!customerId) {
    const invoiceClientId = inv.client_id;
    if (!invoiceClientId) return { ok: false, detail: 'missing_client_id' };
    const clientRow = await pool.query<{
      name: string;
      email: string | null;
      phone: string | null;
      cpf_cnpj: string | null;
    }>(
      `SELECT c.name, c.email, c.phone, c.cpf_cnpj
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
       WHERE c.id = $1`,
      [invoiceClientId, inv.tenant_id]
    );
    const client = clientRow.rows[0];
    if (!client) return { ok: false, detail: 'client_not_found' };
    if (!client.cpf_cnpj?.trim()) return { ok: false, detail: 'missing_cpf_cnpj' };
    customerId = await ensurePaymentCustomerForCrmClient(
      inv.tenant_id,
      gwKey,
      invoiceClientId,
      gateway,
      {
        name: client.name,
        email: client.email ?? '',
        phone: client.phone ?? undefined,
        cpfCnpj: client.cpf_cnpj.trim(),
      }
    );
  }
  if (!customerId) return { ok: false, detail: 'ensure_customer_failed' };

  const idempotencyKey =
    inv.idempotency_key ??
    `crm_pix_auto_instr_${opts.invoiceId}_${opts.attempt ?? 1}`;

  try {
    const charge = await gateway.createCharge({
      customerId,
      amountCents: inv.amount_cents,
      dueDate: due,
      paymentMethod: 'PIX',
      description: inv.invoice_number ?? `Pix Auto CRM ${opts.invoiceId}`,
      idempotencyKey,
      externalReference: inv.client_id ?? inv.tenant_id,
      pixAutomaticAuthorizationId: auth.authorization_id,
    });

    await updateCustomerInvoiceGatewayData(opts.invoiceId, {
      gateway: gwKey,
      payment_method: 'PIX',
      gateway_reference_id: charge.paymentId,
      gateway_status: charge.status,
      idempotency_key: idempotencyKey,
      gateway_metadata: {
        pix_automatic_authorization_id: auth.authorization_id,
        pix_automatic_journey: 'instruction',
        pix_copy_paste: charge.pixCopyPaste ?? null,
        pix_qr_code: charge.pixQrCode ?? null,
        pixCopyPaste: charge.pixCopyPaste ?? null,
        pixQrCode: charge.pixQrCode ?? null,
      },
    });

    const { writeBillingAuditEvent } = await import(
      '../collectionPolicy/billingAuditEventWriter.js'
    );
    await writeBillingAuditEvent({
      actor: 'crm_pix_automatic',
      actor_type: 'system',
      action: 'pix_automatic.instruction_created',
      entity_type: 'customer_invoice',
      entity_id: opts.invoiceId,
      reason: 'instruction_within_window',
      origin: 'crm',
      correlation_id: opts.correlationId ?? null,
      payload: {
        payment_id: charge.paymentId,
        authorization_id: auth.authorization_id,
        subscription_id: subscriptionId,
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

/**
 * CRM6 / ops — liquida customer_invoice órfã do 1º pagamento Pix Automático
 * quando o PAYMENT_RECEIVED veio com paymentId novo e sem externalReference.
 * **Não** reenviar o mesmo webhook (idempotência); usar este caminho.
 */
export async function settleOrphanPixAutomaticCustomerInvoice(opts: {
  paymentId: string;
  pixQrCodeId?: string | null;
  conciliationId?: string | null;
  invoiceId?: string | null;
  authorizationId?: string | null;
  gatewayStatus?: string | null;
}): Promise<{ ok: true; invoice_id: string } | { ok: false; detail: string }> {
  const paymentId = opts.paymentId.trim();
  if (!paymentId) return { ok: false, detail: 'payment_id_required' };

  let invoice: {
    id: string;
    status: string;
    gateway: string | null;
    tenant_id?: string;
  } | null = null;

  if (opts.invoiceId?.trim()) {
    const inv = await getCustomerInvoiceById(opts.invoiceId.trim());
    if (inv) {
      invoice = {
        id: inv.id,
        status: inv.status,
        gateway: inv.gateway,
        tenant_id: inv.tenant_id,
      };
    }
  }

  const candidates = [opts.conciliationId, opts.pixQrCodeId]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

  for (const c of candidates) {
    if (invoice) break;
    const found = await findCustomerInvoiceByPixAutomaticConciliation(c);
    if (found) invoice = found;
  }

  if (!invoice && opts.authorizationId?.trim()) {
    const byAuth = await findCustomerInvoiceByPixAutomaticAuthId(opts.authorizationId.trim());
    if (byAuth) invoice = byAuth;
  }

  if (!invoice) {
    return { ok: false, detail: 'invoice_not_found' };
  }

  const prevRef = (
    (await getCustomerInvoiceById(invoice.id))?.gateway_reference_id ?? ''
  ).trim();

  await updateCustomerInvoiceGatewayData(invoice.id, {
    gateway: invoice.gateway ?? 'asaas',
    payment_method: 'PIX',
    gateway_reference_id: paymentId,
    gateway_status: opts.gatewayStatus ?? 'RECEIVED',
    gateway_metadata: {
      pix_automatic_journey: 'authorization',
      ...(candidates[0] ? { pix_automatic_conciliation_id: candidates[0] } : {}),
      ...(opts.authorizationId?.trim()
        ? { pix_automatic_authorization_id: opts.authorizationId.trim() }
        : {}),
    },
  });

  const open = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);
  if (open.has(invoice.status)) {
    const { applyPaymentEvent } = await import(
      '../../modules/payments/webhook/paymentDomainService.js'
    );
    await applyPaymentEvent({
      entityType: 'customer_invoice',
      entityId: invoice.id,
      currentStatus: invoice.status,
      internalStatus: 'paid',
      gatewayStatus: opts.gatewayStatus ?? 'RECEIVED',
      paidAt: new Date(),
      paymentMethod: 'PIX',
    });
  }

  if (prevRef && prevRef !== paymentId && invoice.tenant_id) {
    try {
      const { deleteGatewayChargeIfSafe } = await import('../billingGatewayChargeService.js');
      await deleteGatewayChargeIfSafe({
        tenantId: invoice.tenant_id,
        gatewayKey: invoice.gateway || 'asaas',
        gatewayReferenceId: prevRef,
        gatewayStatusRaw: null,
        billingType: 'crm',
        ctx: {
          invoice_id: invoice.id,
          reason: 'cycle_paid_cleanup',
        },
      });
    } catch (e) {
      console.warn(
        '[crm.pixAutomatic] orphan settle cancel prev charge',
        e instanceof Error ? e.message : e
      );
    }
  }

  const { writeBillingAuditEvent } = await import('../collectionPolicy/billingAuditEventWriter.js');
  await writeBillingAuditEvent({
    actor: 'crm_pix_automatic',
    actor_type: 'system',
    action: 'pix_automatic.orphan_first_payment_settled',
    entity_type: 'customer_invoice',
    entity_id: invoice.id,
    reason: 'ops_reconcile_or_webhook_gap',
    origin: 'crm',
    correlation_id: `crm_pix_auto_orphan:${paymentId}`,
    payload: {
      payment_id: paymentId,
      pix_qr_code_id: opts.pixQrCodeId ?? null,
      conciliation_id: opts.conciliationId ?? null,
      authorization_id: opts.authorizationId ?? null,
    },
  });

  return { ok: true, invoice_id: invoice.id };
}

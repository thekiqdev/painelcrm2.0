/**
 * Fase 3 — Checkout Pro (preferência Mercado Pago) para faturas CRM.
 * Não marca paga sem webhook; não altera Asaas.
 */
import { pool } from '../utils/db.js';
import type { CustomerInvoiceRow } from './customerInvoiceService.js';
import { updateCustomerInvoiceGatewayData } from './customerInvoiceService.js';
import { getInvoiceById } from './customerBillingService.js';
import { getMercadoPagoAccessTokenForTenant } from './mercadoPagoIntegrationService.js';
import { getMercadoPagoTenantConfigRow } from './mercadoPagoCredentialsRepository.js';
import { createCheckoutPreference } from '../modules/gateways/mercado_pago/client/mercadoPagoCheckoutPreferencesApi.js';
import {
  getMercadoPagoConfiguredOAuthEnvironment,
  getMercadoPagoFrontendRedirectBase,
  getMercadoPagoPreferenceNotificationUrl,
  isMercadoPagoGatewayEnabled,
} from '../config/mercadoPagoGatewayEnv.js';
import { createInvoicePaymentAttempt } from './customerInvoicePaymentAttemptsService.js';
import { createClientTimelineEvent } from './clientTimelineEventsService.js';
import { billingLog } from './billingLogger.js';
import type { GatewayPaymentData } from '../modules/payments/paymentGatewayTypes.js';

const GATEWAY_KEY = 'mercado_pago';

const CHARGEABLE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

export type MercadoPagoCheckoutCheckoutMeta = {
  preference_id: string;
  init_point: string;
  sandbox_init_point?: string;
  external_reference: string;
  created_at: string;
  notification_url?: string | null;
  oauth_environment: 'sandbox' | 'production';
};

function stableIdempotencyKey(invoiceId: string): string {
  return `mp_pref_${invoiceId}`;
}

function getCheckoutMetaFromInvoice(inv: CustomerInvoiceRow): MercadoPagoCheckoutCheckoutMeta | null {
  const meta = inv.gateway_metadata as Record<string, unknown> | null | undefined;
  const block = meta?.mercado_pago_checkout as Record<string, unknown> | undefined;
  if (!block || typeof block !== 'object') return null;
  const preference_id = typeof block.preference_id === 'string' ? block.preference_id : '';
  const init_point = typeof block.init_point === 'string' ? block.init_point : '';
  if (!preference_id || !init_point) return null;
  return {
    preference_id,
    init_point,
    sandbox_init_point: typeof block.sandbox_init_point === 'string' ? block.sandbox_init_point : undefined,
    external_reference: typeof block.external_reference === 'string' ? block.external_reference : inv.id,
    created_at: typeof block.created_at === 'string' ? block.created_at : new Date().toISOString(),
    notification_url: typeof block.notification_url === 'string' ? block.notification_url : null,
    oauth_environment:
      block.oauth_environment === 'sandbox' || block.oauth_environment === 'production'
        ? block.oauth_environment
        : 'production',
  };
}

function primaryInitPoint(
  initPoint: string | undefined,
  sandboxInit: string | undefined,
  oauthEnv: 'sandbox' | 'production',
): string {
  if (oauthEnv === 'sandbox' && sandboxInit) return sandboxInit;
  return initPoint ?? sandboxInit ?? '';
}

async function fetchClientPayer(
  tenantId: string,
  clientId: string | null,
): Promise<{ name?: string; email?: string }> {
  if (!clientId) return {};
  const r = await pool.query<{ name: string | null; email: string | null }>(
    `SELECT c.name, c.email
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [clientId, tenantId],
  );
  const row = r.rows[0];
  if (!row) return {};
  const name = row.name?.trim() || undefined;
  const email = row.email?.trim() || undefined;
  return {
    ...(name ? { name: name.slice(0, 256) } : {}),
    ...(email ? { email: email.slice(0, 256) } : {}),
  };
}

async function mergeGatewayMetadataOnly(
  invoiceId: string,
  tenantId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const cur = await pool.query<{ gateway_metadata: Record<string, unknown> | null }>(
    `SELECT gateway_metadata FROM customer_invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [invoiceId, tenantId],
  );
  const prev = (cur.rows[0]?.gateway_metadata ?? {}) as Record<string, unknown>;
  const next = { ...prev, ...patch };
  await pool.query(
    `UPDATE customer_invoices SET gateway_metadata = $1::jsonb, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(next), invoiceId, tenantId],
  );
}

export type CreateMercadoPagoCheckoutPreferenceResult = {
  preference_id: string;
  init_point: string;
  sandbox_init_point?: string;
  payment_url: string;
  invoice_url: string;
  cached: boolean;
  oauth_environment: 'sandbox' | 'production';
};

export async function createMercadoPagoCheckoutPreferenceForInvoice(params: {
  tenantId: string;
  invoiceId: string;
  regenerate?: boolean;
}): Promise<CreateMercadoPagoCheckoutPreferenceResult> {
  const { tenantId, invoiceId, regenerate } = params;

  if (!isMercadoPagoGatewayEnabled()) {
    throw new Error('Mercado Pago está desativado no servidor.');
  }

  const mpRow = await getMercadoPagoTenantConfigRow(tenantId);
  const creds = mpRow?.credentials ?? {};
  const hasMp =
    typeof creds.oauth_access_token_ciphertext === 'string' && creds.oauth_access_token_ciphertext.length > 0;
  if (!hasMp) {
    throw new Error('Conecte o Mercado Pago em Configurações → Pagamentos antes de gerar cobrança.');
  }

  const oauthEnvConfigured = getMercadoPagoConfiguredOAuthEnvironment();
  const oauthEnvStored =
    creds.env === 'production' || creds.env === 'sandbox' ? creds.env : oauthEnvConfigured;

  const inv = await getInvoiceById(tenantId, invoiceId);
  if (!inv) {
    throw new Error('Fatura não encontrada.');
  }

  const st = String(inv.status ?? '').toLowerCase();
  if (st === 'paid') {
    throw new Error('Fatura já está paga.');
  }
  if (!CHARGEABLE_STATUSES.has(st)) {
    throw new Error('Estado da fatura não permite gerar cobrança Mercado Pago.');
  }

  const existingCheckout = getCheckoutMetaFromInvoice(inv);
  if (!regenerate && existingCheckout?.preference_id && existingCheckout.init_point) {
    const paymentUrl = primaryInitPoint(
      existingCheckout.init_point,
      existingCheckout.sandbox_init_point,
      existingCheckout.oauth_environment,
    );
    console.log('[mercado_pago.checkout_preference]', {
      invoice_id: invoiceId,
      tenant_id: tenantId,
      gateway: GATEWAY_KEY,
      preference_id: existingCheckout.preference_id,
      oauth_environment: existingCheckout.oauth_environment,
      result: 'cached',
    });
    return {
      preference_id: existingCheckout.preference_id,
      init_point: existingCheckout.init_point,
      sandbox_init_point: existingCheckout.sandbox_init_point,
      payment_url: paymentUrl,
      invoice_url: paymentUrl,
      cached: true,
      oauth_environment: existingCheckout.oauth_environment,
    };
  }

  const hasAsaasCharge =
    inv.gateway === 'asaas' &&
    typeof inv.gateway_reference_id === 'string' &&
    inv.gateway_reference_id.length > 0;

  const accessToken = await getMercadoPagoAccessTokenForTenant(tenantId);

  const front = getMercadoPagoFrontendRedirectBase();
  const token = inv.payment_token;
  if (!token) {
    throw new Error('Fatura sem payment_token (link público).');
  }

  const amountReais = Math.round(inv.amount_cents) / 100;
  const unitPrice = Number(amountReais.toFixed(2));
  const title =
    (typeof inv.description === 'string' && inv.description.trim()) ||
    inv.invoice_number ||
    'Fatura';

  const payer = await fetchClientPayer(tenantId, inv.client_id);
  const notificationUrl = getMercadoPagoPreferenceNotificationUrl();

  const preferenceBody = {
    items: [
      {
        id: inv.id,
        title: title.slice(0, 256),
        quantity: 1,
        currency_id: 'BRL',
        unit_price: unitPrice,
      },
    ],
    external_reference: inv.id,
    payer: Object.keys(payer).length ? payer : undefined,
    back_urls: {
      success: `${front}/pay/${encodeURIComponent(token)}?mp_return=approved`,
      pending: `${front}/pay/${encodeURIComponent(token)}?mp_return=pending`,
      failure: `${front}/pay/${encodeURIComponent(token)}?mp_return=failure`,
    },
    auto_return: 'approved' as const,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    metadata: {
      tenant_id: tenantId,
      invoice_id: inv.id,
      customer_id: inv.client_id ?? '',
      source: 'painelcrm',
    },
  };

  const pref = await createCheckoutPreference(accessToken, preferenceBody);
  const preferenceId = typeof pref.id === 'string' ? pref.id : '';
  const initPoint = typeof pref.init_point === 'string' ? pref.init_point : '';
  const sandboxInit = typeof pref.sandbox_init_point === 'string' ? pref.sandbox_init_point : undefined;
  if (!preferenceId || !initPoint) {
    throw new Error('Resposta Mercado Pago sem preference id ou init_point.');
  }

  const mpCheckout: MercadoPagoCheckoutCheckoutMeta = {
    preference_id: preferenceId,
    init_point: initPoint,
    ...(sandboxInit ? { sandbox_init_point: sandboxInit } : {}),
    external_reference: inv.id,
    created_at: new Date().toISOString(),
    notification_url: notificationUrl ?? null,
    oauth_environment: oauthEnvStored === 'sandbox' ? 'sandbox' : 'production',
  };

  const paymentUrl = primaryInitPoint(initPoint, sandboxInit, mpCheckout.oauth_environment);

  console.log('[mercado_pago.checkout_preference]', {
    invoice_id: invoiceId,
    tenant_id: tenantId,
    gateway: GATEWAY_KEY,
    preference_id: preferenceId,
    oauth_environment: mpCheckout.oauth_environment,
    result: 'created',
  });

  const idempotencyKey = stableIdempotencyKey(inv.id);

  if (hasAsaasCharge) {
    await mergeGatewayMetadataOnly(invoiceId, tenantId, {
      mercado_pago_checkout: { ...(mpCheckout as unknown as Record<string, unknown>) },
      mercado_pago_payment_url: paymentUrl,
    });
  } else {
    const data: GatewayPaymentData = {
      gateway: GATEWAY_KEY,
      payment_method: null,
      gateway_reference_id: preferenceId,
      gateway_status: 'waiting_payment',
      idempotency_key: idempotencyKey,
      gateway_metadata: {
        mercado_pago_checkout: mpCheckout as unknown as Record<string, unknown>,
        invoiceUrl: paymentUrl,
      },
    };
    await updateCustomerInvoiceGatewayData(invoiceId, data);

    await createInvoicePaymentAttempt({
      invoice_id: invoiceId,
      tenant_id: tenantId,
      gateway: GATEWAY_KEY,
      payment_method: 'CREDIT_CARD',
      status: 'waiting_payment',
      gateway_status: 'waiting_payment',
      gateway_reference_id: preferenceId,
      gateway_metadata: {
        checkout_pro: true,
        preference_id: preferenceId,
      },
      idempotency_key: idempotencyKey,
      is_active: true,
    });
  }

  billingLog('invoice', 'mercado_pago_checkout_created', {
    tenant_id: tenantId,
    invoice_id: invoiceId,
    preference_id: preferenceId,
    parallel_asaas: hasAsaasCharge,
  });
  if (inv.client_id) {
    await createClientTimelineEvent({
      tenantId,
      clientId: inv.client_id,
      eventName: 'mercado_pago_checkout_created',
      source: 'finance',
      actorType: 'system',
      actorId: null,
      referenceType: 'customer_invoice',
      referenceId: invoiceId,
      eventKey: `mp_pref_${preferenceId}`,
      metadata: {
        preference_id: preferenceId,
        parallel_asaas: hasAsaasCharge,
      },
    }).catch(() => {});
  }

  return {
    preference_id: preferenceId,
    init_point: initPoint,
    sandbox_init_point: sandboxInit,
    payment_url: paymentUrl,
    invoice_url: paymentUrl,
    cached: false,
    oauth_environment: mpCheckout.oauth_environment,
  };
}

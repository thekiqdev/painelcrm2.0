/**
 * Serviço Asaas: implementa PaymentGateway, ensureCustomer, handlePaymentEvent.
 * Timeout/retry no client; logging [PAYMENT_GATEWAY] nas operações.
 */
import type { AsaasConfig } from '../asaasTypes.js';
import type {
  PaymentGateway,
  CreateCustomerInput,
  CreateCustomerResult,
  CreateChargeInput,
  CreateChargeResult,
  PaymentResult,
} from '../../../payments/paymentGatewayTypes.js';
import { logGatewayOperation } from '../../../payments/gatewayLogger.js';
import { getPaymentCustomer, createPaymentCustomer } from '../../../../services/paymentCustomersService.js';
import { activatePlanFromBilling } from '../../../../services/subscriptionService.js';
import { updateInvoiceStatus } from '../../../../services/invoiceService.js';
import { pool } from '../../../../utils/db.js';
import * as asaasClient from '../client/asaasClient.js';
import * as asaasMapper from '../mappers/asaasMapper.js';
import type { AsaasPaymentRequest } from '../asaasTypes.js';

const GATEWAY_KEY = 'asaas';

function withLog<T>(
  operation: string,
  tenantId: string | undefined | null,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  return fn()
    .then((r) => {
      logGatewayOperation({
        gateway: GATEWAY_KEY,
        tenantId: tenantId ?? undefined,
        operation,
        durationMs: Date.now() - start,
        status: 'success',
      });
      return r;
    })
    .catch((e: unknown) => {
      logGatewayOperation({
        gateway: GATEWAY_KEY,
        tenantId: tenantId ?? undefined,
        operation,
        durationMs: Date.now() - start,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    });
}

function buildGateway(config?: AsaasConfig | null): PaymentGateway {
  return {
    async createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
      return withLog('createCustomer', undefined, async () => {
        const body = asaasMapper.toAsaasCustomer(input);
        const res = await asaasClient.createCustomer(body, config);
        return { customerId: res.id };
      });
    },
    async ensureCustomer(tenantId: string): Promise<string> {
      return withLog('ensureCustomer', tenantId, () =>
        ensureCustomerForTenant(tenantId, config)
      );
    },
    async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
      return withLog('createCharge', undefined, async () => {
        const body: AsaasPaymentRequest = asaasMapper.toAsaasPayment(input.customerId, input);

        // [DIAG] Payload enviado ao Asaas
        console.log('[DIAG asaasService] createPayment payload', {
          customer: body.customer,
          billingType: body.billingType,
          value: body.value,
          dueDate: body.dueDate,
          externalReference: body.externalReference,
        });

        const res = await asaasClient.createPayment(body, config);

        // [DIAG] Resposta da API Asaas (POST /payments)
        console.log('[DIAG asaasService] createPayment response', {
          id: res.id,
          status: res.status,
          invoiceUrl: res.invoiceUrl ?? null,
          bankSlipUrl: res.bankSlipUrl ?? null,
          pixQrCodeId: (res as { pixQrCodeId?: string }).pixQrCodeId ?? null,
        });

        let pixQrCode: string | undefined;
        let pixCopyPaste: string | undefined;

        if (body.billingType === 'PIX') {
          const pixData = await asaasClient.getPixQrCode(res.id, config);
          if (pixData) {
            pixCopyPaste = pixData.payload ?? undefined;
            if (pixData.encodedImage) {
              pixQrCode = pixData.encodedImage.startsWith('data:') ? pixData.encodedImage : `data:image/png;base64,${pixData.encodedImage}`;
            }
            console.log('[DIAG asaasService] getPixQrCode result', { hasPayload: !!pixCopyPaste, hasEncodedImage: !!pixData.encodedImage });
          } else {
            console.warn('[DIAG asaasService] getPixQrCode retornou null para paymentId=', res.id);
          }
        }

        return {
          paymentId: res.id,
          status: res.status ?? 'PENDING',
          invoiceUrl: res.invoiceUrl,
          bankSlipUrl: res.bankSlipUrl,
          pixQrCode: pixQrCode ?? (res as { pixQrCode?: string }).pixQrCode,
          pixCopyPaste: pixCopyPaste ?? (res as { pixCopyPaste?: string }).pixCopyPaste,
        };
      });
    },
    async getPayment(paymentId: string): Promise<PaymentResult | null> {
      return withLog('getPayment', undefined, async () => {
        const res = await asaasClient.getPayment(paymentId, config);
        if (!res) return null;
        const paidAt =
          res.paymentDate ?? (res as { clientPaymentDate?: string }).clientPaymentDate ?? null;
        return {
          paymentId: res.id,
          status: res.status ?? '',
          paidAt: paidAt ?? undefined,
        };
      });
    },
    getCharge(paymentId: string) {
      return this.getPayment!(paymentId);
    },
  };
}

export function getAsaasGateway(config?: AsaasConfig | null): PaymentGateway | null {
  if (!asaasClient.isConfigured(config)) return null;
  return buildGateway(config);
}

/**
 * Garante que o tenant tenha um customer no Asaas (Fase 4: usa payment_customers).
 * 1) Busca em payment_customers; se existir, retorna gateway_customer_id.
 * 2) Senão, cria customer no Asaas com externalReference = tenant_id, persiste em payment_customers e retorna.
 */
export async function ensureCustomerForTenant(
  tenantId: string,
  config?: AsaasConfig | null
): Promise<string> {
  const existing = await getPaymentCustomer(tenantId, GATEWAY_KEY);
  if (existing) {
    return existing.gateway_customer_id;
  }

  const tenantRow = await pool.query<{
    id: string;
    name: string;
    asaas_customer_id: string | null;
    billing_email: string | null;
    billing_phone: string | null;
    cpf_cnpj: string | null;
    responsible_name: string | null;
  }>(
    'SELECT id, name, asaas_customer_id, billing_email, billing_phone, cpf_cnpj, responsible_name FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (tenantRow.rows.length === 0) {
    throw new Error('Tenant não encontrado');
  }
  const tenant = tenantRow.rows[0];

  if (tenant.asaas_customer_id) {
    await createPaymentCustomer(tenantId, GATEWAY_KEY, tenant.asaas_customer_id, tenantId);
    return tenant.asaas_customer_id;
  }

  let email: string;
  let customerName: string;
  let cpfCnpj: string | null = null;
  let phone: string | null = null;

  if (tenant.billing_email) {
    email = tenant.billing_email;
    customerName = (tenant.responsible_name || tenant.name).trim();
    cpfCnpj = tenant.cpf_cnpj ?? null;
    phone = tenant.billing_phone ?? null;
  } else {
    const userRow = await pool.query<{ email: string }>(
      `SELECT u.email FROM users u WHERE u.tenant_id = $1 ORDER BY u.created_at ASC LIMIT 1`,
      [tenantId]
    );
    const userEmail = userRow.rows[0]?.email;
    if (!userEmail) {
      throw new Error(
        'Tenant sem email de faturamento (billing_email) e sem usuário com email; informe dados no checkout ou cadastre um usuário.'
      );
    }
    email = userEmail;
    customerName = tenant.name;
  }

  const payload = asaasMapper.tenantToAsaasCustomer({
    name: customerName,
    email,
    cpfCnpj: cpfCnpj || undefined,
    phone: phone || undefined,
  });
  const payloadWithRef = { ...payload, externalReference: tenantId };

  const created = await asaasClient.createCustomer(payloadWithRef, config);

  await createPaymentCustomer(tenantId, GATEWAY_KEY, created.id, tenantId);

  await pool.query(
    'UPDATE tenants SET asaas_customer_id = $1, updated_at = now() WHERE id = $2',
    [created.id, tenantId]
  );
  return created.id;
}

/**
 * Testa a conexão com a API Asaas.
 */
export async function testConnection(config?: AsaasConfig | null): Promise<void> {
  const start = Date.now();
  try {
    await asaasClient.testConnection(config);
    logGatewayOperation({
      gateway: GATEWAY_KEY,
      operation: 'testConnection',
      durationMs: Date.now() - start,
      status: 'success',
    });
  } catch (e: unknown) {
    logGatewayOperation({
      gateway: GATEWAY_KEY,
      operation: 'testConnection',
      durationMs: Date.now() - start,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

/**
 * Processa evento de webhook: atualiza tenant_billing (asaas_status, status, paid_at).
 * Fase 5: aceita tenantIdFromPayload (externalReference do payload) para validar ou resolver tenant.
 */
export async function handlePaymentEvent(params: {
  eventType: string;
  asaasPaymentId: string;
  payload: unknown;
  /** externalReference do payload (ex.: tenant_id) para validar ou resolver tenant. */
  tenantIdFromPayload?: string | null;
}): Promise<void> {
  const { asaasPaymentId, payload, tenantIdFromPayload } = params;
  const payloadObj = payload as Record<string, unknown>;
  const payment = payloadObj?.payment as Record<string, unknown> | undefined;
  const asaasStatus =
    (payment && typeof payment.status === 'string' ? payment.status : null) ||
    params.eventType;

  console.log('[ASAAS] buscando billing por paymentId:', asaasPaymentId);

  const billingRow = await pool.query<{
    id: string;
    tenant_id: string;
    plan_id: string;
    status: string;
  }>(
    `SELECT id, tenant_id, plan_id, status FROM tenant_billing
     WHERE gateway = 'asaas' AND asaas_payment_id = $1`,
    [asaasPaymentId]
  );

  if (billingRow.rows.length === 0) {
    console.log('[ASAAS] billing NÃO encontrado para paymentId:', asaasPaymentId);
    return;
  }

  const row = billingRow.rows[0];
  console.log('[ASAAS] billing encontrado:', { id: row.id, tenant_id: row.tenant_id, plan_id: row.plan_id, status: row.status });

  if (row.status === 'paid') {
    return;
  }

  if (tenantIdFromPayload && row.tenant_id !== tenantIdFromPayload) {
    console.warn(
      `[PAYMENT_GATEWAY] asaas webhook: tenant_id do billing (${row.tenant_id}) difere do externalReference (${tenantIdFromPayload})`
    );
  }
  const isPaid =
    params.eventType === 'PAYMENT_RECEIVED' ||
    params.eventType === 'PAYMENT_CONFIRMED' ||
    asaasStatus === 'RECEIVED' ||
    asaasStatus === 'CONFIRMED';
  const isOverdue = params.eventType === 'PAYMENT_OVERDUE' || asaasStatus === 'OVERDUE';

  const asaasBillingType = payment && typeof payment.billingType === 'string' ? payment.billingType : null;
  const paymentMethod = mapAsaasBillingTypeToPaymentMethod(asaasBillingType);

  if (isPaid) {
    await updateInvoiceStatus(row.id, 'paid', new Date(), paymentMethod);
    await pool.query(
      `UPDATE tenant_billing SET asaas_status = $1, updated_at = now() WHERE id = $2`,
      [asaasStatus, row.id]
    );
    console.log('[ASAAS] ativando plano do tenant via billing:', row.id);
    await activatePlanFromBilling(row.id);
  } else if (isOverdue) {
    await pool.query(
      `UPDATE tenant_billing SET asaas_status = $1, status = 'overdue', updated_at = now() WHERE id = $2`,
      [asaasStatus, row.id]
    );
  } else {
    await pool.query(
      `UPDATE tenant_billing SET asaas_status = $1, updated_at = now() WHERE id = $2`,
      [asaasStatus, row.id]
    );
  }
}

function mapAsaasBillingTypeToPaymentMethod(asaasBillingType: string | null): 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null {
  if (!asaasBillingType) return null;
  const t = asaasBillingType.toUpperCase();
  if (t === 'PIX') return 'PIX';
  if (t === 'BOLETO') return 'BOLETO';
  if (t === 'CREDIT_CARD' || t === 'DEBIT_CARD') return 'CREDIT_CARD';
  return null;
}

/**
 * Ativa o plano no tenant após pagamento confirmado.
 * Delega a subscriptionService.activatePlanFromBilling (calcula period_start/end, activated_billing_id).
 */
export async function activatePlanForTenant(params: {
  tenantId: string;
  planId: string;
  billingId: string;
}): Promise<void> {
  await activatePlanFromBilling(params.billingId);
}

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
  PayWithCreditCardInput,
  PayWithCreditCardResult,
  UpdateChargeInput,
  UpdateChargeResult,
  PaymentMethod,
} from '../../../payments/paymentGatewayTypes.js';
import { logGatewayOperation } from '../../../payments/gatewayLogger.js';
import { getPaymentCustomer, createPaymentCustomer } from '../../../../services/paymentCustomersService.js';
import { activatePlanFromBilling } from '../../../../services/subscriptionService.js';
import { pool } from '../../../../utils/db.js';
import { isValidCpfOrCnpj, onlyDigits } from '../../../../utils/cpfCnpj.js';
import { handleWebhook } from '../../../payments/webhook/webhookCore.js';
import * as asaasClient from '../client/asaasClient.js';
import * as asaasMapper from '../mappers/asaasMapper.js';
import type { AsaasPaymentRequest } from '../asaasTypes.js';

const GATEWAY_KEY = 'asaas';

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Após POST /payments com PIX, o GET /pixQrCode pode falhar ou vir vazio até o Asaas gerar o QR. */
async function fetchPixQrWithRetry(
  paymentId: string,
  config: AsaasConfig | null | undefined,
  maxAttempts: number
): Promise<{ payload?: string; encodedImage?: string } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(2_500, 350 * 2 ** (attempt - 1));
      await delayMs(backoff);
    }
    const pixData = await asaasClient.getPixQrCode(paymentId, config);
    const payload = pixData?.payload?.trim();
    const enc = pixData?.encodedImage?.trim();
    if (payload || enc) {
      return { payload: payload || undefined, encodedImage: enc || undefined };
    }
  }
  return null;
}

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
    async ensureCustomerForClient(
      _tenantId: string,
      _clientId: string,
      clientData: CreateCustomerInput
    ): Promise<string> {
      return withLog('ensureCustomerForClient', _tenantId, async () => {
        const body = asaasMapper.toAsaasCustomer(clientData);
        const res = await asaasClient.createCustomer(body, config);
        return res.id;
      });
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
          const pixData = await fetchPixQrWithRetry(res.id, config, 14);
          if (pixData) {
            pixCopyPaste = pixData.payload ?? undefined;
            if (pixData.encodedImage) {
              pixQrCode = pixData.encodedImage.startsWith('data:')
                ? pixData.encodedImage
                : `data:image/png;base64,${pixData.encodedImage}`;
            }
            console.log('[DIAG asaasService] getPixQrCode result', {
              hasPayload: !!pixCopyPaste,
              hasEncodedImage: !!pixData.encodedImage,
            });
          } else {
            console.warn(
              '[DIAG asaasService] getPixQrCode sem payload/imagem após retentativas paymentId=',
              res.id
            );
          }
        }

        let bankSlipDigitableLine: string | undefined;
        if (body.billingType === 'BOLETO') {
          const fromPost = (res as { identificationField?: string }).identificationField?.trim();
          if (fromPost) {
            bankSlipDigitableLine = fromPost;
          } else {
            try {
              const idf = await asaasClient.getIdentificationField(res.id, config);
              bankSlipDigitableLine = idf?.identificationField?.trim() || undefined;
            } catch (e) {
              console.warn('[asaasService] getIdentificationField failed', res.id, e);
            }
          }
        }

        return {
          paymentId: res.id,
          status: res.status ?? 'PENDING',
          invoiceUrl: res.invoiceUrl,
          bankSlipUrl: res.bankSlipUrl,
          bankSlipDigitableLine,
          pixQrCode: pixQrCode ?? (res as { pixQrCode?: string }).pixQrCode,
          pixCopyPaste: pixCopyPaste ?? (res as { pixCopyPaste?: string }).pixCopyPaste,
        };
      });
    },
    async updateCharge(
      paymentId: string,
      input: UpdateChargeInput,
      options?: { paymentMethod?: PaymentMethod }
    ): Promise<UpdateChargeResult> {
      return withLog('updateCharge', undefined, async () => {
        const patch = asaasMapper.toAsaasPaymentUpdate(input);
        if (Object.keys(patch).length === 0) {
          throw new Error('Nenhum campo para atualizar na cobrança');
        }
        const res = await asaasClient.updatePayment(paymentId, patch, config);

        const billingFromRes = (res as { billingType?: string }).billingType;
        const billingType =
          billingFromRes === 'PIX' || billingFromRes === 'BOLETO'
            ? billingFromRes
            : options?.paymentMethod
              ? asaasMapper.asaasBillingType(options.paymentMethod)
              : undefined;

        let pixQrCode: string | undefined;
        let pixCopyPaste: string | undefined;
        if (billingType === 'PIX') {
          const pixData = await fetchPixQrWithRetry(res.id, config, 14);
          if (pixData) {
            pixCopyPaste = pixData.payload ?? undefined;
            if (pixData.encodedImage) {
              pixQrCode = pixData.encodedImage.startsWith('data:')
                ? pixData.encodedImage
                : `data:image/png;base64,${pixData.encodedImage}`;
            }
          }
        }

        let bankSlipDigitableLine: string | undefined;
        if (billingType === 'BOLETO') {
          const fromPost = (res as { identificationField?: string }).identificationField?.trim();
          if (fromPost) {
            bankSlipDigitableLine = fromPost;
          } else {
            try {
              const idf = await asaasClient.getIdentificationField(res.id, config);
              bankSlipDigitableLine = idf?.identificationField?.trim() || undefined;
            } catch (e) {
              console.warn('[asaasService] updateCharge getIdentificationField failed', res.id, e);
            }
          }
        }

        return {
          status: res.status ?? 'PENDING',
          invoiceUrl: res.invoiceUrl,
          bankSlipUrl: res.bankSlipUrl,
          bankSlipDigitableLine,
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
    async cancelPayment(paymentId: string): Promise<void> {
      return withLog('cancelPayment', undefined, async () => {
        await asaasClient.deletePayment(paymentId, config);
      });
    },
    async payWithCreditCard(input: PayWithCreditCardInput): Promise<PayWithCreditCardResult> {
      const start = Date.now();
      try {
        const res = await asaasClient.payWithCreditCard(
          input.paymentId,
          {
            creditCard: {
              holderName: input.creditCard.holderName.trim(),
              number: input.creditCard.number.replace(/\D/g, ''),
              expiryMonth: input.creditCard.expiryMonth.trim(),
              expiryYear: input.creditCard.expiryYear.trim(),
              ccv: input.creditCard.ccv.trim(),
            },
            creditCardHolderInfo: {
              name: input.creditCardHolderInfo.name.trim(),
              email: input.creditCardHolderInfo.email.trim(),
              cpfCnpj: input.creditCardHolderInfo.cpfCnpj.replace(/\D/g, ''),
              postalCode: input.creditCardHolderInfo.postalCode.replace(/\D/g, ''),
              addressNumber: input.creditCardHolderInfo.addressNumber.trim(),
              addressComplement: input.creditCardHolderInfo.addressComplement ?? null,
              phone: input.creditCardHolderInfo.phone.replace(/\D/g, ''),
              mobilePhone: input.creditCardHolderInfo.mobilePhone?.replace(/\D/g, '') ?? null,
            },
          },
          config
        );
        const paidAt =
          res.paymentDate ?? (res as { clientPaymentDate?: string }).clientPaymentDate ?? null;
        logGatewayOperation({
          gateway: GATEWAY_KEY,
          tenantId: undefined,
          operation: 'payWithCreditCard',
          durationMs: Date.now() - start,
          status: 'success',
        });
        return {
          paymentId: res.id,
          status: res.status ?? '',
          paidAt: paidAt ?? undefined,
        };
      } catch (e: unknown) {
        logGatewayOperation({
          gateway: GATEWAY_KEY,
          tenantId: undefined,
          operation: 'payWithCreditCard',
          durationMs: Date.now() - start,
          status: 'error',
          error: 'Asaas payWithCreditCard failed',
        });
        throw e;
      }
    },
  };
}

export function getAsaasGateway(config?: AsaasConfig | null): PaymentGateway | null {
  if (!asaasClient.isConfigured(config)) return null;
  return buildGateway(config);
}

function normalizeTenantCpfDigits(cpfCnpj: string | null | undefined): string | null {
  const d = onlyDigits(cpfCnpj ?? '');
  if (d.length !== 11 && d.length !== 14) return null;
  if (!isValidCpfOrCnpj(d)) return null;
  return d;
}

/**
 * Se o tenant tem CPF/CNPJ válido e o customer remoto está vazio ou diverge, atualiza no Asaas.
 * Falhas de rede/timeout não bloqueiam o checkout — o vínculo local continua válido.
 */
async function syncTenantCpfToAsaasCustomerIfNeeded(
  customerId: string,
  tenantCpfDigits: string | null,
  config?: AsaasConfig | null
): Promise<void> {
  if (!tenantCpfDigits) return;
  try {
    const remote = await asaasClient.getCustomer(customerId, config);
    if (!remote?.email) return;
    const remoteDigits = onlyDigits((remote.cpfCnpj as string | undefined) ?? '');
    if (remoteDigits === tenantCpfDigits) return;

    const name = String(remote.name ?? '').trim() || 'Cliente';
    const email = String(remote.email).trim();
    const payload = asaasMapper.tenantToAsaasCustomer({
      name,
      email,
      cpfCnpj: tenantCpfDigits,
      phone: remote.phone != null ? String(remote.phone) : undefined,
    });
    await asaasClient.updateCustomer(customerId, payload, config);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[asaasService] syncTenantCpfToAsaasCustomerIfNeeded skipped:', customerId, msg);
  }
}

/**
 * Garante que o tenant tenha um customer no Asaas (Fase 4: usa payment_customers).
 * 1) Carrega tenant (fonte de verdade do CPF/CNPJ).
 * 2) Busca payment_customers; se existir, sincroniza documento no Asaas se necessário e retorna.
 * 3) Se houver asaas_customer_id na tabela tenants, persiste vínculo, sincroniza CPF e retorna.
 * 4) Senão, cria customer no Asaas (sempre com cpf/phone do tenant quando houver billing_email ou não).
 */
export async function ensureCustomerForTenant(
  tenantId: string,
  config?: AsaasConfig | null
): Promise<string> {
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
    throw new Error('Empresa não encontrada');
  }
  const tenant = tenantRow.rows[0];
  const tenantCpfDigits = normalizeTenantCpfDigits(tenant.cpf_cnpj);

  const existing = await getPaymentCustomer(tenantId, GATEWAY_KEY);
  if (existing) {
    await syncTenantCpfToAsaasCustomerIfNeeded(existing.gateway_customer_id, tenantCpfDigits, config);
    return existing.gateway_customer_id;
  }

  if (tenant.asaas_customer_id) {
    await createPaymentCustomer(tenantId, GATEWAY_KEY, tenant.asaas_customer_id, tenantId);
    await syncTenantCpfToAsaasCustomerIfNeeded(tenant.asaas_customer_id, tenantCpfDigits, config);
    return tenant.asaas_customer_id;
  }

  let email: string;
  let customerName: string;
  let cpfCnpj: string | null = tenantCpfDigits;
  let phone: string | null = tenant.billing_phone ?? null;

  if (tenant.billing_email) {
    email = tenant.billing_email;
    customerName = (tenant.responsible_name || tenant.name).trim();
  } else {
    const userRow = await pool.query<{ email: string }>(
      `SELECT u.email FROM users u WHERE u.tenant_id = $1 ORDER BY u.created_at ASC LIMIT 1`,
      [tenantId]
    );
    const userEmail = userRow.rows[0]?.email;
    if (!userEmail) {
      throw new Error(
        'Empresa sem email de faturamento (billing_email) e sem usuário com email; informe dados no checkout ou cadastre um usuário.'
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
 * Processa evento de webhook: delega para handleWebhook (webhookCore).
 * Mantido para compatibilidade com quem ainda chama handlePaymentEvent.
 */
export async function handlePaymentEvent(params: {
  eventType: string;
  asaasPaymentId: string;
  payload: unknown;
  tenantIdFromPayload?: string | null;
}): Promise<void> {
  const result = await handleWebhook(GATEWAY_KEY, params.payload);
  if (result.status !== 200) {
    throw new Error(result.body?.error ?? 'handleWebhook falhou');
  }
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

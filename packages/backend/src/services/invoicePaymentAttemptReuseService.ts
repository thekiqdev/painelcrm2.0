/**
 * Reuso de tentativas de pagamento por fatura/método (link público).
 * Fonte de verdade: customer_invoice_payment_attempts + trava no banco (migration 84).
 */
import crypto from 'node:crypto';
import { pool } from '../utils/db.js';
import { getActiveConfig, getConfigForTest } from './paymentGatewayConfigService.js';
import {
  getPaymentCustomerForClient,
  createPaymentCustomerForClient,
} from './paymentCustomersService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { buildGateway } from '../modules/payments/gatewayRegistry.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import type { PaymentGateway } from '../modules/payments/paymentGatewayTypes.js';
import { updateCustomerInvoiceGatewayData } from './customerInvoiceService.js';
import {
  activateInvoicePaymentAttempt,
  createInvoicePaymentAttempt,
  findReusableInvoicePaymentAttempt,
  getInvoicePaymentAttemptByIdempotency,
  hasInvoicePaymentAttemptsTable,
  markAttemptCancelledSuperseded,
  type CustomerInvoicePaymentAttemptRow,
  type InvoiceAttemptPaymentMethod,
  type InvoiceAttemptStatus,
} from './customerInvoicePaymentAttemptsService.js';
import { billingLog } from './billingLogger.js';

export type UiPaymentMethod = InvoiceAttemptPaymentMethod;

export interface PaymentUrls {
  invoiceUrl?: string;
  bankSlipUrl?: string;
  bankSlipDigitableLine?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
}

export const OPEN_REUSABLE_ATTEMPT_STATUSES = new Set<InvoiceAttemptStatus>([
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
]);

/** Confirma no gateway que a cobrança ainda existe e está em estado reutilizável (não paga/cancelada). */
export async function isAttemptChargeStillUsable(
  gateway: PaymentGateway,
  gatewayKey: string,
  refId: string | null | undefined
): Promise<boolean> {
  if (!refId) return false;
  if (!gateway.getPayment) return true;
  try {
    const p = await gateway.getPayment(refId);
    // 404 / resposta vazia: não invalidar tentativa nem forçar nova cobrança (evita duplicidade no Asaas).
    if (!p) return true;
    const internal = normalizeGatewayStatus(gatewayKey, p.status);
    return (
      internal === 'pending' ||
      internal === 'waiting_payment' ||
      internal === 'processing' ||
      internal === 'overdue'
    );
  } catch {
    return true;
  }
}

export async function resolveCrmGatewayForTenantInvoice(
  tenantId: string,
  invoiceGateway: string | null | undefined
): Promise<{ gatewayKey: string; gateway: PaymentGateway }> {
  const selectedGatewayKey = typeof invoiceGateway === 'string' ? invoiceGateway.trim() : '';
  let gatewayKey: string;
  let gateway: PaymentGateway | null = null;
  if (selectedGatewayKey) {
    const cfg = await getConfigForTest('tenant', tenantId, selectedGatewayKey);
    if (cfg) {
      gatewayKey = cfg.gateway_key;
      gateway = buildGateway(gatewayKey, {
        credentials: (cfg.credentials as Record<string, unknown>) ?? {},
        options: (cfg.options as Record<string, unknown>) ?? {},
      });
    } else {
      const active = await getActiveConfig('crm', tenantId);
      gatewayKey = active?.gateway_key ?? selectedGatewayKey;
      gateway = await getActiveGateway({ billingType: 'crm', tenantId });
    }
  } else {
    const active = await getActiveConfig('crm', tenantId);
    gatewayKey = active?.gateway_key ?? 'asaas';
    gateway = await getActiveGateway({ billingType: 'crm', tenantId });
  }
  if (!gateway) throw new Error('Gateway de pagamento não configurado');
  return { gatewayKey, gateway };
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

export type EnsureSwitchAttemptResult =
  | {
      kind: 'reused';
      payment_urls: PaymentUrls;
      payment_method: UiPaymentMethod;
      attempt: CustomerInvoicePaymentAttemptRow;
    }
  | {
      kind: 'created';
      payment_urls: PaymentUrls;
      payment_method: UiPaymentMethod;
      attempt: CustomerInvoicePaymentAttemptRow | null;
    };

export type EnsureSwitchAttemptParams = {
  invoiceId: string;
  tenantId: string;
  clientId: string;
  invoiceGateway: string | null;
  requestedMethod: UiPaymentMethod;
  allowedPaymentMethods: UiPaymentMethod[];
  idempotencyKey: string | null | undefined;
  amountCents: number;
  dueDate: string;
  description: string;
};

/**
 * Único fluxo de troca de método no link público: idempotência → reuso por método → createCharge só se necessário.
 */
export async function ensureReusablePaymentAttemptForSwitch(
  params: EnsureSwitchAttemptParams
): Promise<EnsureSwitchAttemptResult> {
  const {
    invoiceId,
    tenantId,
    clientId,
    invoiceGateway,
    requestedMethod,
    allowedPaymentMethods,
    idempotencyKey,
    amountCents,
    dueDate,
    description,
  } = params;

  if (!(await hasInvoicePaymentAttemptsTable())) {
    billingLog('invoice', 'public_pay_attempts_table_missing', {
      invoice_id: invoiceId,
      payment_method: requestedMethod,
    });
    throw new Error(
      'Tabela customer_invoice_payment_attempts não encontrada. Execute as migrações do banco (npm run migrate em packages/backend ou aplique database/init/82 e 84). Sem ela, cada troca de método cria nova cobrança no gateway.'
    );
  }

  const { gatewayKey, gateway } = await resolveCrmGatewayForTenantInvoice(tenantId, invoiceGateway);
  if (!gateway.createCharge) {
    throw new Error('Gateway de pagamento não suporta criação de cobrança');
  }

  if (idempotencyKey?.trim()) {
    const byIdem = await getInvoicePaymentAttemptByIdempotency(
      invoiceId,
      requestedMethod,
      idempotencyKey.trim()
    );
    if (byIdem && OPEN_REUSABLE_ATTEMPT_STATUSES.has(byIdem.status)) {
      await activateInvoicePaymentAttempt(invoiceId, byIdem.id);
      await updateCustomerInvoiceGatewayData(invoiceId, {
        gateway: byIdem.gateway,
        payment_method: byIdem.payment_method,
        gateway_reference_id: byIdem.gateway_reference_id,
        gateway_status: byIdem.gateway_status,
        idempotency_key: byIdem.idempotency_key,
        gateway_metadata: byIdem.gateway_metadata ?? {},
      });
      const m = (byIdem.gateway_metadata ?? {}) as Record<string, unknown>;
      return {
        kind: 'reused',
        payment_urls: paymentUrlsFromAttemptMeta(m),
        payment_method: byIdem.payment_method,
        attempt: byIdem,
      };
    }
  }

  const openRow = await findReusableInvoicePaymentAttempt(invoiceId, requestedMethod);
  if (openRow) {
    const usable = await isAttemptChargeStillUsable(gateway, gatewayKey, openRow.gateway_reference_id);
    if (usable) {
      await activateInvoicePaymentAttempt(invoiceId, openRow.id);
      await updateCustomerInvoiceGatewayData(invoiceId, {
        gateway: openRow.gateway,
        payment_method: openRow.payment_method,
        gateway_reference_id: openRow.gateway_reference_id,
        gateway_status: openRow.gateway_status,
        idempotency_key: openRow.idempotency_key,
        gateway_metadata: openRow.gateway_metadata ?? {},
      });
      const m = (openRow.gateway_metadata ?? {}) as Record<string, unknown>;
      billingLog('invoice', 'public_pay_switch_reuse_attempt', {
        invoice_id: invoiceId,
        attempt_id: openRow.id,
        gateway_reference_id: openRow.gateway_reference_id ?? undefined,
        payment_method: openRow.payment_method,
      });
      return {
        kind: 'reused',
        payment_urls: paymentUrlsFromAttemptMeta(m),
        payment_method: openRow.payment_method,
        attempt: openRow,
      };
    }

    await markAttemptCancelledSuperseded(openRow.id, {
      reason: 'charge_stale_or_removed_in_gateway',
      superseded_by: 'switch',
    });
    billingLog('invoice', 'public_pay_switch_reuse_invalidated', {
      invoice_id: invoiceId,
      attempt_id: openRow.id,
      gateway_reference_id: openRow.gateway_reference_id ?? undefined,
      payment_method: openRow.payment_method,
    });
  }

  /**
   * Fallback (PIX inicial / reuso da primeira tentativa):
   * se a tentativa do método solicitado ainda não existir (ou não estiver elegível),
   * tentamos hidratar uma tentativa a partir dos campos já persistidos em customer_invoices
   * (gateway_reference_id + gateway_metadata). Isso evita criar nova cobrança na primeira volta.
   */
  const invoiceRow = await pool.query<{
    payment_method: string | null;
    gateway_reference_id: string | null;
    gateway_metadata: Record<string, unknown> | null;
    gateway_status: string | null;
    idempotency_key: string | null;
    gateway: string | null;
  }>(
    `SELECT payment_method, gateway_reference_id, gateway_metadata, gateway_status, idempotency_key, gateway
     FROM customer_invoices
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [invoiceId, tenantId]
  );

  const invoicePaymentMethod = invoiceRow.rows[0]?.payment_method ?? null;
  const invoiceGatewayReferenceId = invoiceRow.rows[0]?.gateway_reference_id ?? null;
  if (invoicePaymentMethod === requestedMethod && invoiceGatewayReferenceId) {
    const usableFromInvoice = await isAttemptChargeStillUsable(
      gateway,
      gatewayKey,
      invoiceGatewayReferenceId
    );
    if (usableFromInvoice) {
      const invoiceMetadata = (invoiceRow.rows[0]?.gateway_metadata ?? {}) as Record<string, unknown>;
      const invoiceGatewayStatus = invoiceRow.rows[0]?.gateway_status ?? null;
      const inferredStatus = normalizeGatewayStatus(gatewayKey, invoiceGatewayStatus);

      let hydratedAttempt: CustomerInvoicePaymentAttemptRow | null = null;
      try {
        hydratedAttempt = await createInvoicePaymentAttempt({
          invoice_id: invoiceId,
          tenant_id: tenantId,
          gateway: gatewayKey,
          payment_method: requestedMethod,
          status: inferredStatus,
          gateway_status: invoiceGatewayStatus,
          gateway_reference_id: invoiceGatewayReferenceId,
          gateway_metadata: invoiceMetadata,
          idempotency_key: invoiceRow.rows[0]?.idempotency_key ?? null,
          is_active: true,
        });
      } catch (err) {
        const pgErr = err as { code?: string };
        // Corrida: outra execução pode ter criado a tentativa antes. Rebuscamos uma reutilizável aberta.
        if (pgErr?.code === '23505') {
          const winner = await findReusableInvoicePaymentAttempt(invoiceId, requestedMethod);
          if (winner) {
            const usableWinner = await isAttemptChargeStillUsable(
              gateway,
              gatewayKey,
              winner.gateway_reference_id
            );
            if (usableWinner) {
              await activateInvoicePaymentAttempt(invoiceId, winner.id);
              await updateCustomerInvoiceGatewayData(invoiceId, {
                gateway: winner.gateway,
                payment_method: winner.payment_method,
                gateway_reference_id: winner.gateway_reference_id,
                gateway_status: winner.gateway_status,
                idempotency_key: winner.idempotency_key,
                gateway_metadata: winner.gateway_metadata ?? {},
              });
              const m = (winner.gateway_metadata ?? {}) as Record<string, unknown>;
              billingLog('invoice', 'public_pay_switch_hydrated_attempt_race_reused', {
                invoice_id: invoiceId,
                attempt_id: winner.id,
                gateway_reference_id: winner.gateway_reference_id ?? undefined,
                payment_method: winner.payment_method,
              });
              return {
                kind: 'reused',
                payment_urls: paymentUrlsFromAttemptMeta(m),
                payment_method: winner.payment_method,
                attempt: winner,
              };
            }
          }
        }
        throw err;
      }

      if (hydratedAttempt) {
        const m = (hydratedAttempt.gateway_metadata ?? {}) as Record<string, unknown>;
        billingLog('invoice', 'public_pay_switch_hydrated_attempt', {
          invoice_id: invoiceId,
          attempt_id: hydratedAttempt.id,
          gateway_reference_id: hydratedAttempt.gateway_reference_id ?? undefined,
          payment_method: hydratedAttempt.payment_method,
        });
        return {
          kind: 'reused',
          payment_urls: paymentUrlsFromAttemptMeta(m),
          payment_method: hydratedAttempt.payment_method,
          attempt: hydratedAttempt,
        };
      }
    }
  }

  let customerId =
    (await getPaymentCustomerForClient(tenantId, gatewayKey, clientId))?.gateway_customer_id ?? null;
  if (!customerId && gateway.ensureCustomerForClient) {
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
      [clientId, tenantId]
    );
    const client = clientRow.rows[0];
    if (!client) throw new Error('Cliente não encontrado');
    customerId = await gateway.ensureCustomerForClient(tenantId, clientId, {
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? undefined,
      cpfCnpj: client.cpf_cnpj?.trim() || undefined,
    });
    await createPaymentCustomerForClient(tenantId, gatewayKey, clientId, customerId, clientId);
  }
  if (!customerId) throw new Error('Não foi possível obter ou criar o cliente no gateway de pagamento');

  const generatedIdem = idempotencyKey?.trim()
    ? idempotencyKey.trim()
    : `customer_switch_${tenantId}_${invoiceId}_${requestedMethod}_${crypto.randomUUID().slice(0, 8)}`;
  const externalReference = `inv_${invoiceId.replace(/-/g, '').slice(0, 24)}_${requestedMethod}_${Date.now()
    .toString(36)
    .slice(0, 8)}`.slice(0, 100);

  const chargeResult = await gateway.createCharge({
    customerId,
    amountCents,
    dueDate,
    paymentMethod: requestedMethod,
    allowedPaymentMethods: allowedPaymentMethods,
    description,
    idempotencyKey: generatedIdem,
    externalReference,
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
    const createdAttempt = await createInvoicePaymentAttempt({
      invoice_id: invoiceId,
      tenant_id: tenantId,
      gateway: gatewayKey,
      payment_method: requestedMethod,
      status: normalizeGatewayStatus(gatewayKey, chargeResult.status),
      gateway_status: chargeResult.status,
      gateway_reference_id: chargeResult.paymentId,
      gateway_metadata: attemptMetadata,
      idempotency_key: generatedIdem,
      is_active: true,
    });

    await updateCustomerInvoiceGatewayData(invoiceId, {
      gateway: gatewayKey,
      payment_method: requestedMethod,
      gateway_reference_id: chargeResult.paymentId,
      gateway_status: chargeResult.status,
      idempotency_key: generatedIdem,
      gateway_metadata: attemptMetadata,
    });

    billingLog('invoice', 'public_pay_switch_new_charge', {
      invoice_id: invoiceId,
      attempt_id: createdAttempt?.id,
      gateway_reference_id: chargeResult.paymentId,
      payment_method: requestedMethod,
      idempotency_key: generatedIdem,
    });

    return {
      kind: 'created',
      payment_urls: {
        invoiceUrl: chargeResult.invoiceUrl,
        bankSlipUrl: chargeResult.bankSlipUrl,
        bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
        pixQrCode: chargeResult.pixQrCode,
        pixCopyPaste: chargeResult.pixCopyPaste,
      },
      payment_method: requestedMethod,
      attempt: createdAttempt,
    };
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === '23505') {
      const winner = await findReusableInvoicePaymentAttempt(invoiceId, requestedMethod);
      if (winner && winner.gateway_reference_id) {
        if (winner.gateway_reference_id !== chargeResult.paymentId && typeof gateway.cancelPayment === 'function') {
          try {
            await gateway.cancelPayment(chargeResult.paymentId);
            billingLog('invoice', 'public_pay_switch_cancelled_orphan_after_unique', {
              invoice_id: invoiceId,
              orphan_payment_id: chargeResult.paymentId,
              kept_attempt_id: winner.id,
            });
          } catch (cancelErr) {
            billingLog('invoice', 'public_pay_switch_orphan_cancel_failed', {
              invoice_id: invoiceId,
              orphan_payment_id: chargeResult.paymentId,
              error: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
            });
          }
        }
        await activateInvoicePaymentAttempt(invoiceId, winner.id);
        await updateCustomerInvoiceGatewayData(invoiceId, {
          gateway: winner.gateway,
          payment_method: winner.payment_method,
          gateway_reference_id: winner.gateway_reference_id,
          gateway_status: winner.gateway_status,
          idempotency_key: winner.idempotency_key,
          gateway_metadata: winner.gateway_metadata ?? {},
        });
        const m = (winner.gateway_metadata ?? {}) as Record<string, unknown>;
        return {
          kind: 'reused',
          payment_urls: paymentUrlsFromAttemptMeta(m),
          payment_method: winner.payment_method,
          attempt: winner,
        };
      }
    }
    throw err;
  }
}

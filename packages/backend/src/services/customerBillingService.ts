/**
 * Customer Billing: orquestração para faturas do tenant para seus clientes (manuais).
 * Fase 2: gateway antes da fatura; CPF/CNPJ enviado ao Asaas.
 * Ref: docs/PLANO-ACAO-CUSTOMER-BILLING-VALIDACOES-E-GATEWAY.md
 */
import crypto from 'node:crypto';
import { pool } from '../utils/db.js';
import {
  createManualCustomerInvoice,
  updateCustomerInvoiceGatewayData,
  updateCustomerInvoiceSubscriptionLink,
  updateCustomerInvoiceClientId,
  updateCustomerInvoiceStatus,
  getByPaymentToken,
  getCustomerInvoiceById,
  type CustomerInvoiceRow,
  type CreateManualCustomerInvoiceInput,
  type CreateManualCustomerInvoiceItemInput,
} from './customerInvoiceService.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';
import { createSubscription } from './billingSubscriptionService.js';
import { billingPlanProvisionService } from '../billingPlatform/provisioning/billingPlanProvisionService.js';
import { BillingPlanProvisionError } from '../billingPlatform/provisioning/types.js';
import { calculateNextBillingDate, activatePlanFromBilling } from './subscriptionService.js';
import type { BillingInterval } from './billingSubscriptionService.js';
import { isAbortLikeError } from '../modules/gateways/asaas/client/asaasClient.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { buildGateway } from '../modules/payments/gatewayRegistry.js';
import { getActiveConfig, getConfigForTest, type PaymentGatewayConfigRow } from './paymentGatewayConfigService.js';
import { ensurePaymentCustomerForCrmClient } from './paymentCustomersService.js';
import { isAsaasInvalidCustomerError } from '../modules/gateways/asaas/asaasErrors.js';
import {
  createInvoicePaymentAttempt,
  getActiveInvoicePaymentAttempt,
  updateInvoicePaymentAttemptStatus,
  type CustomerInvoicePaymentAttemptRow,
  type InvoiceAttemptStatus,
} from './customerInvoicePaymentAttemptsService.js';
import {
  ensureReusablePaymentAttemptForSwitch,
  resolveCrmGatewayForTenantInvoice,
  type PaymentUrls,
} from './invoicePaymentAttemptReuseService.js';
import {
  validateInvoicePreconditions,
  PreconditionFailedError,
} from './customerInvoicePreconditions.js';
import { normalizeGatewayStatus } from '../modules/payments/webhook/statusNormalizer.js';
import type { PayWithCreditCardInput } from '../modules/payments/paymentGatewayTypes.js';
import { billingLog } from './billingLogger.js';
import { buildPublicPayPayloadMeta } from './publicPayPayloadMeta.js';
import {
  getPayWithCardIdempotentResponse,
  savePayWithCardIdempotentResponse,
} from './publicPayCardIdempotencyService.js';
import { isValidCpfOrCnpj } from '../utils/cpfCnpj.js';
import {
  getInvoiceById as getTenantBillingById,
  updateInvoiceGatewayData,
  updateInvoiceStatus,
} from './invoiceService.js';
import {
  hasTenantBillingPaymentAttemptsTable,
  getActiveTenantBillingPaymentAttempt,
  updateTenantBillingPaymentAttemptStatus,
  type TenantBillingPaymentAttemptRow,
  type TbAttemptStatus,
} from './tenantBillingPaymentAttemptsService.js';
import {
  mergePublicPayAllowedMethods,
  paymentPolicyFromConfigRow,
  pickFirstUiMethodByPreference,
} from './gatewayPaymentMethodPolicy.js';

export type { CustomerInvoiceRow };
export { PreconditionFailedError };

export type { PaymentUrls };
type UiPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export class InvoiceGenerationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'missing_client'
      | 'missing_cpf_cnpj'
      | 'invalid_cpf_cnpj'
      | 'missing_gateway'
      | 'not_payable'
      | 'provider_error'
  ) {
    super(message);
    this.name = 'InvoiceGenerationError';
  }
}

function normalizeAllowedPaymentMethods(
  methods?: string[] | null
): UiPaymentMethod[] | null {
  if (!Array.isArray(methods) || methods.length === 0) return null;
  const allowed = new Set<UiPaymentMethod>(['PIX', 'BOLETO', 'CREDIT_CARD']);
  const normalized = methods.filter((m): m is UiPaymentMethod => allowed.has(m as UiPaymentMethod));
  if (normalized.length === 0) return null;
  return Array.from(new Set(normalized));
}

function computeEffectiveAllowedForInvoice(
  normalizedRequestAllowed: UiPaymentMethod[] | null,
  gatewayEnabledUi: UiPaymentMethod[],
  policy: 'strict' | 'lenient'
): UiPaymentMethod[] {
  if (!normalizedRequestAllowed || normalizedRequestAllowed.length === 0) {
    return [...gatewayEnabledUi];
  }
  const g = new Set(gatewayEnabledUi);
  const hit = normalizedRequestAllowed.filter((m) => g.has(m));
  if (hit.length === 0) {
    if (policy === 'strict') {
      throw new Error('Nenhum dos métodos permitidos na fatura está habilitado no gateway.');
    }
    return [...gatewayEnabledUi];
  }
  return hit;
}

function resolveChargeMethodWithGatewayPolicy(params: {
  explicit: string | null | undefined;
  effectiveAllowed: UiPaymentMethod[];
  gatewayDefaultUi: UiPaymentMethod | null;
  policy: 'strict' | 'lenient';
}): UiPaymentMethod {
  const ex =
    params.explicit === 'PIX' || params.explicit === 'BOLETO' || params.explicit === 'CREDIT_CARD'
      ? params.explicit
      : null;
  if (ex) {
    if (params.effectiveAllowed.includes(ex)) return ex;
    if (params.policy === 'strict') {
      throw new Error('O método de pagamento selecionado não está habilitado para este gateway.');
    }
    return resolveImplicitChargeMethod(params.effectiveAllowed, params.gatewayDefaultUi);
  }
  return resolveImplicitChargeMethod(params.effectiveAllowed, params.gatewayDefaultUi);
}

function resolveImplicitChargeMethod(
  effectiveAllowed: UiPaymentMethod[],
  gatewayDefaultUi: UiPaymentMethod | null
): UiPaymentMethod {
  if (gatewayDefaultUi && effectiveAllowed.includes(gatewayDefaultUi)) {
    return gatewayDefaultUi;
  }
  return pickFirstUiMethodByPreference(effectiveAllowed);
}

function resolveChargePaymentMethod(
  paymentMethod: string | null | undefined,
  allowedPaymentMethods: UiPaymentMethod[] | null
): UiPaymentMethod {
  if (paymentMethod === 'PIX' || paymentMethod === 'BOLETO' || paymentMethod === 'CREDIT_CARD') {
    return paymentMethod;
  }
  if (allowedPaymentMethods?.includes('PIX')) return 'PIX';
  if (allowedPaymentMethods?.includes('BOLETO')) return 'BOLETO';
  if (allowedPaymentMethods?.includes('CREDIT_CARD')) return 'CREDIT_CARD';
  return 'BOLETO';
}

/** Resultado de createManualInvoice: fatura criada e opcionalmente URLs do gateway. */
export interface CreateManualInvoiceResult {
  invoice: CustomerInvoiceRow;
  paymentUrls?: PaymentUrls;
  subscription_id?: string; // quando recurring = true (Fase 7)
  /** CRM2 — resultado do start Pix Automático (null se não pedido). */
  pix_automatic?: import('./crm/crmPixAutomaticService.js').CrmPixAutomaticCreateResult | null;
}

/** Filtros para listagem de faturas (sempre filtrado por tenant_id na aplicação). */
export interface ListCustomerInvoicesFilters {
  client_id?: string | null;
  project_id?: string | null;
  status?: string | null;
  /** Vários estados (ex.: pendente + aguardando pagamento). Tem precedência sobre `status`. */
  status_in?: string[] | null;
  limit?: number;
  offset?: number;
}

/** Totais do tenant para cards de resumo (exclui faturas filhas E2 para não duplicar valores). */
export interface CustomerInvoicesSummary {
  paid_count: number;
  paid_amount_cents: number;
  pending_count: number;
  pending_amount_cents: number;
  overdue_count: number;
  overdue_amount_cents: number;
  total_count: number;
  total_amount_cents: number;
}

export interface ProjectFinanceScope {
  id: string;
  client_id: string | null;
}

/** Histórico mínimo da recorrência (D1): faturas irmãs por subscription_id. */
export interface RecurrenceHistoryInvoice {
  id: string;
  subscription_id: string;
  invoice_number: string | null;
  status: string;
  amount_cents: number;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  payment_token: string | null;
  created_at: string;
}

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/**
 * Verifica se o cliente pertence ao tenant (clients.user_id → users.tenant_id).
 */
export async function clientBelongsToTenant(
  tenantId: string,
  clientId: string
): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $1
     WHERE c.id = $2`,
    [tenantId, clientId]
  );
  return r.rows.length > 0;
}

export async function getProjectFinanceScope(
  tenantId: string,
  projectId: string
): Promise<ProjectFinanceScope | null> {
  const r = await pool.query<ProjectFinanceScope>(
    `SELECT p.id, p.client_id
     FROM projects p
     INNER JOIN users u ON u.id = p.user_id AND u.tenant_id = $1
     WHERE p.id = $2
     LIMIT 1`,
    [tenantId, projectId]
  );
  return r.rows[0] ?? null;
}

async function resolveInvoiceProjectLink(
  tenantId: string,
  projectId: string | null | undefined,
  clientId: string | null | undefined
): Promise<{ project_id: string | null; client_id: string | null | undefined }> {
  if (!projectId) {
    return { project_id: null, client_id: clientId };
  }
  const project = await getProjectFinanceScope(tenantId, projectId);
  if (!project) {
    throw new Error('Projeto não pertence à empresa');
  }
  if (clientId && project.client_id && clientId !== project.client_id) {
    throw new Error('Cliente da fatura não corresponde ao cliente do projeto');
  }
  return {
    project_id: project.id,
    client_id: clientId ?? project.client_id ?? null,
  };
}

/**
 * Cria fatura manual (Fase 2): preconditions → gateway obrigatório → customer no gateway → createCharge → só então persiste a fatura.
 * Se body.client_id for null/undefined (Fase 8): cria fatura por link, sem gateway; cliente preenchido depois no link.
 */
export async function createManualInvoice(
  tenantId: string,
  body: {
    client_id?: string | null;
    amount_cents?: number;
    due_date: string;
    description?: string | null;
    payment_method?: string | null;
    allowed_payment_methods?: string[] | null;
    /** Fase 3 — Seleção explícita de gateway (C1, opcional). */
    gateway_key?: string | null;
    items?: CreateManualCustomerInvoiceItemInput[];
    charge_id?: string | null;
    /** Proposta de origem (Etapa 2). */
    proposal_id?: string | null;
    /** Projeto vinculado (opcional, migração 235). */
    project_id?: string | null;
    /** strict: API / ações explícitas; lenient: jobs automáticos (renovação). */
    payment_method_policy?: 'strict' | 'lenient';
    /**
     * Status inicial da linha em customer_invoices após INSERT (antes do fluxo normal).
     * Conversão de proposta usa waiting_payment = fatura já tratada como emitida ao cliente.
     */
    initial_invoice_status?: 'pending' | 'waiting_payment';
    /** CRM2 — operador pediu Pix Automático na criação. */
    pix_automatic?: boolean;
  }
): Promise<CreateManualInvoiceResult> {
  const hasItems = body.items && body.items.length > 0;
  const amountCents = hasItems
    ? body.items!.reduce((sum, it) => sum + Math.max(0, Math.round(Number(it.quantity) * it.unit_price_cents) - (it.discount_cents ?? 0)), 0)
    : body.amount_cents;
  if (amountCents == null || amountCents <= 0) {
    throw new Error(hasItems ? 'Total dos itens deve ser maior que zero' : 'amount_cents é obrigatório');
  }

  const effectiveInvoiceDescription = (body.description && body.description.trim()) || `Cobrança ${body.due_date}`;
  const policyMode = body.payment_method_policy ?? 'strict';

  const projectLink = await resolveInvoiceProjectLink(tenantId, body.project_id, body.client_id ?? null);

  const baseInvoiceData = {
    tenant_id: tenantId,
    amount_cents: amountCents,
    due_date: body.due_date,
    description: effectiveInvoiceDescription,
    payment_method: body.payment_method ?? null,
    gateway_metadata: {
      allowed_payment_methods: normalizeAllowedPaymentMethods(body.allowed_payment_methods),
    },
    items: body.items,
    charge_id: body.charge_id ?? null,
    proposal_id: body.proposal_id ?? null,
    project_id: projectLink.project_id,
  };

  if (!projectLink.client_id) {
    const invoice = await createManualCustomerInvoice({
      ...baseInvoiceData,
      client_id: null,
    });
    return { invoice };
  }

  const clientId = projectLink.client_id;

  const belongs = await clientBelongsToTenant(tenantId, clientId);
  if (!belongs) {
    throw new Error('Cliente não pertence à empresa');
  }

  const preconditions = await validateInvoicePreconditions(tenantId, clientId);
  if (!preconditions.ok) {
    throw new PreconditionFailedError(preconditions.errors);
  }
  if (!preconditions.clientHasCpfCnpj) {
    const invoice = await createManualCustomerInvoice({
      ...baseInvoiceData,
      client_id: clientId,
    });
    return { invoice };
  }

  const selectedGatewayKey = body.gateway_key?.trim() || null;
  let gatewayKey: string;
  let gateway = null;
  let gatewayCfgRow: PaymentGatewayConfigRow | null = null;

  if (selectedGatewayKey) {
    // Quando o front escolhe o gateway, evitamos a resolução por "LIMIT 1" do getActiveConfig.
    const r = await pool.query<PaymentGatewayConfigRow>(
      `SELECT id, scope, tenant_id, gateway_key, is_active, display_name, credentials, options,
              status, last_connection_test_at, last_connection_status,
              enabled_payment_methods, default_payment_method
       FROM payment_gateway_configs
       WHERE scope = 'tenant'
         AND tenant_id = $1
         AND gateway_key = $2
         AND is_active = true
         AND status = 'active'
       LIMIT 1`,
      [tenantId, selectedGatewayKey]
    );
    const cfg = r.rows[0];
    if (!cfg) {
      throw new Error('Gateway de pagamento não configurado');
    }
    gatewayCfgRow = cfg;

    gatewayKey = cfg.gateway_key;
    gateway = buildGateway(gatewayKey, {
      credentials: (cfg.credentials as Record<string, unknown>) ?? {},
      options: (cfg.options as Record<string, unknown>) ?? {},
    });
  } else {
    const config = await getActiveConfig('crm', tenantId);
    gatewayCfgRow = config;
    gatewayKey = config?.gateway_key ?? 'asaas';
    gateway = await getActiveGateway({ billingType: 'crm', tenantId });
  }

  if (!gateway) throw new Error('Gateway de pagamento não configurado');

  const gatewayPolicy = paymentPolicyFromConfigRow(gatewayCfgRow);
  const normalizedRequestAllowed = normalizeAllowedPaymentMethods(body.allowed_payment_methods);
  const effectiveAllowed = computeEffectiveAllowedForInvoice(
    normalizedRequestAllowed,
    gatewayPolicy.enabledUi,
    policyMode
  );
  const chargePaymentMethod = resolveChargeMethodWithGatewayPolicy({
    explicit: body.payment_method ?? null,
    effectiveAllowed,
    gatewayDefaultUi: gatewayPolicy.defaultUi,
    policy: policyMode,
  });

  const clientRow = await pool.query<{
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    cpf_cnpj: string | null;
  }>(
    `SELECT c.name, c.email, c.phone, c.company, c.cpf_cnpj
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1`,
    [clientId, tenantId]
  );
  const client = clientRow.rows[0];
  if (!client) {
    throw new Error('Cliente não encontrado');
  }

  const crmClientPayload = {
    name: client.name,
    email: client.email ?? '',
    phone: client.phone ?? undefined,
    cpfCnpj: client.cpf_cnpj?.trim() || undefined,
  };

  let customerId = await ensurePaymentCustomerForCrmClient(
    tenantId,
    gatewayKey,
    clientId,
    gateway,
    crmClientPayload
  );

  const makeManualKeys = () => {
    const shortId = crypto.randomUUID().slice(0, 8).toLowerCase();
    return {
      idempotencyKey: `customer_manual_${tenantId}_${clientId}_${body.due_date}_${shortId}`,
      externalReference: `t_${tenantId.replace(/-/g, '')}_c_${clientId.replace(/-/g, '')}_${body.due_date}_${shortId}`.slice(
        0,
        100
      ),
    };
  };

  let { idempotencyKey, externalReference } = makeManualKeys();

  let chargeResult;
  try {
    chargeResult = await gateway.createCharge({
      customerId,
      amountCents,
      dueDate: body.due_date,
      paymentMethod: chargePaymentMethod,
      allowedPaymentMethods: effectiveAllowed,
      description: effectiveInvoiceDescription,
      idempotencyKey,
      externalReference,
    });
  } catch (e) {
    if (!isAsaasInvalidCustomerError(e)) {
      throw e;
    }
    customerId = await ensurePaymentCustomerForCrmClient(
      tenantId,
      gatewayKey,
      clientId,
      gateway,
      crmClientPayload,
      { forceRecreate: true }
    );
    ({ idempotencyKey, externalReference } = makeManualKeys());
    chargeResult = await gateway.createCharge({
      customerId,
      amountCents,
      dueDate: body.due_date,
      paymentMethod: chargePaymentMethod,
      allowedPaymentMethods: effectiveAllowed,
      description: effectiveInvoiceDescription,
      idempotencyKey,
      externalReference,
    });
  }

  const data: CreateManualCustomerInvoiceInput = {
    tenant_id: tenantId,
    client_id: clientId,
    amount_cents: amountCents,
    due_date: body.due_date,
    description: effectiveInvoiceDescription,
    payment_method: chargePaymentMethod,
    gateway_metadata: baseInvoiceData.gateway_metadata,
    items: body.items,
    charge_id: body.charge_id ?? null,
    proposal_id: body.proposal_id ?? null,
    project_id: projectLink.project_id,
    ...(body.initial_invoice_status === 'waiting_payment'
      ? { initial_status: 'waiting_payment' as const }
      : {}),
  };
  const invoice = await createManualCustomerInvoice(data);
  await updateCustomerInvoiceGatewayData(invoice.id, {
    gateway: gatewayKey,
    payment_method: chargePaymentMethod,
    gateway_reference_id: chargeResult.paymentId,
    gateway_status: chargeResult.status,
    idempotency_key: idempotencyKey,
    gateway_metadata: {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
      allowed_payment_methods: effectiveAllowed,
    },
  });
  await createInvoicePaymentAttempt({
    invoice_id: invoice.id,
    tenant_id: tenantId,
    gateway: gatewayKey,
    payment_method: chargePaymentMethod,
    status: normalizeGatewayStatus(gatewayKey, chargeResult.status),
    gateway_status: chargeResult.status,
    gateway_reference_id: chargeResult.paymentId,
    gateway_metadata: {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
      allowed_payment_methods: effectiveAllowed,
    },
    idempotency_key: idempotencyKey,
    is_active: true,
  });

  const paymentUrls: PaymentUrls = {
    invoiceUrl: chargeResult.invoiceUrl,
    bankSlipUrl: chargeResult.bankSlipUrl,
    bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
    pixQrCode: chargeResult.pixQrCode,
    pixCopyPaste: chargeResult.pixCopyPaste,
  };

  let pix_automatic: CreateManualInvoiceResult['pix_automatic'] = null;
  if (body.pix_automatic === true) {
    try {
      const { finalizePixAutomaticOnCustomerInvoiceCreate } = await import(
        './crm/crmPixAutomaticService.js'
      );
      pix_automatic = await finalizePixAutomaticOnCustomerInvoiceCreate({
        tenantId,
        invoiceId: invoice.id,
        pixAutomaticRequested: true,
        allowedPaymentMethods: effectiveAllowed,
      });
      const refreshed = await getCustomerInvoiceById(invoice.id);
      if (refreshed) {
        return { invoice: refreshed, paymentUrls, pix_automatic };
      }
    } catch (e) {
      console.warn('[createManualInvoice] pix_automatic finalize', e);
      pix_automatic = {
        requested: true,
        started: false,
        detail: e instanceof Error ? e.message : 'pix_automatic_finalize_failed',
        warning: true,
      };
    }
  }

  return { invoice, paymentUrls, pix_automatic };
}

/**
 * Cria fatura recorrente (Fase 7): subscription type=customer + primeira fatura (cobrança no gateway) + vínculo.
 * O worker gerará as próximas faturas quando next_billing_date chegar.
 */
export async function createRecurringManualInvoice(
  tenantId: string,
  body: {
    /** Null = fatura por link; o cliente é associado ao completar o link (`completePaymentByToken`). */
    client_id: string | null;
    amount_cents?: number;
    due_date: string;
    description?: string | null;
    payment_method?: string | null;
    allowed_payment_methods?: string[] | null;
    /** Fase 3 — Seleção explícita de gateway (C1, opcional). */
    gateway_key?: string | null;
    billing_interval: BillingInterval;
    items?: CreateManualCustomerInvoiceItemInput[];
    project_id?: string | null;
    cycles_unlimited?: boolean;
    max_cycles?: number | null;
    /** CRM2 — operador pediu Pix Automático na criação. */
    pix_automatic?: boolean;
  }
): Promise<CreateManualInvoiceResult> {
  const hasItems = body.items && body.items.length > 0;
  const amountCents = hasItems
    ? body.items!.reduce((sum, it) => sum + Math.max(0, Math.round(Number(it.quantity) * it.unit_price_cents) - (it.discount_cents ?? 0)), 0)
    : body.amount_cents;
  if (amountCents == null || amountCents <= 0) {
    throw new Error(hasItems ? 'Total dos itens deve ser maior que zero' : 'amount_cents é obrigatório');
  }

  const dueDate = body.due_date;
  const anchorDay = new Date(dueDate + 'T12:00:00Z').getUTCDate();
  const periodEnd = calculateNextBillingDate(dueDate, body.billing_interval, anchorDay);

  const subscription = await createSubscription({
    type: 'customer',
    tenant_id: tenantId,
    customer_id: body.client_id ?? null,
    plan_id: null,
    amount_cents: amountCents,
    billing_interval: body.billing_interval,
    next_billing_date: periodEnd,
    current_period_start: dueDate,
    current_period_end: periodEnd,
    billing_anchor_day: anchorDay,
    default_payment_method: body.payment_method ?? null,
    created_by: 'crm_ui',
    cycles_unlimited: body.cycles_unlimited,
    max_cycles: body.max_cycles ?? null,
  });

  try {
    const provision = await billingPlanProvisionService.ensureBillingPlan(subscription.id, {
      tenantId,
    });
    if (!provision.ok) {
      throw new BillingPlanProvisionError(
        provision.message || 'Falha ao provisionar Billing Plan',
        'PROVISION_FAILED',
        { subscription_id: subscription.id }
      );
    }
  } catch (e) {
    await pool.query(`DELETE FROM subscriptions WHERE id = $1::uuid AND tenant_id = $2::uuid`, [
      subscription.id,
      tenantId,
    ]);
    throw e;
  }

  const result = await createManualInvoice(tenantId, {
    client_id: body.client_id ?? null,
    amount_cents: amountCents,
    due_date: body.due_date,
    description: body.description ?? null,
    payment_method: body.payment_method ?? null,
    allowed_payment_methods: body.allowed_payment_methods ?? null,
    items: body.items,
    gateway_key: body.gateway_key ?? null,
    project_id: body.project_id ?? null,
    // Start após o link subscription_id (abaixo).
    pix_automatic: false,
  });

  await updateCustomerInvoiceSubscriptionLink(
    result.invoice.id,
    subscription.id,
    dueDate,
    periodEnd
  );

  let pix_automatic: CreateManualInvoiceResult['pix_automatic'] = null;
  if (body.pix_automatic === true) {
    try {
      const { finalizePixAutomaticOnCustomerInvoiceCreate } = await import(
        './crm/crmPixAutomaticService.js'
      );
      pix_automatic = await finalizePixAutomaticOnCustomerInvoiceCreate({
        tenantId,
        invoiceId: result.invoice.id,
        pixAutomaticRequested: true,
        allowedPaymentMethods: body.allowed_payment_methods ?? null,
      });
      const refreshed = await getCustomerInvoiceById(result.invoice.id);
      if (refreshed) {
        return {
          invoice: refreshed,
          paymentUrls: result.paymentUrls,
          subscription_id: subscription.id,
          pix_automatic,
        };
      }
    } catch (e) {
      console.warn('[createRecurringManualInvoice] pix_automatic finalize', e);
      pix_automatic = {
        requested: true,
        started: false,
        detail: e instanceof Error ? e.message : 'pix_automatic_finalize_failed',
        warning: true,
      };
    }
  }

  return { ...result, subscription_id: subscription.id, pix_automatic };
}

/** CPF/CNPJ: só dígitos; 11 ou 14 caracteres. */
function normalizeCpfCnpjDigits(value: string | null | undefined): string | null {
  if (value == null || typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) return null;
  return digits;
}

/**
 * Completa fatura por link (Fase 8): cria cliente a partir dos dados do formulário, vincula à fatura e gera cobrança no gateway.
 * Chamado pela página pública /pay/:token quando a fatura não tem cliente.
 */
export async function completePaymentByToken(
  token: string,
  body: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    cpf_cnpj?: string | null;
    company?: string | null;
  }
): Promise<{ payment_urls: PaymentUrls }> {
  const data = await getByPaymentToken(token);
  if (!data) {
    throw new Error('Fatura não encontrada ou link inválido');
  }
  if (!POLLABLE_INVOICE_STATUSES.has(data.invoice.status)) {
    throw new Error('Só é possível completar fatura pendente ou em cobrança');
  }

  const tenantId = data.tenant_id;
  const invoiceId = data.invoice_id;
  const amountCents = data.invoice.amount_cents;
  const dueDate = data.invoice.due_date;
  const description = data.invoice.description ?? `Cobrança ${dueDate}`;
  const paymentMethod = (data.invoice.payment_method as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'BOLETO';
  const metadata = (data.invoice.gateway_metadata as Record<string, unknown> | null) ?? null;
  const normalizedAllowedPaymentMethods = normalizeAllowedPaymentMethods(
    Array.isArray(metadata?.allowed_payment_methods)
      ? (metadata!.allowed_payment_methods as string[])
      : null
  );

  const cpfCnpj = normalizeCpfCnpjDigits(body.cpf_cnpj);
  if (!cpfCnpj) {
    throw new Error('CPF/CNPJ é obrigatório');
  }
  if (!isValidCpfOrCnpj(cpfCnpj)) {
    throw new Error('CPF/CNPJ inválido');
  }

  let client: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    cpf_cnpj: string | null;
  } | null = null;
  if (data.client_id) {
    const existingClient = await pool.query<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      cpf_cnpj: string | null;
    }>(
      `SELECT c.id, c.name, c.email, c.phone, c.cpf_cnpj
       FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
       WHERE c.id = $1
       LIMIT 1`,
      [data.client_id, tenantId]
    );
    const row = existingClient.rows[0] ?? null;
    if (!row) throw new Error('Cliente não encontrado');
    await pool.query(
      `UPDATE clients
       SET cpf_cnpj = $1,
           updated_at = now()
       WHERE id = $2`,
      [cpfCnpj, row.id]
    );
    client = { ...row, cpf_cnpj: cpfCnpj };
  } else {
    const userName = (body.name || '').trim();
    if (!userName) {
      throw new Error('Nome é obrigatório');
    }
    const userRow = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const userId = userRow.rows[0]?.id;
    if (!userId) {
      throw new Error('Empresa sem usuário para vincular cliente');
    }
    const companyTrim = (body.company || '').trim() || null;
    const clientResult = await pool.query<{ id: string; name: string; email: string | null; phone: string | null; cpf_cnpj: string | null }>(
      `INSERT INTO clients (user_id, name, email, phone, company, cpf_cnpj, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'payment_link')
       RETURNING id, name, email, phone, cpf_cnpj`,
      [userId, userName, (body.email || '').trim() || null, (body.phone || '').trim() || null, companyTrim, cpfCnpj]
    );
    client = clientResult.rows[0] ?? null;
    if (!client) {
      throw new Error('Erro ao criar cliente');
    }
    await updateCustomerInvoiceClientId(invoiceId, client.id);
  }

  /** Assinatura criada por link nasce com `customer_id` NULL até o cliente existir no CRM. */
  const subLink = await pool.query<{ subscription_id: string | null }>(
    `SELECT subscription_id FROM customer_invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [invoiceId, tenantId]
  );
  const subscriptionIdFromInvoice = subLink.rows[0]?.subscription_id ?? null;
  if (subscriptionIdFromInvoice && client) {
    await pool.query(
      `UPDATE subscriptions
       SET customer_id = $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3 AND customer_id IS NULL`,
      [client.id, subscriptionIdFromInvoice, tenantId]
    );
  }

  const config = await getActiveConfig('crm', tenantId);
  const gatewayKey = config?.gateway_key ?? 'asaas';
  const gateway = await getActiveGateway({ billingType: 'crm', tenantId });
  if (!gateway) {
    throw new Error('Gateway de pagamento não configurado');
  }

  const gatewayPolicy = paymentPolicyFromConfigRow(config);
  const effectiveAllowed = computeEffectiveAllowedForInvoice(
    normalizedAllowedPaymentMethods,
    gatewayPolicy.enabledUi,
    'lenient'
  );
  const resolvedPaymentMethod = resolveChargeMethodWithGatewayPolicy({
    explicit: paymentMethod,
    effectiveAllowed,
    gatewayDefaultUi: gatewayPolicy.defaultUi,
    policy: 'lenient',
  });

  const linkClientPayload = {
    name: client.name,
    email: client.email ?? '',
    phone: client.phone ?? undefined,
    cpfCnpj: client.cpf_cnpj?.trim() || undefined,
  };

  let customerId = await ensurePaymentCustomerForCrmClient(
    tenantId,
    gatewayKey,
    client.id,
    gateway,
    linkClientPayload
  );

  const makeLinkKeys = () => {
    const shortId = crypto.randomUUID().slice(0, 8).toLowerCase();
    return {
      idempotencyKey: `customer_link_${tenantId}_${client.id}_${dueDate}_${shortId}`,
      externalReference: `t_${tenantId.replace(/-/g, '')}_c_${client.id.replace(/-/g, '')}_${dueDate}_${shortId}`.slice(0, 100),
    };
  };

  let { idempotencyKey, externalReference } = makeLinkKeys();

  let chargeResult;
  try {
    chargeResult = await gateway.createCharge({
      customerId,
      amountCents,
      dueDate,
      paymentMethod: resolvedPaymentMethod,
      allowedPaymentMethods: effectiveAllowed,
      description,
      idempotencyKey,
      externalReference,
    });
  } catch (e) {
    if (!isAsaasInvalidCustomerError(e)) {
      throw e;
    }
    customerId = await ensurePaymentCustomerForCrmClient(
      tenantId,
      gatewayKey,
      client.id,
      gateway,
      linkClientPayload,
      { forceRecreate: true }
    );
    ({ idempotencyKey, externalReference } = makeLinkKeys());
    chargeResult = await gateway.createCharge({
      customerId,
      amountCents,
      dueDate,
      paymentMethod: resolvedPaymentMethod,
      allowedPaymentMethods: effectiveAllowed,
      description,
      idempotencyKey,
      externalReference,
    });
  }

  await updateCustomerInvoiceGatewayData(invoiceId, {
    gateway: gatewayKey,
    payment_method: resolvedPaymentMethod,
    gateway_reference_id: chargeResult.paymentId,
    gateway_status: chargeResult.status,
    idempotency_key: idempotencyKey,
    gateway_metadata: {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
      allowed_payment_methods: effectiveAllowed,
    },
  });
  await createInvoicePaymentAttempt({
    invoice_id: invoiceId,
    tenant_id: tenantId,
    gateway: gatewayKey,
    payment_method: resolvedPaymentMethod,
    status: normalizeGatewayStatus(gatewayKey, chargeResult.status),
    gateway_status: chargeResult.status,
    gateway_reference_id: chargeResult.paymentId,
    gateway_metadata: {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
      allowed_payment_methods: effectiveAllowed,
    },
    idempotency_key: idempotencyKey,
    is_active: true,
  });

  return {
    payment_urls: {
      invoiceUrl: chargeResult.invoiceUrl,
      bankSlipUrl: chargeResult.bankSlipUrl,
      bankSlipDigitableLine: chargeResult.bankSlipDigitableLine,
      pixQrCode: chargeResult.pixQrCode,
      pixCopyPaste: chargeResult.pixCopyPaste,
    },
  };
}

export async function switchPaymentMethodByToken(
  token: string,
  requestedMethod: UiPaymentMethod,
  idempotencyKey?: string | null
): Promise<{
  payment_urls: PaymentUrls;
  /** Método efetivo da fatura após a troca (alinha UI quando a linha de tentativa ainda não refletiu). */
  payment_method: UiPaymentMethod;
  active_attempt: Pick<CustomerInvoicePaymentAttemptRow, 'id' | 'payment_method' | 'status' | 'is_active' | 'created_at'> | null;
  allowed_payment_methods: UiPaymentMethod[];
}> {
  const data = await getByPaymentToken(token);
  if (!data) throw new Error('Fatura não encontrada ou link inválido');
  if (!data.client_id) {
    throw new InvoiceGenerationError('A fatura ainda requer dados do cliente', 'missing_client');
  }
  if (data.invoice.status === 'paid') throw new InvoiceGenerationError('Fatura já está paga', 'not_payable');
  if (!POLLABLE_INVOICE_STATUSES.has(data.invoice.status)) {
    throw new InvoiceGenerationError('Só é possível trocar método em fatura pagável', 'not_payable');
  }

  const clientCpf = await pool.query<{ cpf_cnpj: string | null }>(
    `SELECT c.cpf_cnpj
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1
     LIMIT 1`,
    [data.client_id, data.tenant_id]
  );
  const cpfCnpj = normalizeCpfCnpjDigits(clientCpf.rows[0]?.cpf_cnpj ?? null);
  if (!cpfCnpj) {
    throw new InvoiceGenerationError('CPF/CNPJ é obrigatório para gerar a cobrança', 'missing_cpf_cnpj');
  }
  if (!isValidCpfOrCnpj(cpfCnpj)) {
    throw new InvoiceGenerationError('CPF/CNPJ inválido no cadastro do cliente', 'invalid_cpf_cnpj');
  }

  const metadata = (data.invoice.gateway_metadata as Record<string, unknown> | null) ?? null;
  const cfg = await getActiveConfig('crm', data.tenant_id);
  const allowedPaymentMethods = mergePublicPayAllowedMethods(
    normalizeAllowedPaymentMethods(
      Array.isArray(metadata?.allowed_payment_methods)
        ? (metadata.allowed_payment_methods as string[])
        : null
    ),
    cfg
  );
  if (!allowedPaymentMethods.includes(requestedMethod)) {
    throw new Error('Método não permitido para esta fatura');
  }

  const gwRow = await pool.query<{ gateway: string | null }>(
    `SELECT gateway FROM customer_invoices WHERE id = $1 LIMIT 1`,
    [data.invoice_id]
  );
  const invoiceGateway = gwRow.rows[0]?.gateway ?? null;

  const ensured = await ensureReusablePaymentAttemptForSwitch({
    invoiceId: data.invoice_id,
    tenantId: data.tenant_id,
    clientId: data.client_id,
    invoiceGateway,
    requestedMethod,
    allowedPaymentMethods,
    idempotencyKey,
    amountCents: data.invoice.amount_cents,
    dueDate: data.invoice.due_date,
    description: data.invoice.description ?? `Cobrança ${data.invoice.due_date}`,
  });

  const a = ensured.attempt;
  return {
    payment_urls: ensured.payment_urls,
    payment_method: ensured.payment_method,
    active_attempt: a
      ? {
          id: a.id,
          payment_method: a.payment_method,
          status: a.status,
          is_active: a.is_active,
          created_at: a.created_at,
        }
      : null,
    allowed_payment_methods: allowedPaymentMethods,
  };
}

const POLLABLE_INVOICE_STATUSES = new Set(['pending', 'waiting_payment', 'processing', 'overdue']);

/**
 * Reprocessa uma fatura que ficou sem cobrança no gateway enquanto faltavam dados do cliente
 * (ex.: CPF/CNPJ preenchido depois no cadastro).
 */
export async function retryInvoiceGeneration(invoiceId: string): Promise<void> {
  const r = await pool.query<{
    id: string;
    tenant_id: string;
    client_id: string | null;
    status: string;
    amount_cents: number;
    due_date: string;
    description: string | null;
    payment_method: string | null;
    gateway: string | null;
    gateway_reference_id: string | null;
    gateway_metadata: Record<string, unknown> | null;
  }>(
    `SELECT id::text,
            tenant_id::text,
            client_id::text,
            status,
            amount_cents,
            due_date,
            description,
            payment_method,
            gateway,
            gateway_reference_id,
            gateway_metadata
     FROM customer_invoices
     WHERE id = $1::uuid
     LIMIT 1`,
    [invoiceId]
  );
  const invoice = r.rows[0];
  if (!invoice) throw new Error('Fatura não encontrada');
  if (invoice.gateway_reference_id) return;
  if (!invoice.client_id) {
    throw new InvoiceGenerationError('A fatura ainda requer dados do cliente', 'missing_client');
  }
  if (!POLLABLE_INVOICE_STATUSES.has(invoice.status)) {
    throw new InvoiceGenerationError('Só é possível gerar cobrança para fatura pagável', 'not_payable');
  }

  const clientCpf = await pool.query<{ cpf_cnpj: string | null }>(
    `SELECT c.cpf_cnpj
     FROM clients c
     INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2
     WHERE c.id = $1
     LIMIT 1`,
    [invoice.client_id, invoice.tenant_id]
  );
  const cpfCnpj = normalizeCpfCnpjDigits(clientCpf.rows[0]?.cpf_cnpj ?? null);
  if (!cpfCnpj) {
    throw new InvoiceGenerationError('CPF/CNPJ é obrigatório para gerar a cobrança', 'missing_cpf_cnpj');
  }
  if (!isValidCpfOrCnpj(cpfCnpj)) {
    throw new InvoiceGenerationError('CPF/CNPJ inválido no cadastro do cliente', 'invalid_cpf_cnpj');
  }

  const cfg = await getActiveConfig('crm', invoice.tenant_id);
  const gatewayPolicy = paymentPolicyFromConfigRow(cfg);
  const metadata = invoice.gateway_metadata ?? {};
  const allowedPaymentMethods = mergePublicPayAllowedMethods(
    normalizeAllowedPaymentMethods(
      Array.isArray(metadata.allowed_payment_methods)
        ? (metadata.allowed_payment_methods as string[])
        : null
    ),
    cfg
  );
  const requestedMethod = resolveChargeMethodWithGatewayPolicy({
    explicit: invoice.payment_method,
    effectiveAllowed: allowedPaymentMethods,
    gatewayDefaultUi:
      gatewayPolicy.defaultUi ??
      pickFirstUiMethodByPreference(allowedPaymentMethods),
    policy: 'lenient',
  });

  await ensureReusablePaymentAttemptForSwitch({
    invoiceId: invoice.id,
    tenantId: invoice.tenant_id,
    clientId: invoice.client_id,
    invoiceGateway: invoice.gateway,
    requestedMethod,
    allowedPaymentMethods,
    idempotencyKey: null,
    amountCents: invoice.amount_cents,
    dueDate: invoice.due_date,
    description: invoice.description ?? `Cobrança ${invoice.due_date}`,
  });
}

export class PayWithCardError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PayWithCardError';
  }
}

export type PayWithCardRequestBody = {
  idempotency_key: string;
  /** Sprint 9 — captura com token persistido (sem PAN). */
  use_saved_card?: boolean;
  credit_card?: {
    holder_name: string;
    number: string;
    expiry_month: string;
    expiry_year: string;
    cvv: string;
  };
  cardholder?: {
    name: string;
    email: string;
    cpf_cnpj: string;
    postal_code: string;
    address_number: string;
    phone: string;
    address_complement?: string | null;
    mobile_phone?: string | null;
  };
};

const payCardInflight = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Desenho A: captura com payWithCreditCard no gateway_reference_id da tentativa ativa.
 * Pivot Desenho B: trocar apenas o corpo da chamada ao gateway mantendo este contrato.
 */
export async function payInvoiceWithCardByToken(
  token: string,
  body: PayWithCardRequestBody,
  _remoteIp: string
): Promise<Record<string, unknown>> {
  const idem = body.idempotency_key.trim();
  if (!idem) {
    throw new PayWithCardError('Chave de idempotência é obrigatória', 400, 'validation_error');
  }

  const cached = await getPayWithCardIdempotentResponse(token, idem);
  if (cached && cached.ok === true) {
    return cached;
  }

  const inflightKey = `${token}:${idem}`;
  const existing = payCardInflight.get(inflightKey);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    try {
      return await executePayWithCard(token, idem, body, _remoteIp);
    } finally {
      payCardInflight.delete(inflightKey);
    }
  })();

  payCardInflight.set(inflightKey, run);
  return run;
}

async function executePayWithCard(
  token: string,
  idempotencyKey: string,
  body: PayWithCardRequestBody,
  _remoteIp: string
): Promise<Record<string, unknown>> {
  const data = await getByPaymentToken(token);
  if (!data) {
    throw new PayWithCardError('Fatura não encontrada ou link inválido', 404, 'not_found');
  }
  if (!data.client_id) {
    throw new PayWithCardError('Complete seus dados antes de pagar com cartão', 403, 'forbidden');
  }
  if (data.invoice.status === 'paid') {
    throw new PayWithCardError('Esta fatura já está paga', 409, 'conflict');
  }
  if (!POLLABLE_INVOICE_STATUSES.has(data.invoice.status)) {
    throw new PayWithCardError('Não é possível pagar esta fatura agora', 409, 'conflict');
  }

  const metadata = (data.invoice.gateway_metadata as Record<string, unknown> | null) ?? null;
  const allowedPaymentMethods =
    normalizeAllowedPaymentMethods(
      Array.isArray(metadata?.allowed_payment_methods)
        ? (metadata.allowed_payment_methods as string[])
        : null
    ) ?? ['PIX', 'BOLETO', 'CREDIT_CARD'];
  if (!allowedPaymentMethods.includes('CREDIT_CARD')) {
    throw new PayWithCardError('Pagamento com cartão não está disponível para esta fatura', 409, 'conflict');
  }

  const attempt = await getActiveInvoicePaymentAttempt(data.invoice_id);
  if (!attempt || attempt.payment_method !== 'CREDIT_CARD' || !attempt.gateway_reference_id) {
    throw new PayWithCardError(
      'Selecione Cartão e aguarde a preparação da cobrança antes de enviar os dados',
      409,
      'conflict'
    );
  }

  const gwRow = await pool.query<{ gateway: string | null }>(
    `SELECT gateway FROM customer_invoices WHERE id = $1 LIMIT 1`,
    [data.invoice_id]
  );
  const invoiceGateway = gwRow.rows[0]?.gateway ?? null;
  const { gatewayKey, gateway } = await resolveCrmGatewayForTenantInvoice(data.tenant_id, invoiceGateway);

  if (attempt.gateway !== gatewayKey) {
    throw new PayWithCardError('Configuração de pagamento inconsistente. Atualize a página.', 409, 'conflict');
  }

  if (typeof gateway.payWithCreditCard !== 'function') {
    billingLog('invoice', 'public_pay_with_card_gateway_unsupported', {
      invoice_id: data.invoice_id,
      gateway: gatewayKey,
    });
    throw new PayWithCardError(
      'Pagamento com cartão inline não está disponível neste provedor. Contate o emissor da fatura.',
      502,
      'gateway_error'
    );
  }

  const creditCard = body.credit_card;
  const cardholder = body.cardholder;
  if (!creditCard || !cardholder) {
    throw new PayWithCardError('Dados do cartão incompletos', 400, 'validation_error');
  }

  const payInput: PayWithCreditCardInput = {
    paymentId: attempt.gateway_reference_id,
    creditCard: {
      holderName: creditCard.holder_name.trim(),
      number: creditCard.number,
      expiryMonth: creditCard.expiry_month.trim(),
      expiryYear: creditCard.expiry_year.trim(),
      ccv: creditCard.cvv.trim(),
    },
    creditCardHolderInfo: {
      name: cardholder.name.trim(),
      email: cardholder.email.trim(),
      cpfCnpj: cardholder.cpf_cnpj,
      postalCode: cardholder.postal_code,
      addressNumber: cardholder.address_number.trim(),
      addressComplement: cardholder.address_complement ?? null,
      phone: cardholder.phone,
      mobilePhone: cardholder.mobile_phone ?? null,
    },
  };

  void _remoteIp;

  let gwResult;
  try {
    gwResult = await gateway.payWithCreditCard!(payInput);
  } catch (e: unknown) {
    if (isAbortLikeError(e)) {
      throw new PayWithCardError(
        'A operação demorou demais. Verifique o status da fatura em instantes.',
        504,
        'gateway_timeout'
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    const httpMatch = msg.match(/Asaas API (\d+):/);
    const code = httpMatch ? parseInt(httpMatch[1], 10) : 502;
    await updateInvoicePaymentAttemptStatus({
      attemptId: attempt.id,
      status: 'failed',
      gatewayStatus: `error_${code}`,
    });
    if (code === 400 || code === 402) {
      throw new PayWithCardError(
        'Não foi possível processar o cartão. Verifique os dados ou use outro cartão.',
        400,
        'invalid_card'
      );
    }
    if (code === 404) {
      throw new PayWithCardError('Cobrança não encontrada no provedor. Atualize a página.', 422, 'unprocessable');
    }
    throw new PayWithCardError('Erro ao comunicar com o provedor de pagamento. Tente novamente.', 502, 'gateway_error');
  }

  const internalStatus = normalizeGatewayStatus(gatewayKey, gwResult.status);
  const paidAtDate =
    internalStatus === 'paid'
      ? gwResult.paidAt
        ? new Date(gwResult.paidAt)
        : new Date()
      : undefined;

  let attemptRowStatus: InvoiceAttemptStatus = 'waiting_payment';
  if (internalStatus === 'paid') attemptRowStatus = 'paid';
  else if (internalStatus === 'processing') attemptRowStatus = 'processing';
  else if (internalStatus === 'pending') attemptRowStatus = 'pending';
  else if (internalStatus === 'overdue') attemptRowStatus = 'overdue';

  await updateInvoicePaymentAttemptStatus({
    attemptId: attempt.id,
    status: attemptRowStatus,
    gatewayStatus: gwResult.status,
    paidAt: internalStatus === 'paid' ? paidAtDate : undefined,
  });

  const prevMeta = (attempt.gateway_metadata as Record<string, unknown> | null) ?? {};
  const mergedMeta: Record<string, unknown> = {
    ...prevMeta,
    card_capture_channel: 'inline_api',
  };

  await updateCustomerInvoiceGatewayData(data.invoice_id, {
    gateway: gatewayKey,
    payment_method: 'CREDIT_CARD',
    gateway_reference_id: gwResult.paymentId,
    gateway_status: gwResult.status,
    idempotency_key: attempt.idempotency_key,
    gateway_metadata: mergedMeta,
  });

  await updateCustomerInvoiceStatus(
    data.invoice_id,
    internalStatus,
    paidAtDate ?? null,
    gwResult.status
  );

  if (internalStatus === 'paid') {
    const { runPostPaidCleanupForCustomerInvoice } = await import('./billingGatewayChargeService.js');
    await runPostPaidCleanupForCustomerInvoice({
      invoiceId: data.invoice_id,
      tenantId: data.tenant_id,
      paidGatewayReferenceId: gwResult.paymentId,
      gatewayStatusRaw: gwResult.status,
      paidAt: paidAtDate ?? new Date(),
    }).catch((err) =>
      console.error('[executePayWithCard] runPostPaidCleanupForCustomerInvoice:', err)
    );
  }

  const payment_urls = {
    invoiceUrl: typeof mergedMeta.invoiceUrl === 'string' ? mergedMeta.invoiceUrl : undefined,
    bankSlipUrl: typeof mergedMeta.bankSlipUrl === 'string' ? mergedMeta.bankSlipUrl : undefined,
    bankSlipDigitableLine:
      typeof mergedMeta.bankSlipDigitableLine === 'string' ? mergedMeta.bankSlipDigitableLine : undefined,
    pixQrCode: typeof mergedMeta.pixQrCode === 'string' ? mergedMeta.pixQrCode : undefined,
    pixCopyPaste: typeof mergedMeta.pixCopyPaste === 'string' ? mergedMeta.pixCopyPaste : undefined,
  };
  const payloadMeta = buildPublicPayPayloadMeta(payment_urls);

  const responseBody: Record<string, unknown> = {
    ok: true,
    invoice_status: internalStatus,
    attempt: {
      id: attempt.id,
      payment_method: 'CREDIT_CARD',
      status: attemptRowStatus,
      gateway_status: gwResult.status,
      gateway_reference_id: gwResult.paymentId,
    },
    ...payloadMeta,
  };

  await savePayWithCardIdempotentResponse(token, idempotencyKey, responseBody);

  billingLog('invoice', 'public_pay_with_card_success', {
    invoice_id: data.invoice_id,
    attempt_id: attempt.id,
    gateway_reference_id: gwResult.paymentId,
  });

  return responseBody;
}

const POLLABLE_TENANT_BILLING_STATUSES = new Set([
  'pending',
  'waiting_payment',
  'processing',
  'overdue',
]);

const tenantBillingPayCardInflight = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Captura cartão na cobrança SaaS (tenant_billing), mesmo contrato de `executePayWithCard` das faturas CRM:
 * `gateway.payWithCreditCard` no `gateway_reference_id` da tentativa ativa (ou da linha principal se não houver tabela de tentativas).
 */
export async function payTenantBillingWithCard(
  billingId: string,
  options: {
    tenantId: string | null;
    inlinePayToken: string | null;
    body: PayWithCardRequestBody;
  }
): Promise<Record<string, unknown>> {
  const idem = options.body.idempotency_key.trim();
  if (!idem) {
    throw new PayWithCardError('Chave de idempotência é obrigatória', 400, 'validation_error');
  }

  const cached = await getPayWithCardIdempotentResponse(billingId, idem);
  if (cached && cached.ok === true) {
    return cached;
  }

  const inflightKey = `tb:${billingId}:${idem}`;
  const existing = tenantBillingPayCardInflight.get(inflightKey);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    try {
      return await executeTenantBillingPayWithCard(billingId, options, idem);
    } finally {
      tenantBillingPayCardInflight.delete(inflightKey);
    }
  })();

  tenantBillingPayCardInflight.set(inflightKey, run);
  return run;
}

async function executeTenantBillingPayWithCard(
  billingId: string,
  options: { tenantId: string | null; inlinePayToken: string | null; body: PayWithCardRequestBody },
  idempotencyKey: string
): Promise<Record<string, unknown>> {
  const billing = await getTenantBillingById(billingId);
  if (!billing) {
    throw new PayWithCardError('Cobrança não encontrada', 404, 'not_found');
  }

  if (options.tenantId) {
    if (billing.tenant_id !== options.tenantId) {
      throw new PayWithCardError('Acesso negado', 403, 'forbidden');
    }
  } else {
    const meta = (billing.gateway_metadata as Record<string, unknown> | null) ?? {};
    const expected = meta.checkout_inline_pay_token;
    if (
      typeof options.inlinePayToken !== 'string' ||
      !options.inlinePayToken.trim() ||
      options.inlinePayToken.trim() !== expected
    ) {
      throw new PayWithCardError('Token de pagamento inválido ou ausente', 403, 'forbidden');
    }
  }

  if (billing.status === 'paid') {
    throw new PayWithCardError('Esta cobrança já está paga', 409, 'conflict');
  }
  if (!POLLABLE_TENANT_BILLING_STATUSES.has(billing.status)) {
    throw new PayWithCardError('Não é possível pagar esta cobrança agora', 409, 'conflict');
  }

  const billingMeta = (billing.gateway_metadata as Record<string, unknown> | null) ?? {};

  let attempt: TenantBillingPaymentAttemptRow | null = null;
  if (await hasTenantBillingPaymentAttemptsTable()) {
    attempt = await getActiveTenantBillingPaymentAttempt(billingId);
  }

  const attemptMeta = (attempt?.gateway_metadata as Record<string, unknown> | null) ?? {};
  const allowedRaw =
    (Array.isArray(attemptMeta.allowed_payment_methods)
      ? attemptMeta.allowed_payment_methods
      : null) ??
    (Array.isArray(billingMeta.allowed_payment_methods) ? billingMeta.allowed_payment_methods : null);
  const allowedPaymentMethods =
    normalizeAllowedPaymentMethods(Array.isArray(allowedRaw) ? (allowedRaw as string[]) : null) ??
    ['PIX', 'BOLETO', 'CREDIT_CARD'];
  if (!allowedPaymentMethods.includes('CREDIT_CARD')) {
    throw new PayWithCardError('Pagamento com cartão não está disponível para esta cobrança', 409, 'conflict');
  }

  const cardAttemptOk =
    attempt?.payment_method === 'CREDIT_CARD' && Boolean(attempt.gateway_reference_id?.trim());
  const billingRowCardOk =
    String(billing.payment_method ?? '')
      .toUpperCase()
      .trim() === 'CREDIT_CARD' && Boolean(billing.gateway_reference_id?.trim());

  if (!cardAttemptOk && !billingRowCardOk) {
    throw new PayWithCardError(
      'Selecione Cartão e aguarde a preparação da cobrança antes de enviar os dados',
      409,
      'conflict'
    );
  }

  const gatewayKey = (attempt?.gateway ?? billing.gateway ?? 'asaas').trim() || 'asaas';
  const gateway = await getActiveGateway({ billingType: 'saas', tenantId: billing.tenant_id });
  if (!gateway) {
    throw new PayWithCardError('Gateway de pagamento não configurado', 502, 'gateway_error');
  }

  if (typeof gateway.payWithCreditCard !== 'function') {
    billingLog('invoice', 'saas_pay_with_card_gateway_unsupported', {
      billing_id: billingId,
      gateway: gatewayKey,
    });
    throw new PayWithCardError(
      'Pagamento com cartão inline não está disponível neste provedor.',
      502,
      'gateway_error'
    );
  }

  const paymentId = (attempt?.gateway_reference_id ?? billing.gateway_reference_id)!.trim();
  const body = options.body;

  let payInput: PayWithCreditCardInput;
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
    payInput = { paymentId, creditCardToken: saved.card_token };
  } else {
    if (!body.credit_card || !body.cardholder) {
      throw new PayWithCardError('Verifique os dados do cartão e do titular.', 400, 'validation_error');
    }
    payInput = {
      paymentId,
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
    };
  }

  let gwResult;
  try {
    gwResult = await gateway.payWithCreditCard!(payInput);
  } catch (e: unknown) {
    if (body.use_saved_card === true && billing.subscription_id) {
      const { markSaasCardTokenInvalid } = await import('./billing2/billingCardTokenStore.js');
      await markSaasCardTokenInvalid(billing.subscription_id, 'pay_failed').catch(() => undefined);
    }
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
    if (code === 404) {
      throw new PayWithCardError('Cobrança não encontrada no provedor. Atualize a página.', 422, 'unprocessable');
    }
    throw new PayWithCardError('Erro ao comunicar com o provedor de pagamento. Tente novamente.', 502, 'gateway_error');
  }

  const internalStatus = normalizeGatewayStatus(gatewayKey, gwResult.status);
  const paidAtDate =
    internalStatus === 'paid'
      ? gwResult.paidAt
        ? new Date(gwResult.paidAt)
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
      gatewayStatus: gwResult.status,
      paidAt: internalStatus === 'paid' ? paidAtDate : undefined,
    });
  }

  const prevMeta = (
    attempt ? (attempt.gateway_metadata as Record<string, unknown> | null) : billingMeta
  ) ?? {};
  const mergedMeta: Record<string, unknown> = {
    ...prevMeta,
    card_capture_channel: 'inline_api',
  };

  await updateInvoiceGatewayData(billingId, {
    gateway: gatewayKey,
    payment_method: 'CREDIT_CARD',
    gateway_reference_id: gwResult.paymentId,
    gateway_status: gwResult.status,
    idempotency_key: attempt?.idempotency_key ?? billing.idempotency_key,
    gateway_metadata: mergedMeta,
  });

  await updateInvoiceStatus(
    billingId,
    internalStatus as 'pending' | 'paid' | 'overdue' | 'cancelled',
    internalStatus === 'paid' ? paidAtDate ?? new Date() : undefined,
    'CREDIT_CARD',
    gwResult.status
  );

  if (internalStatus === 'paid') {
    await activatePlanFromBilling(billingId);
    // Sprint 9 — persistir token gateway-safe se Asaas devolveu (sem PAN).
    if (gwResult.creditCardToken?.trim()) {
      try {
        const { upsertSaasCardToken, cardTokenAuditSafe } = await import(
          './billing2/billingCardTokenStore.js'
        );
        const { writeBillingAuditEvent } = await import('./collectionPolicy/billingAuditEventWriter.js');
        let subscriptionId = billing.subscription_id;
        if (!subscriptionId) {
          const subR = await pool.query<{ id: string }>(
            `SELECT id::text AS id FROM subscriptions
             WHERE tenant_id = $1::uuid AND type = 'saas'
               AND status IN ('active', 'past_due', 'trialing')
             ORDER BY updated_at DESC LIMIT 1`,
            [billing.tenant_id]
          );
          subscriptionId = subR.rows[0]?.id ?? null;
        }
        if (subscriptionId) {
          await upsertSaasCardToken({
            subscriptionId,
            tenantId: billing.tenant_id,
            cardToken: gwResult.creditCardToken.trim(),
            cardBrand: gwResult.cardBrand ?? null,
            cardLast4: gwResult.cardLast4 ?? null,
            gateway: gatewayKey,
          });
          await writeBillingAuditEvent({
            actor: 'pay_with_card',
            actor_type: 'system',
            action: 'card.token_saved',
            entity_type: 'subscription',
            entity_id: subscriptionId,
            reason: body.use_saved_card ? 'reuse_or_refresh' : 'first_capture',
            origin: 'saas_pay_with_card',
            payload: {
              tenant_id: billing.tenant_id,
              billing_id: billingId,
              brand: gwResult.cardBrand ?? null,
              last4: gwResult.cardLast4 ?? null,
              token_mask: cardTokenAuditSafe(gwResult.creditCardToken),
            },
          });
        }
      } catch (tokenErr) {
        console.error('[executeTenantBillingPayWithCard] token persist failed', {
          billingId,
          error: tokenErr instanceof Error ? tokenErr.message : String(tokenErr),
        });
      }
    }
    const { schedulePublishPlatformBillingPaymentConfirmed } = await import(
      './platformNotifications/platformBusinessNotifications.js'
    );
    schedulePublishPlatformBillingPaymentConfirmed(billingId);
    // Sprint B — cancela cobranças abertas do ciclo (ex. Pix Auto na linha principal); auth intacta.
    {
      const prevRef = billing.gateway_reference_id?.trim() || null;
      const keep = gwResult.paymentId?.trim() || null;
      const extras = prevRef && keep && prevRef !== keep ? [prevRef] : [];
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
        gatewayStatusRawForExtras: gwResult.status,
      }).catch((err) =>
        console.error('[executeTenantBillingPayWithCard] cycle_paid_cleanup:', err)
      );
    }
  }

  const responseBody: Record<string, unknown> = {
    ok: true,
    billing_status: internalStatus,
    attempt: attempt
      ? {
          id: attempt.id,
          payment_method: 'CREDIT_CARD',
          status: attemptRowStatus,
          gateway_status: gwResult.status,
          gateway_reference_id: gwResult.paymentId,
        }
      : null,
  };

  await savePayWithCardIdempotentResponse(billingId, idempotencyKey, responseBody);

  billingLog('invoice', 'saas_pay_with_card_success', {
    billing_id: billingId,
    attempt_id: attempt?.id,
    gateway_reference_id: gwResult.paymentId,
  });

  return responseBody;
}

/**
 * Lista faturas do tenant com filtros opcionais. Sempre filtra por tenant_id.
 * Ordenação: created_at DESC (índice idx_customer_invoices_tenant_created_at).
 */
export async function listInvoices(
  tenantId: string,
  filters: ListCustomerInvoicesFilters = {}
): Promise<CustomerInvoiceRow[]> {
  const limit = Math.min(
    filters.limit ?? DEFAULT_LIST_LIMIT,
    MAX_LIST_LIMIT
  );
  const offset = Math.max(0, filters.offset ?? 0);

  const params: unknown[] = [tenantId];
  let paramIndex = 1;
  const conditions: string[] = ['ci.tenant_id = $1'];

  if (filters.client_id) {
    paramIndex++;
    conditions.push(`ci.client_id = $${paramIndex}`);
    params.push(filters.client_id);
  }
  if (filters.project_id) {
    paramIndex++;
    conditions.push(`ci.project_id = $${paramIndex}`);
    params.push(filters.project_id);
  }
  if (filters.status_in && filters.status_in.length > 0) {
    paramIndex++;
    conditions.push(`ci.status = ANY($${paramIndex}::text[])`);
    params.push(filters.status_in);
  } else if (filters.status) {
    paramIndex++;
    conditions.push(`ci.status = $${paramIndex}`);
    params.push(filters.status);
  }

  const limitParamIndex = paramIndex + 1;
  const offsetParamIndex = paramIndex + 2;
  params.push(limit, offset);

  const schema = await getCustomerInvoiceSchema();
  const r = await pool.query<CustomerInvoiceRow>(
    `SELECT ${schema.selectListFromCi},
            s.next_billing_date::text AS subscription_next_billing_date
     FROM customer_invoices ci
     LEFT JOIN subscriptions s ON s.id = ci.subscription_id AND s.tenant_id = ci.tenant_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ci.created_at DESC
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    params
  );
  return r.rows;
}

/**
 * Agregados por estado para o painel de faturas (totais reais do tenant).
 * Exclui `invoice_type = 'child'` para alinhar totais em R$ às faturas “principais”.
 */
export async function getCustomerInvoicesSummary(tenantId: string): Promise<CustomerInvoicesSummary> {
  const r = await pool.query<{
    paid_count: string;
    paid_amount_cents: string;
    pending_count: string;
    pending_amount_cents: string;
    overdue_count: string;
    overdue_amount_cents: string;
    total_count: string;
    total_amount_cents: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE ci.status = 'paid')::text AS paid_count,
       COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status = 'paid'), 0)::text AS paid_amount_cents,
       COUNT(*) FILTER (WHERE ci.status IN ('pending', 'waiting_payment'))::text AS pending_count,
       COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status IN ('pending', 'waiting_payment')), 0)::text AS pending_amount_cents,
       COUNT(*) FILTER (WHERE ci.status = 'overdue')::text AS overdue_count,
       COALESCE(SUM(ci.amount_cents) FILTER (WHERE ci.status = 'overdue'), 0)::text AS overdue_amount_cents,
       COUNT(*)::text AS total_count,
       COALESCE(SUM(ci.amount_cents), 0)::text AS total_amount_cents
     FROM customer_invoices ci
     WHERE ci.tenant_id = $1
       AND ci.invoice_type IS DISTINCT FROM 'child'`,
    [tenantId]
  );
  const row = r.rows[0];
  const n = (s: string | undefined) => parseInt(s ?? '0', 10);
  const b = (s: string | undefined) => parseInt(s ?? '0', 10);
  return {
    paid_count: n(row?.paid_count),
    paid_amount_cents: b(row?.paid_amount_cents),
    pending_count: n(row?.pending_count),
    pending_amount_cents: b(row?.pending_amount_cents),
    overdue_count: n(row?.overdue_count),
    overdue_amount_cents: b(row?.overdue_amount_cents),
    total_count: n(row?.total_count),
    total_amount_cents: b(row?.total_amount_cents),
  };
}

/**
 * Retorna uma fatura por id somente se pertencer ao tenant.
 */
export async function getInvoiceById(
  tenantId: string,
  invoiceId: string
): Promise<CustomerInvoiceRow | null> {
  const schema = await getCustomerInvoiceSchema();
  const r = await pool.query<CustomerInvoiceRow>(
    `SELECT ${schema.selectListBare}
     FROM customer_invoices
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [invoiceId, tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * Lista histórico de recorrência da mesma assinatura para uma fatura.
 * Não exige mudança de schema: usa subscription_id já persistido.
 */
export async function listRecurrenceHistoryForInvoice(
  tenantId: string,
  invoiceId: string
): Promise<RecurrenceHistoryInvoice[]> {
  const current = await pool.query<{ subscription_id: string | null }>(
    `SELECT subscription_id
     FROM customer_invoices
     WHERE id = $1 AND tenant_id = $2
     LIMIT 1`,
    [invoiceId, tenantId]
  );
  const subscriptionId = current.rows[0]?.subscription_id ?? null;
  if (!subscriptionId) return [];

  const r = await pool.query<RecurrenceHistoryInvoice>(
    `SELECT id, subscription_id, invoice_number, status, amount_cents, due_date, period_start, period_end, paid_at, payment_token, created_at
     FROM customer_invoices
     WHERE tenant_id = $1 AND subscription_id = $2
     ORDER BY due_date DESC, created_at DESC
     LIMIT 120`,
    [tenantId, subscriptionId]
  );
  return r.rows;
}

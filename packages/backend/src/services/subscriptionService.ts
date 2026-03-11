/**
 * Orquestração: compra de plano (subscribePlan) e ativação a partir da fatura (activatePlanFromBilling).
 * Utiliza billingService, invoiceService e gatewayProvider.
 */
import { pool } from '../utils/db.js';
import { calculateInvoiceAmount, validatePlanForPurchase, type BillingInterval } from './billingService.js';
import {
  createInvoice,
  getInvoiceById,
  updateInvoiceGatewayData,
  setBillingSubscriptionId,
  type CreateInvoiceInput,
  type TenantBillingRow,
} from './invoiceService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import type { PaymentMethod } from '../modules/payments/paymentGatewayTypes.js';
import { createSubscription, getActiveSaasSubscriptionByTenant } from './billingSubscriptionService.js';
import { getBillingSettings } from './billingSettingsService.js';

/**
 * Adiciona intervalo à data (monthly, quarterly, semi_annual, yearly).
 * Usado para calcular plan_period_end no backend (fonte de verdade).
 * Atenção: em datas como 31/01, setMonth(+1) pode gerar 03/03 (rollover JS); para próximo ciclo de cobrança use calculateNextBillingDate.
 */
export function addInterval(date: Date, interval: BillingInterval): Date {
  const result = new Date(date);
  switch (interval) {
    case 'monthly':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'quarterly':
      result.setMonth(result.getMonth() + 3);
      break;
    case 'semi_annual':
      result.setMonth(result.getMonth() + 6);
      break;
    case 'yearly':
      result.setFullYear(result.getFullYear() + 1);
      break;
    default:
      result.setMonth(result.getMonth() + 1);
  }
  return result;
}

/**
 * Calcula a próxima data de cobrança respeitando billing_anchor_day e último dia do mês (Stripe/Chargebee).
 * Regra: next_day = MIN(anchor_day, last_day_of_month) no mês alvo.
 * Ex.: 31 Jan + 1 mês → 28 Fev; 31 Mar + 1 mês → 30 Abr; dia 15 → sempre dia 15.
 */
export function calculateNextBillingDate(
  periodStart: string,
  billingInterval: BillingInterval,
  billingAnchorDay: number | null
): string {
  const d = new Date(periodStart + 'T12:00:00Z');
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const dayOfPeriod = d.getUTCDate();
  const anchor = billingAnchorDay ?? dayOfPeriod;

  switch (billingInterval) {
    case 'monthly':
      m += 1;
      break;
    case 'quarterly':
      m += 3;
      break;
    case 'semi_annual':
      m += 6;
      break;
    case 'yearly':
      y += 1;
      break;
    default:
      m += 1;
  }
  if (m > 11) {
    y += Math.floor(m / 12);
    m = m % 12;
  }

  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(anchor, lastDay);
  const next = new Date(Date.UTC(y, m, day));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Ativa o plano no tenant a partir da fatura paga.
 * Sempre calcula plan_period_start e plan_period_end no backend (nunca copia do gateway).
 * Idempotente: não reexecuta se o tenant já estiver ativo com esta fatura (evita duplicação webhook + polling).
 */
export async function activatePlanFromBilling(billingId: string): Promise<void> {
  const billing = await getInvoiceById(billingId);
  if (!billing) {
    console.log('[SUBSCRIPTION] activatePlanFromBilling: billing não encontrado', billingId);
    return;
  }
  if (billing.status !== 'paid') {
    console.log('[SUBSCRIPTION] activatePlanFromBilling: billing não está paid', { billingId, status: billing.status });
    return;
  }

  const tenantCheck = await pool.query<{ status: string; activated_billing_id: string | null }>(
    `SELECT status, activated_billing_id FROM tenants WHERE id = $1`,
    [billing.tenant_id]
  );
  const tenant = tenantCheck.rows[0];
  if (tenant?.status === 'active' && tenant.activated_billing_id === billingId) {
    console.log('[SUBSCRIPTION] activatePlanFromBilling: tenant já ativo com esta fatura, skip', { billingId });
    return;
  }

  console.log('[SUBSCRIPTION] ativando plano', {
    tenantId: billing.tenant_id,
    planId: billing.plan_id,
    billingId,
  });

  const tenantId = billing.tenant_id;
  const planId = billing.plan_id;
  const billingInterval = (billing.billing_interval ?? 'monthly') as BillingInterval;

  const periodStart = new Date();
  const periodEnd = addInterval(periodStart, billingInterval);
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  const usersCount = billing.users_count != null ? billing.users_count : null;

  await pool.query(
    `UPDATE tenants
     SET plan_id = $1, status = 'active',
         plan_period_start = $2, plan_period_end = $3,
         activated_billing_id = $4,
         max_users_override = COALESCE($5, max_users_override),
         updated_at = now()
     WHERE id = $6`,
    [planId, periodStartStr, periodEndStr, billingId, usersCount, tenantId]
  );

  // Billing Engine Fase 1: criar assinatura (saas) e vincular fatura
  const existing = await getActiveSaasSubscriptionByTenant(tenantId);
  if (!existing) {
    const config = await getActiveConfig('saas');
    const gatewayKey = config?.gateway_key ?? 'asaas';
    const billingSettings = await getBillingSettings();
    const sub = await createSubscription({
      type: 'saas',
      tenant_id: tenantId,
      plan_id: planId,
      amount_cents: billing.amount_cents,
      billing_interval: billingInterval,
      next_billing_date: periodEndStr,
      current_period_start: periodStartStr,
      current_period_end: periodEndStr,
      billing_anchor_day: periodStart.getDate(),
      grace_period_days: billingSettings.grace_period_days,
      users_count: usersCount ?? null,
      gateway: gatewayKey,
      created_by: 'checkout',
    });
    await setBillingSubscriptionId(billingId, sub.id);
  }
}

export interface SubscribePlanResult {
  billing: TenantBillingRow;
  paymentUrls?: {
    invoiceUrl?: string;
    bankSlipUrl?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
  };
}

/**
 * Cria fatura para assinatura do plano (Fase 3: sem gateway; Fase 4: com gateway e paymentUrls).
 * Valida plano, calcula valor, cria invoice. Se gateway disponível, chama ensureCustomer, createCharge,
 * persiste asaas_payment_id e retorna paymentUrls.
 */
export async function subscribePlan(
  tenantId: string,
  planId: string,
  billingInterval: BillingInterval,
  options?: {
    usersCount?: number | null;
    source?: 'superadmin' | 'self_service' | 'api';
    billingReason?: 'plan_purchase' | 'plan_upgrade' | 'plan_renewal' | 'manual_charge';
    paymentMethod?: PaymentMethod;
  }
): Promise<SubscribePlanResult> {
  await validatePlanForPurchase(planId, options?.usersCount ?? null);
  const amountCents = await calculateInvoiceAmount(planId, billingInterval, options?.usersCount ?? null);

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';

  const invoiceData: CreateInvoiceInput = {
    tenant_id: tenantId,
    plan_id: planId,
    billing_interval: billingInterval,
    amount_cents: amountCents,
    due_date: dueDate,
    source: options?.source ?? 'self_service',
    billing_reason: options?.billingReason ?? 'plan_purchase',
    users_count: options?.usersCount ?? null,
    gateway: gatewayKey,
  };

  const billing = await createInvoice(invoiceData);
  const paymentMethod = options?.paymentMethod ?? 'BOLETO';

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId });

  // [DIAG] Gateway e método antes de createCharge
  console.log('[DIAG subscriptionService]', {
    hasGateway: !!gateway,
    paymentMethod,
    invoice_number: billing.invoice_number,
  });

  if (gateway && billing.invoice_number) {
    try {
      const customerId = await gateway.ensureCustomer?.(tenantId);
      if (!customerId) throw new Error('ensureCustomer não retornou customerId');

      const idempotencyKey = `saas_${tenantId}_${planId}_${dueDateStr}`;
      const chargePayload = {
        customerId,
        amountCents,
        dueDate: dueDateStr,
        paymentMethod,
        description: billing.invoice_number,
        idempotencyKey,
        externalReference: tenantId,
      };
      console.log('[DIAG subscriptionService] createCharge payload', {
        customerId,
        amountCents,
        dueDate: dueDateStr,
        paymentMethod,
        description: billing.invoice_number,
      });

      const chargeResult = await gateway.createCharge(chargePayload);

      console.log('[DIAG subscriptionService] createCharge result', {
        paymentId: chargeResult.paymentId,
        status: chargeResult.status,
        hasInvoiceUrl: !!chargeResult.invoiceUrl,
        hasBankSlipUrl: !!chargeResult.bankSlipUrl,
        hasPixQrCode: !!chargeResult.pixQrCode,
        hasPixCopyPaste: !!chargeResult.pixCopyPaste,
      });

      await updateInvoiceGatewayData(billing.id, {
        gateway: gatewayKey,
        payment_method: paymentMethod,
        asaas_payment_id: chargeResult.paymentId,
        asaas_status: chargeResult.status,
        idempotency_key: idempotencyKey,
      });

      const updatedBilling = await getInvoiceById(billing.id);
      return {
        billing: updatedBilling ?? billing,
        paymentUrls: {
          invoiceUrl: chargeResult.invoiceUrl,
          bankSlipUrl: chargeResult.bankSlipUrl,
          pixQrCode: chargeResult.pixQrCode,
          pixCopyPaste: chargeResult.pixCopyPaste,
        },
      };
    } catch (err) {
      console.error('[subscriptionService] gateway createCharge error:', err);
    }
  }

  return { billing };
}

const DEFAULT_EXPIRE_HOURS = 48;

/**
 * Cancela faturas pendentes criadas há mais de N horas e reverte tenant para trial quando estava payment_pending.
 * Uso: job/cron periódico (ex.: a cada hora). Evita acúmulo de cobranças órfãs.
 */
export async function cancelExpiredPendingBillings(expireAfterHours: number = DEFAULT_EXPIRE_HOURS): Promise<{
  cancelledBillings: number;
  revertedTenants: number;
}> {
  const expired = await pool.query<{ id: string; tenant_id: string }>(
    `UPDATE tenant_billing
     SET status = 'cancelled', updated_at = now()
     WHERE status = 'pending' AND created_at < now() - ($1 || ' hours')::interval
     RETURNING id, tenant_id`,
    [String(expireAfterHours)]
  );

  const cancelledBillings = expired.rows.length;
  if (cancelledBillings === 0) {
    return { cancelledBillings: 0, revertedTenants: 0 };
  }

  const tenantIds = [...new Set(expired.rows.map((r) => r.tenant_id))];
  const reverted = await pool.query(
    `UPDATE tenants
     SET status = 'trial', updated_at = now()
     WHERE id = ANY($1::uuid[]) AND status = 'payment_pending'
     RETURNING id`,
    [tenantIds]
  );

  return { cancelledBillings, revertedTenants: reverted.rows.length };
}

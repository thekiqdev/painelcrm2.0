/**
 * Pipeline centralizado de validação antes do worker CRM continuar (B0.1).
 */
import type { BillingInterval, SubscriptionRow } from './billingSubscriptionService.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import { safeParseYmd } from '../utils/billingSafeDate.js';
import { billingLog } from './billingLogger.js';
import {
  renewalHardeningError,
  type ClassifiedRenewalError,
  type RenewalErrorCategory,
} from './renewalErrorClassification.js';
import {
  resolveAndPersistSubscriptionCustomerId,
  type CustomerResolutionVia,
} from './renewalCustomerResolution.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import { parseCrmContractMetadata } from './crmSubscriptionContractRenewalOverlay.js';

type DbQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

/** Referência mínima ao job — evita dependência circular com recurringBillingJobService. */
export type RenewalValidationJobRef = {
  id: string;
  subscription_id: string;
  tenant_id: string;
  cycle_key: string;
};

export type RenewalValidationStage =
  | 'subscription'
  | 'tenant'
  | 'status'
  | 'customer'
  | 'client'
  | 'dates'
  | 'billing_interval'
  | 'contract'
  | 'job';

export type RenewalValidationContext = {
  subscription: SubscriptionRow;
  job: RenewalValidationJobRef;
  periodStartYmd: string;
  periodEndYmd: string;
  customerId: string;
  billingInterval: BillingInterval;
  gatewayKey: string;
  correlationId: string;
  repairs: string[];
  customer_resolution: CustomerResolutionVia | null;
  date_validation: { period_start: string; period_end: string; next_billing_aligned: boolean };
  subscription_snapshot: Record<string, unknown>;
};

export type RenewalValidationFailure = {
  ok: false;
  stage: RenewalValidationStage;
  error: ClassifiedRenewalError;
  correlation_id: string;
  repairs_attempted: string[];
};

export type RenewalValidationSuccess = {
  ok: true;
  context: RenewalValidationContext;
};

export type RenewalValidationResult = RenewalValidationSuccess | RenewalValidationFailure;

const ALLOWED_INTERVALS = new Set<BillingInterval>([
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
]);

function subscriptionSnapshot(sub: SubscriptionRow): Record<string, unknown> {
  return {
    id: sub.id,
    tenant_id: sub.tenant_id,
    type: sub.type,
    status: sub.status,
    customer_id: sub.customer_id,
    billing_interval: sub.billing_interval,
    next_billing_date: sub.next_billing_date,
    current_period_start: sub.current_period_start,
    current_period_end: sub.current_period_end,
    amount_cents: sub.amount_cents,
  };
}

async function repairSubscriptionDates(
  db: DbQueryable,
  subscription: SubscriptionRow,
  periodStartYmd: string,
  jobCycleYmd: string
): Promise<{ subscription: SubscriptionRow; repairs: string[] }> {
  const repairs: string[] = [];
  let currentPeriodStart = safeParseYmd(subscription.current_period_start);
  const nextBilling = safeParseYmd(subscription.next_billing_date);
  const jobCycle = safeParseYmd(jobCycleYmd) ?? safeParseYmd(periodStartYmd);

  if (!currentPeriodStart && jobCycle) {
    currentPeriodStart = jobCycle;
    repairs.push('current_period_start_from_cycle_key');
    await db.query(
      `UPDATE subscriptions SET current_period_start = $1::date, updated_at = now()
       WHERE id = $2::uuid AND tenant_id = $3::uuid AND current_period_start IS NULL`,
      [currentPeriodStart, subscription.id, subscription.tenant_id]
    );
    subscription = { ...subscription, current_period_start: currentPeriodStart };
  }

  if (nextBilling && jobCycle && nextBilling !== jobCycle) {
    repairs.push('next_billing_date_aligned_to_job_cycle');
    await db.query(
      `UPDATE subscriptions SET next_billing_date = $1::date, updated_at = now()
       WHERE id = $2::uuid AND tenant_id = $3::uuid AND next_billing_date::text <> $1::text`,
      [jobCycle, subscription.id, subscription.tenant_id]
    );
    subscription = { ...subscription, next_billing_date: jobCycle };
  }

  return { subscription, repairs };
}

function fail(
  stage: RenewalValidationStage,
  message: string,
  reason_code: string,
  category: RenewalErrorCategory,
  correlationId: string,
  repairs: string[]
): RenewalValidationFailure {
  const err = renewalHardeningError(message, reason_code, category);
  return {
    ok: false,
    stage,
    error: err.classification,
    correlation_id: correlationId,
    repairs_attempted: repairs,
  };
}

/**
 * Valida contexto completo da renovação CRM. Aplica reparos seguros quando possível.
 */
export async function validateRenewalContext(
  db: DbQueryable,
  params: {
    job: RenewalValidationJobRef;
    subscription: SubscriptionRow;
    periodStartYmd: string;
    correlationId?: string;
  }
): Promise<RenewalValidationResult> {
  const correlationId = params.correlationId ?? `renewal-${params.job.id}-${Date.now()}`;
  const repairs: string[] = [];
  let subscription = params.subscription;

  if (!subscription?.id) {
    return fail(
      'subscription',
      'Assinatura inválida ou ausente',
      'subscription_missing',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }

  const tenantR = await db.query(
    `SELECT id::text FROM tenants WHERE id = $1::uuid LIMIT 1`,
    [subscription.tenant_id]
  );
  if (!(tenantR.rows[0] as { id?: string } | undefined)?.id) {
    return fail(
      'tenant',
      `Tenant não encontrado: ${subscription.tenant_id}`,
      'tenant_not_found',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }

  if (subscription.status === 'paused' || subscription.status === 'cancelled') {
    return fail(
      'status',
      `Assinatura inativa: ${subscription.status}`,
      'subscription_not_active',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }

  if (subscription.type !== 'customer') {
    return fail(
      'subscription',
      `Tipo de assinatura não suportado neste pipeline: ${subscription.type}`,
      'subscription_type_unsupported',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }

  const jobCycle = safeParseYmd(params.job.cycle_key) ?? safeParseYmd(params.periodStartYmd);
  if (!jobCycle) {
    return fail(
      'job',
      `cycle_key do job inválido: ${params.job.cycle_key}`,
      'invalid_job_cycle_key',
      'DATA_INCONSISTENCY',
      correlationId,
      repairs
    );
  }

  const dateRepair = await repairSubscriptionDates(db, subscription, params.periodStartYmd, jobCycle);
  subscription = dateRepair.subscription;
  repairs.push(...dateRepair.repairs);

  const periodStartYmd = safeParseYmd(params.periodStartYmd) ?? jobCycle;
  if (!safeParseYmd(periodStartYmd)) {
    return fail(
      'dates',
      `Data de início do período inválida: ${params.periodStartYmd}`,
      'invalid_period_start',
      'DATA_INCONSISTENCY',
      correlationId,
      repairs
    );
  }

  const intervalRaw = (subscription.billing_interval || 'monthly').trim() as BillingInterval;
  if (!ALLOWED_INTERVALS.has(intervalRaw)) {
    return fail(
      'billing_interval',
      `Intervalo de cobrança inválido: ${subscription.billing_interval}`,
      'invalid_billing_interval',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }

  let periodEndYmd: string;
  try {
    periodEndYmd = calculateNextBillingDate(periodStartYmd, intervalRaw, null);
    if (!safeParseYmd(periodEndYmd)) {
      throw new Error('period_end inválido');
    }
  } catch {
    return fail(
      'dates',
      `Não foi possível calcular period_end para ${periodStartYmd} / ${intervalRaw}`,
      'invalid_period_end_calculation',
      'DATA_INCONSISTENCY',
      correlationId,
      repairs
    );
  }

  const customerResolution = await resolveAndPersistSubscriptionCustomerId(db, subscription);
  if (!customerResolution.ok) {
    return fail(
      'customer',
      'Subscription customer sem customer_id (client_id) — não foi possível reconstruir a partir de faturas',
      'missing_customer_id',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }
  if (customerResolution.persisted) {
    repairs.push(`customer_id_${customerResolution.resolved_via}`);
    subscription = { ...subscription, customer_id: customerResolution.customer_id };
  }

  const clientOk = await db.query(
    `SELECT EXISTS(
       SELECT 1 FROM clients c
       INNER JOIN users u ON u.id = c.user_id AND u.tenant_id = $2::uuid
       WHERE c.id = $1::uuid
     ) AS ok`,
    [customerResolution.customer_id, subscription.tenant_id]
  );
  if (!(clientOk.rows[0] as { ok?: boolean } | undefined)?.ok) {
    return fail(
      'client',
      `Cliente não encontrado no tenant: ${customerResolution.customer_id}`,
      'client_not_found',
      'CONFIGURATION_ERROR',
      correlationId,
      repairs
    );
  }

  const metaR = await db.query(
    `SELECT metadata FROM subscriptions WHERE id = $1 LIMIT 1`,
    [subscription.id]
  );
  const metadata = (metaR.rows[0] as { metadata?: unknown } | undefined)?.metadata;
  const contract = parseCrmContractMetadata(metadata);
  if (metadata != null && !contract) {
    billingLog('job', 'renewal_validation_contract_metadata_unparsed', {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
    });
  }

  const config = await getActiveConfig('crm', subscription.tenant_id);
  const gatewayKey = config?.gateway_key ?? 'asaas';

  const nextBillingAligned =
    safeParseYmd(subscription.next_billing_date) === periodStartYmd ||
    repairs.some((r) => r === 'next_billing_date_aligned_to_job_cycle');

  if (repairs.length > 0) {
    billingLog('job', 'renewal_validation_auto_repairs', {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      job_id: params.job.id,
      correlation_id: correlationId,
      repairs: repairs.join(','),
    });
  }

  return {
    ok: true,
    context: {
      subscription,
      job: params.job,
      periodStartYmd,
      periodEndYmd,
      customerId: customerResolution.customer_id,
      billingInterval: intervalRaw,
      gatewayKey,
      correlationId,
      repairs,
      customer_resolution: customerResolution.resolved_via,
      date_validation: {
        period_start: periodStartYmd,
        period_end: periodEndYmd,
        next_billing_aligned: nextBillingAligned,
      },
      subscription_snapshot: subscriptionSnapshot(subscription),
    },
  };
}

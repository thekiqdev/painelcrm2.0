/**
 * Pipeline SaaS renewal — BillingRenewalEngine (B0.3).
 */
import { pool } from '../../utils/db.js';
import { billingLog } from '../billingLogger.js';
import {
  changeSubscriptionPlan,
  type SubscriptionRow,
} from '../billingSubscriptionService.js';
import {
  createInvoice,
  updateInvoiceGatewayData,
  type CreateInvoiceInput,
} from '../invoiceService.js';
import { publishPlatformBillingChargeCreated } from '../platformNotifications/platformBusinessNotifications.js';
import { calculateSaasRenewalInvoiceAmount, type BillingInterval } from '../billingService.js';
import { trySettleZeroAmountBillingIfEligible } from '../../commercial/zeroAmountSettlementService.js';
import { getActiveGateway } from '../../modules/payments/gatewayProvider.js';
import { getActiveConfig } from '../paymentGatewayConfigService.js';
import { resolveAutomaticInvoicePaymentMethod } from '../gatewayPaymentMethodPolicy.js';
import { calculateNextBillingDate } from '../subscriptionService.js';
import {
  BILLING_RECURRING_JOB_OUTCOME,
  advanceSubscriptionAfterCompletedCycle,
  completeBillingRecurringJob,
} from '../billingRecurringJobPersistence.js';
import type {
  BillingRenewalExecutionMode,
  BillingRenewalJobRef,
  BillingRenewalResult,
} from './types.js';

type DbQueryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

function nextSubscriptionBillingAfterCycle(periodStartYmd: string, interval: BillingInterval): string {
  return calculateNextBillingDate(periodStartYmd, interval, null);
}

function buildSaasRenewalResult(
  partial: Partial<BillingRenewalResult> &
    Pick<BillingRenewalResult, 'success' | 'executionMode' | 'correlationId' | 'cycleKey' | 'executionTime' | 'logs'>
): BillingRenewalResult {
  return {
    invoiceId: null,
    gatewayStatus: null,
    notificationStatus: 'unknown',
    timelineStatus: 'not_applicable',
    historyStatus: 'not_applicable',
    subscriptionAdvanced: false,
    completionOutcome: null,
    ...partial,
  };
}

export async function executeSaasRenewal(params: {
  client: DbQueryable;
  job: BillingRenewalJobRef;
  subscription: SubscriptionRow;
  periodStartYmd: string;
  executionMode: BillingRenewalExecutionMode;
  correlationId: string;
}): Promise<BillingRenewalResult> {
  const started = Date.now();
  const logs: string[] = ['saas_renewal_start'];
  const { client, job } = params;
  const subscription = params.subscription;
  const correlationId = params.correlationId;
  const periodStart = params.periodStartYmd;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = nextSubscriptionBillingAfterCycle(periodStart, interval);

  const planId = subscription.plan_id;
  if (!planId) {
    throw new Error('Subscription saas sem plan_id');
  }

  const planRow = await pool.query<{
    name: string;
    price_cents: number | null;
    plan_type: string | null;
  }>('SELECT name, price_cents, plan_type FROM plans WHERE id = $1', [planId]);
  const planName = planRow.rows[0]?.name ?? null;
  const planType = planRow.rows[0]?.plan_type ?? 'standard';

  const tenantSeats = await pool.query<{ max_users_scheduled_next_cycle: number | null }>(
    `SELECT max_users_scheduled_next_cycle FROM tenants WHERE id = $1`,
    [subscription.tenant_id]
  );
  const scheduledNext = tenantSeats.rows[0]?.max_users_scheduled_next_cycle;
  const isCustom = planType === 'custom';
  let usersForRenewal = subscription.users_count ?? null;
  if (isCustom && scheduledNext != null && scheduledNext >= 1) {
    usersForRenewal = scheduledNext;
  }

  const renewalPricing = await calculateSaasRenewalInvoiceAmount({
    planId,
    billingInterval: interval,
    planType,
    planListPriceCents: planRow.rows[0]?.price_cents ?? null,
    usersForRenewal,
    contracted_plan_price_cents: subscription.contracted_plan_price_cents,
    contracted_price_per_user_cents: subscription.contracted_price_per_user_cents,
    tenantId: subscription.tenant_id,
  });
  const amountCents = renewalPricing.amountCents;

  billingLog('job', 'saas_renewal_pricing_source', {
    jobId: job.id,
    subscription_id: subscription.id,
    tenant_id: subscription.tenant_id,
    amount_cents: amountCents,
    price_source: renewalPricing.priceSource,
  });

  const dueDate = periodStart;
  const config = await getActiveConfig('saas');
  const gatewayKey = config?.gateway_key ?? 'asaas';

  const invoiceData: CreateInvoiceInput = {
    tenant_id: subscription.tenant_id,
    plan_id: planId,
    billing_interval: interval,
    amount_cents: amountCents,
    due_date: dueDate,
    source: 'self_service',
    billing_reason: 'plan_renewal',
    users_count: usersForRenewal,
    gateway: gatewayKey,
    subscription_id: subscription.id,
    period_start: periodStart,
    period_end: periodEnd,
    plan_name_snapshot: planName,
    plan_price_snapshot: renewalPricing.planPriceSnapshotForInvoice,
  };

  const billing = await createInvoice(invoiceData);

  const zeroSettlement = await trySettleZeroAmountBillingIfEligible({
    billingId: billing.id,
    amountCents,
    source: 'renewal',
  });

  const gateway = zeroSettlement
    ? null
    : await getActiveGateway({ billingType: 'saas', tenantId: subscription.tenant_id });
  if (gateway) {
    try {
      const customerId = await gateway.ensureCustomer?.(subscription.tenant_id);
      if (customerId) {
        const idempotencyKey = `saas_renew_${subscription.id}_${periodStart}`;
        const renewalPm = resolveAutomaticInvoicePaymentMethod(
          subscription.default_payment_method as string | null,
          config
        );
        const chargeResult = await gateway.createCharge({
          customerId,
          amountCents,
          dueDate: periodStart,
          paymentMethod: renewalPm,
          description: billing.invoice_number ?? `Renovação ${periodStart}`,
          idempotencyKey,
          externalReference: subscription.tenant_id,
        });
        await updateInvoiceGatewayData(billing.id, {
          gateway: gatewayKey,
          payment_method: renewalPm,
          gateway_reference_id: chargeResult.paymentId,
          gateway_status: chargeResult.status,
          idempotency_key: idempotencyKey,
        });
      }
    } catch (gatewayErr) {
      console.error('[recurringBillingJobService] gateway createCharge error', { billingId: billing.id, err: gatewayErr });
    }
  }

  if (!zeroSettlement) {
    await publishPlatformBillingChargeCreated(billing.id);
  }

  // lifecycle shadow observation (future — renewal route Sprint I+)
  void import('../../lifecycle/lifecycleBillingObserver.js').then(({ observeFutureBillingLifecycleEvent }) =>
    observeFutureBillingLifecycleEvent(
      'subscription.renewed',
      { tenantId: subscription.tenant_id, subscriptionId: subscription.id, invoiceId: billing.id },
      { source: 'recurring_renewal_invoice' },
    ),
  );

  await advanceSubscriptionAfterCompletedCycle(client, {
    jobId: job.id,
    subscriptionId: subscription.id,
    tenantId: subscription.tenant_id,
    cycleDateYmd: periodStart,
    source: 'saas_new_invoice',
    resultInvoiceId: billing.id,
  });

  if (isCustom && scheduledNext != null && scheduledNext >= 1) {
    await pool.query(
      `UPDATE tenants
       SET max_users_override = $1,
           max_users_scheduled_next_cycle = NULL,
           updated_at = now()
       WHERE id = $2`,
      [scheduledNext, subscription.tenant_id]
    );
    const sync = await changeSubscriptionPlan(subscription.id, subscription.tenant_id, {
      plan_id: planId,
      users_count: scheduledNext,
      billing_interval: interval,
    });
    if (!sync.ok) {
      console.error('[recurringBillingJobService] falha ao aplicar assentos agendados', sync.error);
    }
  }

  await pool.query(
    `UPDATE subscriptions
     SET amount_cents = $1::int, updated_at = now()
     WHERE id = $2::uuid AND tenant_id = $3::uuid`,
    [amountCents, subscription.id, subscription.tenant_id]
  );

  await completeBillingRecurringJob(client, {
    jobId: job.id,
    resultInvoiceId: billing.id,
    resultInvoiceType: 'tenant_billing',
    outcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_SAAS,
    detail: JSON.stringify({ tenant_billing_id: billing.id, period_start: periodStart }),
  });
  billingLog('job', 'saas_renewal_invoice_persisted', {
    jobId: job.id,
    subscriptionId: subscription.id,
    tenant_billing_id: billing.id,
  });

  return buildSaasRenewalResult({
    success: true,
    invoiceId: billing.id,
    gatewayStatus: null,
    notificationStatus: zeroSettlement ? 'skipped' : 'queued',
    timelineStatus: 'ok',
    historyStatus: 'ok',
    subscriptionAdvanced: true,
    completionOutcome: BILLING_RECURRING_JOB_OUTCOME.COMPLETED_INVOICE_SAAS,
    executionMode: params.executionMode,
    correlationId,
    cycleKey: periodStart,
    executionTime: Date.now() - started,
    logs: [...logs, 'saas_renewal_complete'],
  });
}

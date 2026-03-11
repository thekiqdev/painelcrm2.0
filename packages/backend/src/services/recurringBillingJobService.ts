/**
 * Billing Engine: scheduler (enfileirar jobs) e worker (processar jobs).
 * Scheduler: SELECT subscriptions WHERE status='active' AND next_billing_date <= CURRENT_DATE LIMIT 500.
 * Worker: SELECT jobs FOR UPDATE SKIP LOCKED LIMIT 100; validar subscription; criar fatura; gateway; atualizar subscription e job.
 */
import { pool } from '../utils/db.js';

import { billingLog, notifyBillingJobFailed } from './billingLogger.js';
import {
  getSubscriptionById,
  updateSubscriptionAfterRenewal,
  expireCancelledSubscriptions,
  type SubscriptionRow,
} from './billingSubscriptionService.js';
import {
  createInvoice,
  updateInvoiceGatewayData,
  findInvoiceBySubscriptionAndPeriod,
  type CreateInvoiceInput,
} from './invoiceService.js';
import {
  createCustomerInvoice,
  findCustomerInvoiceBySubscriptionAndPeriod,
  updateCustomerInvoiceGatewayData,
} from './customerInvoiceService.js';
import { getPaymentCustomerForClient, createPaymentCustomerForClient } from './paymentCustomersService.js';
import { calculateInvoiceAmount, type BillingInterval } from './billingService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import { calculateNextBillingDate } from './subscriptionService.js';

const SCHEDULER_LIMIT = 500;
const WORKER_BATCH_SIZE = 100;

/**
 * Scheduler: busca assinaturas com next_billing_date <= CURRENT_DATE e enfileira um job por ciclo (cycle_key).
 * Usar CURRENT_DATE para evitar drift de timezone/hora. LIMIT 500 por execução.
 * Também expira assinaturas com cancel_at_period_end e current_period_end < hoje.
 */
export async function enqueueRenewalJobs(): Promise<{ enqueued: number; skipped: number; expired: number }> {
  const expired = await expireCancelledSubscriptions();

  const subs = await pool.query<{ id: string; tenant_id: string; next_billing_date: string }>(
    `SELECT id, tenant_id, next_billing_date
     FROM subscriptions
     WHERE status = 'active' AND next_billing_date <= CURRENT_DATE
     ORDER BY next_billing_date
     LIMIT $1`,
    [SCHEDULER_LIMIT]
  );

  let enqueued = 0;
  let skipped = 0;

  billingLog('scheduler', 'enqueue_run', { total_candidates: subs.rows.length, expired });
  for (const row of subs.rows) {
    const cycleKey = row.next_billing_date; // YYYY-MM-DD
    const existing = await pool.query(
      `SELECT id FROM billing_recurring_jobs
       WHERE subscription_id = $1 AND cycle_key = $2 AND status IN ('pending', 'processing')
       LIMIT 1`,
      [row.id, cycleKey]
    );
    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }
    await pool.query(
      `INSERT INTO billing_recurring_jobs (subscription_id, tenant_id, job_type, cycle_key, scheduled_at, status)
       VALUES ($1, $2, 'renewal', $3, ($4::date)::timestamptz, 'pending')
       ON CONFLICT (subscription_id, cycle_key) DO NOTHING`,
      [row.id, row.tenant_id, cycleKey, row.next_billing_date]
    );
    enqueued++;
  }

  billingLog('scheduler', 'enqueue_done', { enqueued, skipped, expired });
  return { enqueued, skipped, expired };
}

export interface JobRow {
  id: string;
  subscription_id: string;
  tenant_id: string;
  job_type: string;
  cycle_key: string;
  scheduled_at: string;
  retry_at: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
}

/**
 * Worker: processa um batch de jobs (FOR UPDATE SKIP LOCKED LIMIT 100).
 * Valida subscription (active, next_billing_date <= CURRENT_DATE, cancel_at_period_end); cria fatura; chama gateway; atualiza subscription (last_job_at, next_billing_date, etc.) e job.
 */
export async function processNextBatch(workerId: string): Promise<{ processed: number; failed: number; cancelled: number }> {
  const client = await pool.connect();
  const result = { processed: 0, failed: 0, cancelled: 0 };

  try {
    const jobsResult = await client.query<JobRow>(
      `SELECT id, subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, status, attempts, max_attempts
       FROM billing_recurring_jobs
       WHERE status = 'pending'
         AND scheduled_at <= now()
         AND (retry_at IS NULL OR retry_at <= now())
       ORDER BY scheduled_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [WORKER_BATCH_SIZE]
    );
    const jobs = jobsResult.rows;
    billingLog('worker', 'batch_start', { workerId, batchSize: jobs.length });

    for (const job of jobs) {
      await client.query(
        `UPDATE billing_recurring_jobs SET status = 'processing', locked_at = now(), locked_by = $1, updated_at = now() WHERE id = $2`,
        [workerId, job.id]
      );

      try {
        const subscription = await getSubscriptionById(job.subscription_id);
        if (!subscription) {
          await markJobCancelled(client, job.id);
          result.cancelled++;
          continue;
        }

        const today = new Date().toISOString().slice(0, 10);
        if (subscription.status !== 'active') {
          await markJobCancelled(client, job.id);
          result.cancelled++;
          continue;
        }
        if (subscription.next_billing_date > today) {
          await markJobCancelled(client, job.id);
          result.cancelled++;
          continue;
        }
        if (subscription.cancel_at_period_end && subscription.current_period_end) {
          if (new Date() > new Date(subscription.current_period_end)) {
            await markJobCancelled(client, job.id);
            result.cancelled++;
            continue;
          }
        }

        if (subscription.type === 'saas') {
          const existingInvoice = await findInvoiceBySubscriptionAndPeriod(
            job.subscription_id,
            subscription.next_billing_date
          );
          if (existingInvoice) {
            const periodStart = subscription.next_billing_date;
            const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
            const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);
            await updateSubscriptionAfterRenewal(subscription.id, {
              next_billing_date: periodEnd,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              billing_cycle_count: subscription.billing_cycle_count + 1,
            });
            await client.query(
              `UPDATE billing_recurring_jobs SET status = 'completed', result_invoice_id = $1, result_invoice_type = 'tenant_billing', updated_at = now() WHERE id = $2`,
              [existingInvoice.id, job.id]
            );
            result.processed++;
            continue;
          }
          await processOneRenewalJob(job, subscription);
        } else if (subscription.type === 'customer') {
          const existingCustomerInvoice = await findCustomerInvoiceBySubscriptionAndPeriod(
            job.subscription_id,
            subscription.next_billing_date
          );
          if (existingCustomerInvoice) {
            const periodStart = subscription.next_billing_date;
            const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
            const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);
            await updateSubscriptionAfterRenewal(subscription.id, {
              next_billing_date: periodEnd,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              billing_cycle_count: subscription.billing_cycle_count + 1,
            });
            await client.query(
              `UPDATE billing_recurring_jobs SET status = 'completed', result_invoice_id = $1, result_invoice_type = 'customer_invoice', updated_at = now() WHERE id = $2`,
              [existingCustomerInvoice.id, job.id]
            );
            result.processed++;
            continue;
          }
          await processOneCustomerRenewalJob(job, subscription);
        } else {
          await markJobCancelled(client, job.id);
          result.cancelled++;
          continue;
        }
        result.processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        billingLog('job', 'job_error', { jobId: job.id, subscriptionId: job.subscription_id, tenantId: job.tenant_id, error: errMsg });
        const attempts = job.attempts + 1;
        const retryAt = new Date();
        if (attempts === 1) retryAt.setHours(retryAt.getHours() + 1);
        else if (attempts === 2) retryAt.setDate(retryAt.getDate() + 1);
        else retryAt.setDate(retryAt.getDate() + 3);
        const status = attempts >= job.max_attempts ? 'failed' : 'pending';
        await client.query(
          `UPDATE billing_recurring_jobs SET status = $1, attempts = $2, retry_at = $3, error_message = $4, updated_at = now() WHERE id = $5`,
          [status, attempts, retryAt.toISOString(), errMsg, job.id]
        );
        if (status === 'failed') {
          notifyBillingJobFailed(job.id, job.subscription_id, job.tenant_id, errMsg);
        }
        result.failed++;
      }
    }
  } finally {
    client.release();
  }

  billingLog('worker', 'batch_done', { workerId, ...result });
  return result;
}

async function markJobCancelled(client: import('pg').PoolClient, jobId: string): Promise<void> {
  await client.query(
    `UPDATE billing_recurring_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1`,
    [jobId]
  );
}

async function processOneRenewalJob(job: JobRow, subscription: SubscriptionRow): Promise<void> {
  const periodStart = subscription.next_billing_date;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);

  const planId = subscription.plan_id;
  if (!planId) {
    throw new Error('Subscription saas sem plan_id');
  }

  const planRow = await pool.query<{ name: string; price_cents: number | null }>(
    'SELECT name, price_cents FROM plans WHERE id = $1',
    [planId]
  );
  const planName = planRow.rows[0]?.name ?? null;
  const planPriceCents = planRow.rows[0]?.price_cents ?? subscription.amount_cents;

  const amountCents = await calculateInvoiceAmount(planId, interval, subscription.users_count ?? null);
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
    users_count: subscription.users_count ?? null,
    gateway: gatewayKey,
    subscription_id: subscription.id,
    period_start: periodStart,
    period_end: periodEnd,
    plan_name_snapshot: planName,
    plan_price_snapshot: planPriceCents ?? amountCents,
  };

  const billing = await createInvoice(invoiceData);

  const gateway = await getActiveGateway({ billingType: 'saas', tenantId: subscription.tenant_id });
  if (gateway) {
    try {
      const customerId = await gateway.ensureCustomer?.(subscription.tenant_id);
      if (customerId) {
        const idempotencyKey = `saas_renew_${subscription.id}_${periodStart}`;
        const chargeResult = await gateway.createCharge({
          customerId,
          amountCents,
          dueDate: periodStart,
          paymentMethod: (subscription.default_payment_method as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'BOLETO',
          description: billing.invoice_number ?? `Renovação ${periodStart}`,
          idempotencyKey,
          externalReference: subscription.tenant_id,
        });
        await updateInvoiceGatewayData(billing.id, {
          gateway: gatewayKey,
          payment_method: (subscription.default_payment_method as string) ?? null,
          asaas_payment_id: chargeResult.paymentId,
          asaas_status: chargeResult.status,
          idempotency_key: idempotencyKey,
        });
      }
    } catch (gatewayErr) {
      console.error('[recurringBillingJobService] gateway createCharge error', { billingId: billing.id, err: gatewayErr });
    }
  }

  await updateSubscriptionAfterRenewal(subscription.id, {
    next_billing_date: periodEnd,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    billing_cycle_count: subscription.billing_cycle_count + 1,
  });

  await pool.query(
    `UPDATE billing_recurring_jobs SET status = 'completed', result_invoice_id = $1, result_invoice_type = 'tenant_billing', updated_at = now() WHERE id = $2`,
    [billing.id, job.id]
  );
}

/**
 * Fase 4: processa um job de renovação para assinatura type=customer (fatura do cliente do CRM).
 * Cria registro em customer_invoices; usa gateway com billingType=crm e ensureCustomerForClient quando disponível.
 */
async function processOneCustomerRenewalJob(job: JobRow, subscription: SubscriptionRow): Promise<void> {
  const clientId = subscription.customer_id;
  if (!clientId) {
    throw new Error('Subscription customer sem customer_id (client_id)');
  }

  const periodStart = subscription.next_billing_date;
  const interval = (subscription.billing_interval || 'monthly') as BillingInterval;
  const periodEnd = calculateNextBillingDate(periodStart, interval, subscription.billing_anchor_day);

  const config = await getActiveConfig('crm', subscription.tenant_id);
  const gatewayKey = config?.gateway_key ?? 'asaas';

  const inv = await createCustomerInvoice({
    tenant_id: subscription.tenant_id,
    client_id: clientId,
    subscription_id: subscription.id,
    period_start: periodStart,
    period_end: periodEnd,
    amount_cents: subscription.amount_cents,
    due_date: periodStart,
    gateway: gatewayKey,
  });

  const gateway = await getActiveGateway({ billingType: 'crm', tenantId: subscription.tenant_id });
  if (gateway) {
    try {
      let customerId = (await getPaymentCustomerForClient(subscription.tenant_id, gatewayKey, clientId))?.gateway_customer_id ?? null;
      if (!customerId && gateway.ensureCustomerForClient) {
        const clientRow = await pool.query<{ name: string; email: string | null; phone: string | null; company: string | null }>(
          'SELECT name, email, phone, company FROM clients WHERE id = $1',
          [clientId]
        );
        const c = clientRow.rows[0];
        if (c) {
          customerId = await gateway.ensureCustomerForClient(subscription.tenant_id, clientId, {
            name: c.name,
            email: c.email ?? '',
            phone: c.phone ?? undefined,
          });
          await createPaymentCustomerForClient(
            subscription.tenant_id,
            gatewayKey,
            clientId,
            customerId,
            clientId
          );
        }
      }
      if (customerId) {
        const idempotencyKey = `customer_renew_${subscription.id}_${periodStart}`;
        const chargeResult = await gateway.createCharge({
          customerId,
          amountCents: subscription.amount_cents,
          dueDate: periodStart,
          paymentMethod: (subscription.default_payment_method as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'BOLETO',
          description: inv.invoice_number ?? `Cobrança ${periodStart}`,
          idempotencyKey,
          externalReference: clientId,
        });
        await updateCustomerInvoiceGatewayData(inv.id, {
          gateway: gatewayKey,
          payment_method: (subscription.default_payment_method as string) ?? null,
          asaas_payment_id: chargeResult.paymentId,
          asaas_status: chargeResult.status,
          idempotency_key: idempotencyKey,
        });
      }
    } catch (gatewayErr) {
      console.error('[recurringBillingJobService] gateway createCharge (customer) error', { invoiceId: inv.id, err: gatewayErr });
    }
  }

  await updateSubscriptionAfterRenewal(subscription.id, {
    next_billing_date: periodEnd,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    billing_cycle_count: subscription.billing_cycle_count + 1,
  });

  await pool.query(
    `UPDATE billing_recurring_jobs SET status = 'completed', result_invoice_id = $1, result_invoice_type = 'customer_invoice', updated_at = now() WHERE id = $2`,
    [inv.id, job.id]
  );
}

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
  createChildCustomerInvoice,
  findCustomerInvoiceBySubscriptionAndPeriod,
  getCustomerInvoiceItems,
  type CustomerInvoiceItemRow,
  updateCustomerInvoiceGatewayData,
} from './customerInvoiceService.js';
import { getPaymentCustomerForClient, createPaymentCustomerForClient } from './paymentCustomersService.js';
import { calculateInvoiceAmount, type BillingInterval } from './billingService.js';
import { getActiveGateway } from '../modules/payments/gatewayProvider.js';
import { getActiveConfig } from './paymentGatewayConfigService.js';
import { calculateNextBillingDate } from './subscriptionService.js';
import { getChildBillingBatchLimit, isChildItemInvoicesEnabled } from '../config/billingEnv.js';
import { getCustomerInvoiceSchema } from './customerInvoiceSchema.js';

const SCHEDULER_LIMIT = 500;
const WORKER_BATCH_SIZE = 100;

type CustomerItemRecurringInterval =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'yearly';

function calculateNextItemDueDate(periodStart: string, interval: CustomerItemRecurringInterval): string {
  const d = new Date(periodStart + 'T12:00:00Z');
  const anchorDay = d.getUTCDate();

  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();

  switch (interval) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
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
  const day = Math.min(anchorDay, lastDay);
  const next = new Date(Date.UTC(y, m, day));

  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

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
          gateway_reference_id: chargeResult.paymentId,
          gateway_status: chargeResult.status,
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

  // Fase 5 (base estrutural): gerar customer_invoice_items recorrentes por item.
  // Para manter o modelo simples (sem nova tabela de template), usamos a fatura anterior
  // do mesmo subscription_id como fonte dos itens.
  const prevPeriodStart = subscription.current_period_start;
  if (!prevPeriodStart) {
    throw new Error('Subscription current_period_start ausente para recorrência por item');
  }

  const prevInvoice = await findCustomerInvoiceBySubscriptionAndPeriod(subscription.id, prevPeriodStart);
  if (!prevInvoice) {
    throw new Error('Fatura anterior (para copiar itens) não encontrada no subscription');
  }

  const prevItems = await getCustomerInvoiceItems(prevInvoice.id);

  // D5: só linhas com is_recurring=true entram na próxima fatura de ciclo; demais são “avulsas” neste ciclo.
  const includedItems: Array<CustomerInvoiceItemRow & { next_due_date: string }> = [];
  for (const it of prevItems) {
    if (!it.is_recurring) continue;

    // E2: item com data própria (≠ ciclo atual) é cobrado só pela fila de faturas filhas.
    if (it.scheduled_due_date != null && it.scheduled_due_date !== periodStart) {
      continue;
    }

    const itemInterval = (it.recurring_interval ?? 'monthly') as CustomerItemRecurringInterval;
    const itemDue = it.scheduled_due_date ?? prevInvoice.due_date;

    // Só inclui itens que já chegaram (ou passaram) no due deste ciclo.
    if (itemDue > periodStart) continue;

    // Avança o próximo agendamento do item até ficar estritamente depois do período atual.
    let nextDue = calculateNextItemDueDate(itemDue, itemInterval);
    while (nextDue <= periodStart) {
      nextDue = calculateNextItemDueDate(nextDue, itemInterval);
    }

    includedItems.push({ ...it, next_due_date: nextDue });
  }

  if (includedItems.length === 0) {
    // Não cria fatura vazia; apenas avança o ciclo.
    await updateSubscriptionAfterRenewal(subscription.id, {
      next_billing_date: periodEnd,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      billing_cycle_count: subscription.billing_cycle_count + 1,
    });
    await pool.query(
      `UPDATE billing_recurring_jobs SET status = 'completed', updated_at = now() WHERE id = $1`,
      [job.id]
    );
    return;
  }

  const amountCents = includedItems.reduce((sum, it) => sum + Math.max(0, it.total_cents), 0);

  const inv = await createCustomerInvoice({
    tenant_id: subscription.tenant_id,
    client_id: clientId,
    subscription_id: subscription.id,
    period_start: periodStart,
    period_end: periodEnd,
    amount_cents: amountCents,
    due_date: periodStart,
    gateway: gatewayKey,
  });

  // Insere itens no novo invoice com o próximo scheduled_due_date (migração 80).
  const itemSchema = await getCustomerInvoiceSchema();
  for (const it of includedItems) {
    if (itemSchema.hasInvoiceItemAdvancedColumns) {
      await pool.query(
        `INSERT INTO customer_invoice_items (
        invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
        is_recurring, recurring_interval, scheduled_due_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          inv.id,
          it.product_id ?? null,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents,
          it.total_cents,
          it.sort_order,
          it.is_recurring,
          it.recurring_interval ?? null,
          it.next_due_date,
        ]
      );
    } else {
      await pool.query(
        `INSERT INTO customer_invoice_items (
        invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          inv.id,
          it.product_id ?? null,
          it.description,
          it.quantity,
          it.unit_price_cents,
          it.discount_cents,
          it.total_cents,
          it.sort_order,
        ]
      );
    }
  }

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
          amountCents,
          dueDate: periodStart,
          paymentMethod: (subscription.default_payment_method as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'BOLETO',
          description: inv.invoice_number ?? `Cobrança ${periodStart}`,
          idempotencyKey,
          externalReference: clientId,
        });
        await updateCustomerInvoiceGatewayData(inv.id, {
          gateway: gatewayKey,
          payment_method: (subscription.default_payment_method as string) ?? null,
          gateway_reference_id: chargeResult.paymentId,
          gateway_status: chargeResult.status,
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

export interface ProcessChildInvoicesResult {
  created: number;
  skipped: number;
  errors: number;
}

/**
 * E2: processa itens recorrentes com scheduled_due_date fora do period_start da fatura pai
 * (cobrança em outra data). Cria fatura filha + cobrança no gateway e avança scheduled_due_date no item pai.
 */
export async function processChildItemDueInvoices(): Promise<ProcessChildInvoicesResult> {
  const result: ProcessChildInvoicesResult = { created: 0, skipped: 0, errors: 0 };

  if (!isChildItemInvoicesEnabled()) {
    billingLog('worker', 'child_invoices_feature_off', {
      hint: 'Set BILLING_CHILD_ITEM_INVOICES_ENABLED=true to enable E2 child invoices',
    });
    return result;
  }

  const batchLimit = getChildBillingBatchLimit();

  type Row = {
    item_id: string;
    parent_invoice_id: string;
    product_id: string | null;
    description: string;
    quantity: number;
    unit_price_cents: number;
    discount_cents: number;
    total_cents: number;
    sort_order: number;
    is_recurring: boolean;
    recurring_interval: string | null;
    scheduled_due_date: string;
    tenant_id: string;
    client_id: string;
    subscription_id: string;
    inv_period_start: string | null;
    inv_due_date: string;
  };

  const q = await pool.query<Row>(
    `SELECT
       cii.id AS item_id,
       cii.invoice_id AS parent_invoice_id,
       cii.product_id,
       cii.description,
       cii.quantity,
       cii.unit_price_cents,
       cii.discount_cents,
       cii.total_cents,
       cii.sort_order,
       cii.is_recurring,
       cii.recurring_interval,
       cii.scheduled_due_date,
       ci.tenant_id,
       ci.client_id,
       ci.subscription_id,
       ci.period_start AS inv_period_start,
       ci.due_date AS inv_due_date
     FROM customer_invoice_items cii
     INNER JOIN customer_invoices ci ON ci.id = cii.invoice_id
     WHERE cii.is_recurring = true
       AND cii.scheduled_due_date IS NOT NULL
       AND cii.scheduled_due_date <= CURRENT_DATE
       AND ci.subscription_id IS NOT NULL
       AND ci.client_id IS NOT NULL
       AND COALESCE(ci.invoice_type, '') <> 'child'
       AND (
         (ci.period_start IS NOT NULL AND cii.scheduled_due_date <> ci.period_start)
         OR (ci.period_start IS NULL AND cii.scheduled_due_date <> ci.due_date)
       )
       AND NOT EXISTS (
         SELECT 1 FROM customer_invoices ch
         WHERE ch.parent_invoice_item_id = cii.id
           AND ch.due_date = cii.scheduled_due_date
       )
     ORDER BY cii.scheduled_due_date ASC
     LIMIT $1`,
    [batchLimit]
  );

  const childItemSchema = await getCustomerInvoiceSchema();

  for (const row of q.rows) {
    const subscription = await getSubscriptionById(row.subscription_id);
    if (!subscription || subscription.type !== 'customer' || !subscription.customer_id) {
      result.skipped++;
      continue;
    }
    if (subscription.customer_id !== row.client_id) {
      result.skipped++;
      continue;
    }

    const itemInterval = (row.recurring_interval ?? 'monthly') as CustomerItemRecurringInterval;
    const due = row.scheduled_due_date;
    const nextDue = calculateNextItemDueDate(due, itemInterval);
    const config = await getActiveConfig('crm', row.tenant_id);
    const gatewayKey = config?.gateway_key ?? 'asaas';

    let childInv;
    try {
      childInv = await createChildCustomerInvoice({
        tenant_id: row.tenant_id,
        client_id: row.client_id,
        subscription_id: row.subscription_id,
        parent_invoice_id: row.parent_invoice_id,
        parent_invoice_item_id: row.item_id,
        amount_cents: Math.max(0, row.total_cents),
        due_date: due,
        gateway: gatewayKey,
      });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
      if (code === '23505') {
        result.skipped++;
        continue;
      }
      billingLog('worker', 'child_invoice_insert_error', { itemId: row.item_id, error: String(err) });
      result.errors++;
      continue;
    }

    try {
      if (childItemSchema.hasInvoiceItemAdvancedColumns) {
        await pool.query(
          `INSERT INTO customer_invoice_items (
          invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order,
          is_recurring, recurring_interval, scheduled_due_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            childInv.id,
            row.product_id,
            row.description,
            row.quantity,
            row.unit_price_cents,
            row.discount_cents,
            row.total_cents,
            row.sort_order,
            row.is_recurring,
            row.recurring_interval,
            nextDue,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO customer_invoice_items (
          invoice_id, product_id, description, quantity, unit_price_cents, discount_cents, total_cents, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            childInv.id,
            row.product_id,
            row.description,
            row.quantity,
            row.unit_price_cents,
            row.discount_cents,
            row.total_cents,
            row.sort_order,
          ]
        );
      }
    } catch (err) {
      billingLog('worker', 'child_item_insert_error', { invoiceId: childInv.id, error: String(err) });
      result.errors++;
      continue;
    }

    const clientId = row.client_id;
    const gateway = await getActiveGateway({ billingType: 'crm', tenantId: row.tenant_id });
    if (gateway) {
      try {
        let customerId =
          (await getPaymentCustomerForClient(row.tenant_id, gatewayKey, clientId))?.gateway_customer_id ?? null;
        if (!customerId && gateway.ensureCustomerForClient) {
          const clientRow = await pool.query<{ name: string; email: string | null; phone: string | null }>(
            'SELECT name, email, phone FROM clients WHERE id = $1',
            [clientId]
          );
          const c = clientRow.rows[0];
          if (c) {
            customerId = await gateway.ensureCustomerForClient(row.tenant_id, clientId, {
              name: c.name,
              email: c.email ?? '',
              phone: c.phone ?? undefined,
            });
            await createPaymentCustomerForClient(row.tenant_id, gatewayKey, clientId, customerId, clientId);
          }
        }
        if (customerId) {
          const idempotencyKey = `customer_child_${row.item_id}_${due}`;
          const chargeResult = await gateway.createCharge({
            customerId,
            amountCents: Math.max(0, row.total_cents),
            dueDate: due,
            paymentMethod: (subscription.default_payment_method as 'PIX' | 'BOLETO' | 'CREDIT_CARD') ?? 'BOLETO',
            description: childInv.invoice_number ?? `Cobrança item ${due}`,
            idempotencyKey,
            externalReference: clientId,
          });
          await updateCustomerInvoiceGatewayData(childInv.id, {
            gateway: gatewayKey,
            payment_method: (subscription.default_payment_method as string) ?? null,
            gateway_reference_id: chargeResult.paymentId,
            gateway_status: chargeResult.status,
            idempotency_key: idempotencyKey,
          });
        }
      } catch (gatewayErr) {
        console.error('[recurringBillingJobService] gateway createCharge (child) error', {
          invoiceId: childInv.id,
          err: gatewayErr,
        });
      }
    }

    await pool.query(
      `UPDATE customer_invoice_items SET scheduled_due_date = $1 WHERE id = $2`,
      [nextDue, row.item_id]
    );

    billingLog('worker', 'child_invoice_done', { invoiceId: childInv.id, parentItemId: row.item_id, due });
    result.created++;
  }

  billingLog('worker', 'child_batch_summary', {
    created: result.created,
    skipped: result.skipped,
    errors: result.errors,
    candidates: q.rows.length,
    batchLimit,
  });

  return result;
}

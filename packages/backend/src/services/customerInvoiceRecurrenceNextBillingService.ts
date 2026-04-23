/**
 * Alteração da próxima data de cobrança (subscriptions.next_billing_date) a partir de uma fatura CRM paga,
 * sem modificar a invoice liquidada nem cobrança no gateway.
 */
import { pool } from '../utils/db.js';
import { getInvoiceById } from './customerBillingService.js';
import { getSubscriptionById, type SubscriptionRow } from './billingSubscriptionService.js';
import { billingRecurringJobsHasCompletionColumns } from './billingRecurringJobsOpsService.js';
import { billingLog } from './billingLogger.js';
import {
  BILLING_RECURRING_JOB_OUTCOME,
  tryEnqueueRenewalJobForSubscriptionId,
  type TryEnqueueRenewalJobForSubscriptionResult,
} from './recurringBillingJobService.js';

const NEXT_BILLING_YMD = /^\d{4}-\d{2}-\d{2}$/;

export interface PatchNextBillingFromInvoiceResult {
  subscription: Pick<SubscriptionRow, 'id' | 'next_billing_date' | 'billing_interval' | 'status' | 'type'>;
  cancelled_pending_jobs: number;
  enqueue_after_patch: TryEnqueueRenewalJobForSubscriptionResult | { ok: false; reason: 'internal_enqueue_error'; error: string };
}

/**
 * PATCH lógico: invoice deve ser origin=subscription, status=paid, com subscription_id;
 * subscription type=customer, active, mesmo tenant.
 * Cancela jobs pendentes de renovação para evitar fila obsoleta após reagendamento manual.
 */
export async function patchCustomerSubscriptionNextBillingFromPaidInvoice(params: {
  tenantId: string;
  invoiceId: string;
  nextBillingDateYmd: string;
  actorUserId?: string | null;
}): Promise<PatchNextBillingFromInvoiceResult> {
  const { tenantId, invoiceId, nextBillingDateYmd, actorUserId } = params;
  if (!NEXT_BILLING_YMD.test(nextBillingDateYmd.trim())) {
    throw new Error('next_billing_date deve ser YYYY-MM-DD');
  }
  const nextYmd = nextBillingDateYmd.trim();

  const inv = await getInvoiceById(tenantId, invoiceId);
  if (!inv) {
    throw new Error('Fatura não encontrada');
  }
  if (inv.origin !== 'subscription') {
    throw new Error('Só é possível reagendar recorrência a partir de fatura de assinatura');
  }
  if (inv.status !== 'paid') {
    throw new Error('Reagendar próxima cobrança só está disponível para fatura já paga');
  }
  if (!inv.subscription_id) {
    throw new Error('Fatura sem assinatura associada');
  }

  const sub = await getSubscriptionById(inv.subscription_id);
  if (!sub || sub.tenant_id !== tenantId) {
    throw new Error('Assinatura não encontrada');
  }
  if (sub.type !== 'customer') {
    throw new Error('Operação disponível apenas para assinaturas de cliente (CRM)');
  }
  if (sub.status !== 'active') {
    throw new Error('Assinatura não está ativa; não é possível alterar a próxima cobrança');
  }

  const prevNext = sub.next_billing_date;

  await pool.query(
    `UPDATE subscriptions
     SET next_billing_date = $1::date, updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [nextYmd, sub.id, tenantId]
  );

  const cancelled = await cancelPendingRenewalJobsForSubscription(sub.id);

  let enqueue_after_patch: PatchNextBillingFromInvoiceResult['enqueue_after_patch'];
  try {
    enqueue_after_patch = await tryEnqueueRenewalJobForSubscriptionId(sub.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    billingLog('invoice', 'customer_subscription_next_billing_enqueue_error', {
      tenantId,
      subscriptionId: sub.id,
      error: msg,
    });
    enqueue_after_patch = { ok: false, reason: 'internal_enqueue_error', error: msg };
  }

  billingLog('invoice', 'customer_subscription_next_billing_manual', {
    tenantId,
    invoiceId,
    subscriptionId: sub.id,
    previous_next_billing_date: prevNext,
    next_billing_date: nextYmd,
    cancelled_pending_jobs: cancelled,
    enqueue_after_patch_ok: enqueue_after_patch.ok,
    enqueue_after_patch_detail: enqueue_after_patch.ok
      ? enqueue_after_patch.mode
      : enqueue_after_patch.reason === 'internal_enqueue_error'
        ? enqueue_after_patch.error
        : enqueue_after_patch.reason,
    actor_user_id: actorUserId ?? undefined,
  });

  const updated = await getSubscriptionById(sub.id);
  if (!updated) {
    throw new Error('Assinatura não encontrada após atualização');
  }

  return {
    subscription: {
      id: updated.id,
      next_billing_date: updated.next_billing_date,
      billing_interval: updated.billing_interval,
      status: updated.status,
      type: updated.type,
    },
    cancelled_pending_jobs: cancelled,
    enqueue_after_patch,
  };
}

async function cancelPendingRenewalJobsForSubscription(subscriptionId: string): Promise<number> {
  const has = await billingRecurringJobsHasCompletionColumns();
  const detail = JSON.stringify({
    reason: 'next_billing_date_updated_via_crm',
    subscription_id: subscriptionId,
  });
  if (has) {
    const r = await pool.query(
      `UPDATE billing_recurring_jobs
       SET status = 'cancelled',
           completion_outcome = $2,
           completion_detail = $3,
           updated_at = now()
       WHERE subscription_id = $1 AND status = 'pending'`,
      [subscriptionId, BILLING_RECURRING_JOB_OUTCOME.CANCELLED_MANUAL_NEXT_BILLING_RESCHEDULE, detail]
    );
    return r.rowCount ?? 0;
  }
  const r = await pool.query(
    `UPDATE billing_recurring_jobs
     SET status = 'cancelled', updated_at = now()
     WHERE subscription_id = $1 AND status = 'pending'`,
    [subscriptionId]
  );
  return r.rowCount ?? 0;
}

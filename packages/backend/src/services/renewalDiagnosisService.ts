/**
 * Diagnóstico unificado de renovação CRM (B0.1).
 */
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { getSubscriptionById } from './billingSubscriptionService.js';
import { safeParseYmd } from '../utils/billingSafeDate.js';
import { probeSubscriptionCustomerId } from './renewalCustomerResolution.js';
import { resolveCrmRenewalPreviousInvoice } from './crmRenewalCustomerResolver.js';
import { describeRenewalEnqueueForSubscriptionId } from './recurringBillingJobService.js';
import { parseCrmContractMetadata } from './crmSubscriptionContractRenewalOverlay.js';
import type { BillingInterval } from './billingSubscriptionService.js';

export type RenewalDiagnosis = {
  subscription_id: string;
  ready_to_bill: boolean;
  failure_reason: string | null;
  validation: {
    subscription_found: boolean;
    status: string | null;
    type: string | null;
    tenant_id: string | null;
  };
  dates: {
    next_billing_date: string | null;
    next_billing_valid: boolean;
    current_period_start: string | null;
    current_period_start_valid: boolean;
    job_cycle_key: string | null;
  };
  customer: {
    customer_id: string | null;
    resolvable: boolean;
    resolved_via: string | null;
  };
  job: Awaited<ReturnType<typeof describeRenewalEnqueueForSubscriptionId>> | null;
  invoice: {
    template_resolvable: boolean;
    resolved_via: string | null;
    lookup_attempts: string[];
    reason: string | null;
  };
  contract: {
    has_crm_contract: boolean;
    amount_cents: number | null;
    billing_interval: string | null;
  };
  timeline: {
    enqueue_block_reason: string | null;
    can_attempt_insert: boolean;
  };
};

export async function diagnoseRenewal(subscriptionId: string): Promise<RenewalDiagnosis> {
  return withBillingWorkerRlsBypass(async () => {
    const sub = await getSubscriptionById(subscriptionId);
    const base: RenewalDiagnosis = {
      subscription_id: subscriptionId,
      ready_to_bill: false,
      failure_reason: null,
      validation: {
        subscription_found: !!sub,
        status: sub?.status ?? null,
        type: sub?.type ?? null,
        tenant_id: sub?.tenant_id ?? null,
      },
      dates: {
        next_billing_date: sub?.next_billing_date ?? null,
        next_billing_valid: safeParseYmd(sub?.next_billing_date) != null,
        current_period_start: sub?.current_period_start ?? null,
        current_period_start_valid: safeParseYmd(sub?.current_period_start) != null,
        job_cycle_key: safeParseYmd(sub?.next_billing_date),
      },
      customer: {
        customer_id: sub?.customer_id ?? null,
        resolvable: false,
        resolved_via: null,
      },
      job: null,
      invoice: {
        template_resolvable: false,
        resolved_via: null,
        lookup_attempts: [],
        reason: null,
      },
      contract: {
        has_crm_contract: false,
        amount_cents: null,
        billing_interval: null,
      },
      timeline: {
        enqueue_block_reason: null,
        can_attempt_insert: false,
      },
    };

    if (!sub) {
      base.failure_reason = 'subscription_not_found';
      return base;
    }

    const customerProbe = await probeSubscriptionCustomerId(pool, sub);
    base.customer.resolvable = customerProbe.ok;
    if (customerProbe.ok) {
      base.customer.customer_id = customerProbe.customer_id;
      base.customer.resolved_via = customerProbe.resolved_via;
    }

    const metaR = await pool.query<{ metadata: unknown }>(
      `SELECT metadata FROM subscriptions WHERE id = $1 LIMIT 1`,
      [subscriptionId]
    );
    const contract = parseCrmContractMetadata(metaR.rows[0]?.metadata);
    base.contract = {
      has_crm_contract: contract != null,
      amount_cents: contract?.amount_cents ?? sub.amount_cents,
      billing_interval: contract?.billing_interval ?? sub.billing_interval,
    };

    const cycleYmd = safeParseYmd(sub.next_billing_date);
    if (sub.type === 'customer' && cycleYmd) {
      const effectivePeriodStart = safeParseYmd(sub.current_period_start) ?? cycleYmd;
      const invResolution = await resolveCrmRenewalPreviousInvoice(pool, {
        subscriptionId: sub.id,
        cyclePeriodStartYmd: cycleYmd,
        subscriptionCurrentPeriodStart: effectivePeriodStart,
        billingInterval: (sub.billing_interval || 'monthly') as BillingInterval,
        subscriptionMetadata: metaR.rows[0]?.metadata,
        subscriptionAmountCents: sub.amount_cents,
      });
      if (invResolution.ok) {
        base.invoice.template_resolvable = true;
        base.invoice.resolved_via = invResolution.resolved_via;
        base.invoice.lookup_attempts = [invResolution.lookup_period_start];
      } else {
        base.invoice.reason = invResolution.reason;
        base.invoice.lookup_attempts = invResolution.lookup_attempts;
      }
    }

    const jobDesc = await describeRenewalEnqueueForSubscriptionId(subscriptionId);
    base.job = jobDesc;
    base.timeline.enqueue_block_reason = jobDesc.block_reason;
    base.timeline.can_attempt_insert = jobDesc.can_attempt_insert;

    const failures: string[] = [];
    if (sub.status !== 'active') failures.push(`status_${sub.status}`);
    if (sub.type !== 'customer') failures.push(`type_${sub.type}`);
    if (!customerProbe.ok) failures.push('customer_unresolvable');
    if (!base.invoice.template_resolvable && sub.type === 'customer') {
      failures.push(base.invoice.reason ?? 'invoice_template_missing');
    }
    if (jobDesc.block_reason) failures.push(`enqueue_${jobDesc.block_reason}`);

    base.ready_to_bill =
      failures.length === 0 ||
      (failures.length === 1 && failures[0]?.startsWith('enqueue_') && jobDesc.can_attempt_insert);

    if (!base.ready_to_bill && failures.length > 0) {
      base.failure_reason = failures.join('; ');
    }

    return base;
  });
}

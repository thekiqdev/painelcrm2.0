/**
 * Diagnóstico unificado de renovação CRM (B0.1).
 */
import { pool, withBillingWorkerRlsBypass } from '../utils/db.js';
import { getSubscriptionById } from './billingSubscriptionService.js';
import { safeParseYmd, safeTodayYmd } from '../utils/billingSafeDate.js';
import { probeSubscriptionCustomerId } from './renewalCustomerResolution.js';
import { parseCrmContractMetadata } from './crmContractMetadata.js';
import { BillingExecutionContextError } from '../billingExecutionContext/errors.js';
import { resolvePlanAndItems } from '../billingExecutionContext/planItemResolver.js';
import { describeRenewalEnqueueForSubscriptionId, type TryEnqueueRenewalReason } from './recurringBillingJobService.js';

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
    /** @deprecated Sprint 3.2 — use billing_plan */
    template_resolvable: boolean;
    resolved_via: string | null;
    lookup_attempts: string[];
    reason: string | null;
  };
  billing_plan: {
    present: boolean;
    item_count: number;
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
  cycle_invoice: {
    cycle_ymd: string | null;
    exists: boolean;
    invoice_id: string | null;
  };
  health?: {
    gateway_configured: boolean | null;
    last_job: {
      id: string | null;
      status: string | null;
      retry_at: string | null;
      error_message: string | null;
      updated_at: string | null;
    } | null;
    last_audit: {
      action: string | null;
      success: boolean | null;
      created_at: string | null;
      correlation_id: string | null;
    } | null;
  };
  /** V2 Fase 1B — visão completa do motor */
  motor?: {
    worker: { last_heartbeat_at: string | null; status: string | null } | null;
    scheduler: { last_enqueue_at: string | null; pending_jobs: number } | null;
    notification: {
      last_event: string | null;
      last_invoice_id: string | null;
      last_at: string | null;
    } | null;
    gateway: { configured: boolean; last_status: string | null; last_invoice_id: string | null } | null;
    validation: { ready: boolean; blockers: string[] };
    health: RenewalDiagnosis['health'];
    retry: { next_retry_at: string | null; job_status: string | null } | null;
    last_execution: {
      mode: string | null;
      at: string | null;
      success: boolean | null;
      correlation_id: string | null;
    } | null;
    last_error: { message: string | null; at: string | null; job_id: string | null } | null;
    template_resolution: RenewalDiagnosis['invoice'];
    timeline: RenewalDiagnosis['timeline'];
    history: { last_record_at: string | null; last_result: string | null } | null;
  };
};

const ENQUEUE_WINDOW_ONLY_REASONS = new Set<TryEnqueueRenewalReason>([
  'next_billing_after_db_today',
  'future_local_date',
  'too_early_local_time',
  'outside_local_window',
]);

export function isEnqueueWindowOnlyBlock(reason: TryEnqueueRenewalReason | null | undefined): boolean {
  return reason != null && ENQUEUE_WINDOW_ONLY_REASONS.has(reason);
}

export type ManualRenewalReadiness = {
  ready: boolean;
  blockers: string[];
  diagnosis: RenewalDiagnosis;
};

/** Prontidão para "Gerar próxima cobrança agora" — ignora bloqueios só de janela horária. */
export function assessManualGenerateReadiness(diagnosis: RenewalDiagnosis): ManualRenewalReadiness {
  const blockers: string[] = [];
  if (!diagnosis.validation.subscription_found) blockers.push('subscription_not_found');
  if (diagnosis.validation.status !== 'active') blockers.push(`status_${diagnosis.validation.status ?? 'unknown'}`);
  if (diagnosis.validation.type !== 'customer') blockers.push(`type_${diagnosis.validation.type ?? 'unknown'}`);
  if (!diagnosis.customer.resolvable) blockers.push('customer_unresolvable');
  if (!diagnosis.billing_plan.present) {
    blockers.push(diagnosis.billing_plan.reason ?? 'billing_plan_missing');
  }
  const br = diagnosis.job?.block_reason ?? diagnosis.timeline.enqueue_block_reason;
  if (br && !isEnqueueWindowOnlyBlock(br as TryEnqueueRenewalReason)) {
    if (br !== 'active_job_exists' && br !== 'completed_cycle_guard') {
      blockers.push(`enqueue_${br}`);
    }
  }
  return {
    ready: blockers.length === 0,
    blockers,
    diagnosis,
  };
}

/**
 * Prontidão para "Gerar cobrança" manual (Sprint 4.1I).
 * Ignora estado do worker, retries e falhas históricas — só bloqueia se já existe invoice do ciclo.
 */
export function assessManualGenerateUnblocked(diagnosis: RenewalDiagnosis): ManualRenewalReadiness {
  const blockers: string[] = [];
  if (!diagnosis.validation.subscription_found) blockers.push('subscription_not_found');
  if (diagnosis.validation.status !== 'active') blockers.push(`status_${diagnosis.validation.status ?? 'unknown'}`);
  if (diagnosis.validation.type !== 'customer') blockers.push(`type_${diagnosis.validation.type ?? 'unknown'}`);
  if (diagnosis.cycle_invoice?.exists) blockers.push('invoice_already_exists');
  return {
    ready: blockers.length === 0,
    blockers,
    diagnosis,
  };
}

export async function diagnoseRenewalForTenant(
  tenantId: string,
  subscriptionId: string
): Promise<RenewalDiagnosis> {
  const d = await diagnoseRenewal(subscriptionId);
  if (d.validation.tenant_id && d.validation.tenant_id !== tenantId) {
    return {
      ...d,
      ready_to_bill: false,
      failure_reason: 'tenant_mismatch',
      validation: { ...d.validation, subscription_found: false },
    };
  }
  return d;
}

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
      billing_plan: {
        present: false,
        item_count: 0,
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
      cycle_invoice: {
        cycle_ymd: null,
        exists: false,
        invoice_id: null,
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
    if (cycleYmd) {
      const invR = await pool.query<{ id: string }>(
        `SELECT ci.id::text
         FROM customer_invoices ci
         WHERE ci.tenant_id = $1::uuid
           AND ci.subscription_id = $2::uuid
           AND ci.period_start::date = $3::date
           AND ci.status NOT IN ('cancelled', 'refunded')
         ORDER BY ci.created_at DESC
         LIMIT 1`,
        [sub.tenant_id, subscriptionId, cycleYmd]
      );
      const invId = invR.rows[0]?.id ?? null;
      base.cycle_invoice = {
        cycle_ymd: cycleYmd,
        exists: Boolean(invId),
        invoice_id: invId,
      };
    }
    if (sub.type === 'customer' && cycleYmd) {
      const periodStart = safeParseYmd(sub.current_period_start) ?? cycleYmd;
      try {
        const planRes = await resolvePlanAndItems({
          subscription: sub,
          periodStartYmd: periodStart,
        });
        base.billing_plan = {
          present: true,
          item_count: planRes.billingItems.length,
          reason: null,
        };
        base.invoice.template_resolvable = true;
        base.invoice.resolved_via = 'persisted_plan';
      } catch (err) {
        const code =
          err instanceof BillingExecutionContextError ? err.code : 'BILLING_PLAN_RESOLUTION_FAILED';
        base.billing_plan = {
          present: false,
          item_count: 0,
          reason: code,
        };
        base.invoice.reason = code;
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
    if (!base.billing_plan.present && sub.type === 'customer') {
      failures.push(base.billing_plan.reason ?? 'billing_plan_missing');
    }
    if (jobDesc.block_reason) failures.push(`enqueue_${jobDesc.block_reason}`);

    base.ready_to_bill =
      failures.length === 0 ||
      (failures.length === 1 && failures[0]?.startsWith('enqueue_') && jobDesc.can_attempt_insert);

    if (!base.ready_to_bill && failures.length > 0) {
      base.failure_reason = failures.join('; ');
    }

    const lastJobR = await pool.query<{
      id: string;
      status: string;
      retry_at: string | null;
      error_message: string | null;
      updated_at: string;
    }>(
      `SELECT id::text, status, retry_at::text, error_message, updated_at::text
       FROM billing_recurring_jobs
       WHERE subscription_id = $1::uuid
       ORDER BY updated_at DESC LIMIT 1`,
      [subscriptionId]
    );
    const lastJob = lastJobR.rows[0];
    type RenewalHealthAudit = NonNullable<NonNullable<RenewalDiagnosis['health']>['last_audit']>;
    let lastAudit: RenewalHealthAudit | null = null;
    try {
      const auditR = await pool.query<{
        action: string;
        success: boolean;
        created_at: string;
        correlation_id: string | null;
      }>(
        `SELECT detail->>'execution_mode' AS action,
                (detail->>'success')::boolean AS success,
                created_at::text,
                detail->>'correlation_id' AS correlation_id
         FROM billing_recovery_audit
         WHERE detail->>'subscription_id' = $1
         ORDER BY created_at DESC LIMIT 1`,
        [subscriptionId]
      );
      lastAudit = auditR.rows[0] ?? null;
    } catch {
      /* tabela opcional em alguns ambientes */
    }

    base.health = {
      gateway_configured: sub.gateway != null && String(sub.gateway).trim() !== '',
      last_job: lastJob
        ? {
            id: lastJob.id,
            status: lastJob.status,
            retry_at: lastJob.retry_at,
            error_message: lastJob.error_message,
            updated_at: lastJob.updated_at,
          }
        : null,
      last_audit: lastAudit,
    };

    const pendingJobsR = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM billing_recurring_jobs
       WHERE subscription_id = $1::uuid AND status = 'pending'`,
      [subscriptionId]
    );
    const lastInvR = await pool.query<{
      id: string;
      gateway_status: string | null;
      created_at: string;
    }>(
      `SELECT id::text, gateway_status, created_at::text
       FROM customer_invoices WHERE subscription_id = $1::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [subscriptionId]
    );
    const lastInv = lastInvR.rows[0];
    const readiness = assessManualGenerateReadiness(base);

    base.motor = {
      worker: {
        last_heartbeat_at: lastJob?.updated_at ?? null,
        status: lastJob?.status ?? null,
      },
      scheduler: {
        last_enqueue_at: lastJob?.updated_at ?? null,
        pending_jobs: parseInt(pendingJobsR.rows[0]?.c ?? '0', 10),
      },
      notification: {
        last_event: lastAudit?.action ?? null,
        last_invoice_id: lastInv?.id ?? null,
        last_at: lastInv?.created_at ?? null,
      },
      gateway: {
        configured: base.health.gateway_configured === true,
        last_status: lastInv?.gateway_status ?? null,
        last_invoice_id: lastInv?.id ?? null,
      },
      validation: { ready: readiness.ready, blockers: readiness.blockers },
      health: base.health,
      retry: {
        next_retry_at: lastJob?.retry_at ?? null,
        job_status: lastJob?.status ?? null,
      },
      last_execution: lastAudit
        ? {
            mode: lastAudit.action,
            at: lastAudit.created_at,
            success: lastAudit.success,
            correlation_id: lastAudit.correlation_id,
          }
        : null,
      last_error: lastJob?.error_message
        ? {
            message: lastJob.error_message,
            at: lastJob.updated_at,
            job_id: lastJob.id,
          }
        : null,
      template_resolution: base.invoice,
      timeline: base.timeline,
      history: lastAudit
        ? {
            last_record_at: lastAudit.created_at,
            last_result: lastAudit.success ? 'success' : 'failure',
          }
        : null,
    };

    return base;
  });
}

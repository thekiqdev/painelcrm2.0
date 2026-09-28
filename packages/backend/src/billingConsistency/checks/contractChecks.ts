/**
 * Billing Engine V2 — Sprint 2.3B: consistência Subscription × Billing Plan.
 */
import type { BillingPlanRow } from '../../billingPlan/types.js';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import type { ConsistencyCheckResult } from '../types.js';

function check(
  code: string,
  passed: boolean,
  severity: ConsistencyCheckResult['severity'],
  message: string,
  extra?: Partial<ConsistencyCheckResult>
): ConsistencyCheckResult {
  return { code, phase: 'contract', passed, severity, message, ...extra };
}

export function validateContractConsistency(
  subscription: SubscriptionRow,
  plan: BillingPlanRow | null
): ConsistencyCheckResult[] {
  const results: ConsistencyCheckResult[] = [];

  results.push(
    check(
      'subscription_tenant',
      Boolean(subscription.tenant_id),
      'CRITICAL',
      'tenant_id da assinatura presente',
      { field: 'tenant_id', actual: subscription.tenant_id }
    )
  );

  if (!plan) {
    results.push(
      check('contract_plan_missing', false, 'WARNING', 'Sem plano para comparar contrato')
    );
    return results;
  }

  results.push(
    check(
      'contract_subscription_id',
      plan.subscription_id === subscription.id,
      'CRITICAL',
      'subscription_id do plano coincide',
      { field: 'subscription_id', expected: subscription.id, actual: plan.subscription_id }
    ),
    check(
      'contract_tenant_id',
      plan.tenant_id === subscription.tenant_id,
      'CRITICAL',
      'tenant_id coincide',
      { field: 'tenant_id', expected: subscription.tenant_id, actual: plan.tenant_id }
    ),
    check(
      'contract_interval',
      plan.billing_interval === subscription.billing_interval,
      plan.billing_interval === subscription.billing_interval ? 'INFO' : 'WARNING',
      'billing_interval alinhado',
      { field: 'billing_interval', expected: subscription.billing_interval, actual: plan.billing_interval }
    ),
    check(
      'contract_currency',
      plan.currency === subscription.currency,
      plan.currency === subscription.currency ? 'INFO' : 'WARNING',
      'currency alinhada',
      { field: 'currency', expected: subscription.currency, actual: plan.currency }
    ),
    check(
      'contract_anchor',
      plan.billing_anchor == null ||
        subscription.billing_anchor_day == null ||
        plan.billing_anchor === subscription.billing_anchor_day,
      'WARNING',
      'billing_anchor alinhado',
      {
        field: 'billing_anchor',
        expected: subscription.billing_anchor_day,
        actual: plan.billing_anchor,
      }
    ),
    check(
      'contract_frequency',
      plan.billing_frequency >= 1,
      'INFO',
      'billing_frequency do plano válida',
      { field: 'billing_frequency', actual: plan.billing_frequency }
    ),
    check(
      'contract_trial',
      (plan.trial_until == null && !subscription.current_period_end) ||
        plan.trial_until === subscription.current_period_end?.slice(0, 10) ||
        plan.trial_until == null,
      'INFO',
      'trial_until modelado (sem correção automática)',
      { field: 'trial_until', actual: plan.trial_until }
    ),
    check(
      'contract_status_model',
      Boolean(subscription.status),
      'INFO',
      'status da assinatura presente',
      { field: 'status', actual: subscription.status }
    )
  );

  return results;
}

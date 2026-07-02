import { billingPlanRepository } from '../../billingPlan/billingPlanRepository.js';
import { billingPlanItemRepository } from '../../billingPlanItems/repository.js';
import type { SubscriptionRow } from '../../services/billingSubscriptionService.js';
import { logBillingProvision } from './billingPlanProvisionLogger.js';
import { recordBillingPlanValidationError } from './billingPlanProvisionMetrics.js';
import type { BillingProvisionStatus } from './types.js';
import { BillingPlanProvisionError } from './types.js';

function resolvePeriodStart(subscription: SubscriptionRow): string {
  return (
    subscription.current_period_start?.slice(0, 10) ??
    subscription.next_billing_date?.slice(0, 10) ??
    new Date().toISOString().slice(0, 10)
  );
}

export async function validateBillingPlanForSubscription(
  subscription: SubscriptionRow,
  options: { periodStartYmd?: string } = {}
): Promise<BillingProvisionStatus> {
  const periodStartYmd = options.periodStartYmd ?? resolvePeriodStart(subscription);
  const issues: string[] = [];

  const plan = await billingPlanRepository.findActiveBySubscription(
    subscription.id,
    subscription.tenant_id
  );

  if (!plan) {
    issues.push('billing_plan_missing');
    recordBillingPlanValidationError();
    logBillingProvision('VALIDATE', 'failed', {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      issues,
    });
    return {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      has_billing_plan: false,
      billing_plan_id: null,
      billing_plan_status: null,
      item_count: 0,
      plan_revision: null,
      valid: false,
      issues,
    };
  }

  if (plan.tenant_id !== subscription.tenant_id) {
    issues.push('tenant_mismatch');
  }
  if (plan.status !== 'active') {
    issues.push('billing_plan_not_active');
  }

  const items = await billingPlanItemRepository.findEffective(
    plan.id,
    subscription.tenant_id,
    periodStartYmd
  );

  if (items.length === 0) {
    issues.push('billing_plan_items_missing');
  }

  const valid = issues.length === 0;
  if (!valid) {
    recordBillingPlanValidationError();
    logBillingProvision('VALIDATE', 'failed', {
      subscription_id: subscription.id,
      tenant_id: subscription.tenant_id,
      billing_plan_id: plan.id,
      issues,
    });
  } else {
    logBillingProvision('VALIDATE', 'ok', {
      subscription_id: subscription.id,
      billing_plan_id: plan.id,
      item_count: items.length,
    });
  }

  return {
    subscription_id: subscription.id,
    tenant_id: subscription.tenant_id,
    has_billing_plan: true,
    billing_plan_id: plan.id,
    billing_plan_status: plan.status,
    item_count: items.length,
    plan_revision: plan.plan_revision,
    valid,
    issues,
  };
}

export async function assertBillingPlanValid(
  subscription: SubscriptionRow,
  options: { periodStartYmd?: string } = {}
): Promise<BillingProvisionStatus> {
  const status = await validateBillingPlanForSubscription(subscription, options);
  if (!status.valid) {
    throw new BillingPlanProvisionError(
      `Billing Plan inválido: ${status.issues.join(', ')}`,
      'VALIDATION_FAILED',
      { issues: status.issues }
    );
  }
  return status;
}

/**
 * Billing Engine V2 — Sprint 2.3B: integridade Plan × Items.
 */
import type { BillingPlanItemRow } from '../../billingPlanItems/types.js';
import type { BillingPlanRow } from '../../billingPlan/types.js';
import type { ConsistencyCheckResult } from '../types.js';

function check(
  code: string,
  passed: boolean,
  severity: ConsistencyCheckResult['severity'],
  message: string,
  extra?: Partial<ConsistencyCheckResult>
): ConsistencyCheckResult {
  return { code, phase: 'integration', passed, severity, message, ...extra };
}

export function validatePlanItemIntegration(
  plan: BillingPlanRow | null,
  items: BillingPlanItemRow[]
): ConsistencyCheckResult[] {
  if (!plan) {
    return [check('integration_plan_required', false, 'WARNING', 'Sem plano para validar integração')];
  }

  const results: ConsistencyCheckResult[] = [];

  for (const item of items) {
    results.push(
      check(
        `item_${item.id}_belongs_to_plan`,
        item.billing_plan_id === plan.id,
        'CRITICAL',
        'Item pertence ao plano',
        { field: 'billing_plan_id', expected: plan.id, actual: item.billing_plan_id }
      ),
      check(
        `item_${item.id}_tenant_match`,
        item.tenant_id === plan.tenant_id,
        'CRITICAL',
        'tenant_id consistente',
        { field: 'tenant_id', expected: plan.tenant_id, actual: item.tenant_id }
      ),
      check(
        `item_${item.id}_revision_valid`,
        item.item_revision >= 1,
        'ERROR',
        'item_revision válida',
        { field: 'item_revision', actual: item.item_revision }
      )
    );
  }

  results.push(
    check(
      'strategy_compatible',
      plan.billing_strategy === 'billing_plan_items' || plan.billing_strategy === 'mixed',
      'WARNING',
      'billing_strategy reconhecida para items',
      { field: 'billing_strategy', actual: plan.billing_strategy }
    ),
    check(
      'engine_version_compatible',
      plan.engine_version === 'v1' || plan.engine_version === 'v2',
      'WARNING',
      'engine_version compatível',
      { field: 'engine_version', actual: plan.engine_version }
    ),
    check(
      'plan_version_positive_integration',
      plan.version >= 1,
      'INFO',
      'version do plano válida na integração',
      { field: 'version', actual: plan.version }
    )
  );

  return results;
}

/**
 * Billing Engine V2 — Sprint 2.3B: validações do Billing Plan.
 */
import type { BillingPlanRow } from '../../billingPlan/types.js';
import type { ConsistencyCheckResult } from '../types.js';

const VALID_STATUS = new Set(['draft', 'active', 'archived', 'cancelled']);
const VALID_STRATEGY = new Set(['billing_plan_items', 'mixed', 'future']);
const VALID_ENGINE = new Set(['v1', 'v2', 'future']);

function check(
  code: string,
  passed: boolean,
  severity: ConsistencyCheckResult['severity'],
  message: string,
  extra?: Partial<ConsistencyCheckResult>
): ConsistencyCheckResult {
  return { code, phase: 'plan', passed, severity, message, ...extra };
}

export function validateBillingPlan(
  plans: BillingPlanRow[],
  activePlan: BillingPlanRow | null
): ConsistencyCheckResult[] {
  const results: ConsistencyCheckResult[] = [];

  results.push(
    check(
      'plan_exists',
      plans.length > 0,
      plans.length > 0 ? 'INFO' : 'WARNING',
      plans.length > 0 ? 'Plano encontrado' : 'Nenhum billing plan persistido'
    )
  );

  const activePlans = plans.filter((p) => p.status === 'active');
  results.push(
    check(
      'single_active_plan',
      activePlans.length <= 1,
      activePlans.length > 1 ? 'CRITICAL' : 'INFO',
      activePlans.length <= 1
        ? 'No máximo um plano ativo'
        : `Múltiplos planos ativos: ${activePlans.length}`,
      { actual: activePlans.length }
    )
  );

  if (!activePlan) {
    return results;
  }

  results.push(
    check('plan_status_valid', VALID_STATUS.has(activePlan.status), 'ERROR', 'Status do plano válido', {
      field: 'status',
      actual: activePlan.status,
    }),
    check('plan_version_positive', activePlan.version >= 1, 'ERROR', 'Version >= 1', {
      field: 'version',
      actual: activePlan.version,
    }),
    check('plan_revision_positive', activePlan.plan_revision >= 1, 'ERROR', 'Revision >= 1', {
      field: 'plan_revision',
      actual: activePlan.plan_revision,
    }),
    check(
      'plan_number_present',
      Boolean(activePlan.plan_number?.trim()),
      'ERROR',
      'plan_number obrigatório',
      { field: 'plan_number', actual: activePlan.plan_number }
    ),
    check(
      'billing_strategy_valid',
      VALID_STRATEGY.has(activePlan.billing_strategy),
      'ERROR',
      'billing_strategy válida',
      { field: 'billing_strategy', actual: activePlan.billing_strategy }
    ),
    check(
      'engine_version_valid',
      VALID_ENGINE.has(activePlan.engine_version),
      'ERROR',
      'engine_version válida',
      { field: 'engine_version', actual: activePlan.engine_version }
    ),
    check(
      'metadata_object',
      activePlan.metadata != null && typeof activePlan.metadata === 'object' && !Array.isArray(activePlan.metadata),
      'WARNING',
      'metadata deve ser objeto',
      { field: 'metadata' }
    ),
    check(
      'effective_starts_at',
      Boolean(activePlan.starts_at?.trim()),
      'ERROR',
      'starts_at obrigatório',
      { field: 'starts_at', actual: activePlan.starts_at }
    ),
    check(
      'effective_ends_after_starts',
      !activePlan.ends_at || activePlan.ends_at >= activePlan.starts_at,
      'WARNING',
      'ends_at >= starts_at',
      { field: 'ends_at', expected: '>= starts_at', actual: activePlan.ends_at }
    )
  );

  const dupNumbers = plans.filter((p) => p.plan_number === activePlan.plan_number);
  results.push(
    check(
      'plan_number_unique_in_set',
      dupNumbers.length === 1,
      dupNumbers.length > 1 ? 'CRITICAL' : 'INFO',
      'plan_number único no conjunto carregado',
      { field: 'plan_number', actual: dupNumbers.length }
    )
  );

  return results;
}

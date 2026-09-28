/**
 * Billing Engine V2 — Sprint 2.3B/2.3C: validação via BillingExecutionContext.
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { billingExecutionContextBuilder } from '../billingExecutionContext/billingExecutionContextBuilder.js';
import { billingConfidenceCalculator } from './billingConfidenceCalculator.js';
import { validateBillingPlan } from './checks/planChecks.js';
import { validateBillingItems } from './checks/itemChecks.js';
import { validatePlanItemIntegration } from './checks/integrationChecks.js';
import { validateContractConsistency } from './checks/contractChecks.js';
import { validateSnapshotConsistency } from './checks/snapshotChecks.js';
import {
  logBillingConfidence,
  logBillingConsistency,
  logBillingPlanCheck,
  logBillingValidator,
} from './consistencyLogger.js';
import type {
  BillingConsistencyResult,
  BillingConsistencyValidateInput,
  ConsistencyCheckResult,
} from './types.js';

function partitionChecks(checks: ConsistencyCheckResult[]): {
  warnings: ConsistencyCheckResult[];
  errors: ConsistencyCheckResult[];
} {
  const warnings = checks.filter((c) => !c.passed && (c.severity === 'WARNING' || c.severity === 'INFO'));
  const errors = checks.filter((c) => !c.passed && (c.severity === 'ERROR' || c.severity === 'CRITICAL'));
  return { warnings, errors };
}

export class BillingConsistencyValidator {
  validateFromContext(
    context: BillingExecutionContext,
    startedAt: number = Date.now()
  ): BillingConsistencyResult {
    const logCtx = {
      correlation_id: context.metadata.correlation_id ?? undefined,
      subscription_id: context.subscription.id,
    };

    logBillingValidator('start', logCtx);
    logBillingPlanCheck('loaded', { ...logCtx, plan_id: context.billingPlan.id });

    const activePlan = context.metadata.has_persisted_plan ? context.billingPlan : null;
    const currentItems = context.billingItems;

    const checks: ConsistencyCheckResult[] = [
      ...validateBillingPlan(context.billingPlans, activePlan),
      ...validateBillingItems(currentItems),
      ...validatePlanItemIntegration(activePlan, currentItems),
      ...validateContractConsistency(context.subscription, activePlan),
      ...validateSnapshotConsistency(currentItems, undefined),
    ];

    const { confidence, score, severity } = billingConfidenceCalculator.compute(checks);
    const { warnings, errors } = partitionChecks(checks);
    const approved = billingConfidenceCalculator.isApproved({ confidence, severity, errors });
    const valid = approved && errors.length === 0;

    const result: BillingConsistencyResult = {
      valid,
      confidence,
      severity,
      score,
      approved,
      checks,
      warnings,
      errors,
      metadata: {
        subscription_id: context.subscription.id,
        tenant_id: context.subscription.tenant_id,
        plan_id: activePlan?.id ?? null,
        plan_number: activePlan?.plan_number ?? null,
        item_count: currentItems.length,
        execution_ms: Date.now() - startedAt,
        correlation_id: context.metadata.correlation_id ?? undefined,
        has_persisted_plan: context.metadata.has_persisted_plan,
      },
    };

    logBillingConfidence('computed', {
      ...logCtx,
      plan_id: activePlan?.id ?? null,
      confidence,
      score,
      severity,
      duration_ms: result.metadata.execution_ms,
    });

    logBillingConsistency(valid ? 'passed' : 'issues', {
      ...logCtx,
      plan_id: activePlan?.id ?? null,
      confidence,
      score,
      severity,
      duration_ms: result.metadata.execution_ms,
    }, { warning_count: warnings.length, error_count: errors.length });

    return result;
  }

  async validate(input: BillingConsistencyValidateInput): Promise<BillingConsistencyResult> {
    const started = Date.now();

    if (input.executionContext) {
      return this.validateFromContext(input.executionContext, started);
    }

    const cycleKey =
      input.cycleKey ??
      input.periodStartYmd ??
      new Date().toISOString().slice(0, 10);
    const periodStartYmd = input.periodStartYmd ?? cycleKey;

    const context = await billingExecutionContextBuilder.build({
      subscriptionId: input.subscriptionId,
      tenantId: input.tenantId,
      cycleKey,
      periodStartYmd,
      correlationId: input.correlationId,
    });

    return this.validateFromContext(context, started);
  }
}

export const billingConsistencyValidator = new BillingConsistencyValidator();

/**
 * Billing Engine 3.0 — validação de contexto de produção.
 */
import type { BillingExecutionContext } from '../billingExecutionContext/types.js';
import { isDeprecatedBillingStrategy } from '../billingPlan/deprecatedBillingStrategies.js';
import { BillingEngineError } from './types.js';

export function assertProductionBillingContext(context: BillingExecutionContext): void {
  if (!context.metadata.context_certified) {
    throw new BillingEngineError(
      'BillingEngine exige contexto certificado (Sprint 3.0B)',
      'CONTEXT_NOT_CERTIFIED'
    );
  }

  if (!context.metadata.has_persisted_plan) {
    throw new BillingEngineError(
      'BillingEngine exige Billing Plan persistido',
      'BILLING_PLAN_REQUIRED'
    );
  }

  if (!context.billingPlan?.id) {
    throw new BillingEngineError('Billing Plan ausente no contexto', 'BILLING_PLAN_REQUIRED');
  }

  if (context.billingItems.length === 0) {
    throw new BillingEngineError(
      'Nenhum Billing Plan Item no contexto',
      'BILLING_ITEMS_REQUIRED'
    );
  }

  if (context.resolvedItems.length === 0) {
    throw new BillingEngineError(
      'Nenhum item elegível resolvido a partir do Billing Plan',
      'NO_ELIGIBLE_ITEMS'
    );
  }

  if (!context.diagnostics.context_pure) {
    throw new BillingEngineError(
      'BillingEngine rejeita contexto com dependências legadas detectadas',
      'LEGACY_DEPENDENCIES_DETECTED'
    );
  }

  const strategy = context.billingPlan.billing_strategy;
  if (isDeprecatedBillingStrategy(strategy)) {
    throw new BillingEngineError(
      'BillingEngine requer billing_strategy billing_plan_items ou mixed',
      'LEGACY_STRATEGY_FORBIDDEN'
    );
  }
}

export function collectProductionWarnings(context: BillingExecutionContext): string[] {
  const warnings: string[] = [...context.diagnostics.warnings];
  if (!context.diagnostics.context_certified) {
    warnings.push('context_not_certified');
  }
  if (context.diagnostics.legacy_dependencies_detected.length > 0) {
    warnings.push('legacy_dependencies_detected');
  }
  return warnings;
}

/**
 * Billing Engine 3.0 — certificação de proveniência do contexto de execução.
 */
import type { BillingPlanRow } from '../billingPlan/types.js';
import {
  DEPRECATED_METADATA_MARKERS,
  isDeprecatedBillingStrategy,
} from '../billingPlan/deprecatedBillingStrategies.js';
import type { BillingPlanItemRow } from '../billingPlanItems/types.js';
import { BillingExecutionContextError, CONTEXT_ERROR_CODES } from './errors.js';

const VIRTUAL_ITEM_ID_PREFIX = 'ctx-item-';

export type ContextCertification = {
  context_certified: boolean;
  context_pure: boolean;
  legacy_dependencies_detected: string[];
};

export function detectLegacyItemMarkers(item: BillingPlanItemRow): string[] {
  const markers: string[] = [];

  if (item.id.startsWith(VIRTUAL_ITEM_ID_PREFIX)) {
    markers.push(`virtual_item_id:${item.id}`);
  }

  if (item.metadata?.context_virtual === true) {
    markers.push(`item_metadata.context_virtual:seq_${item.sequence}`);
  }

  for (const key of DEPRECATED_METADATA_MARKERS) {
    if (item.metadata?.[key] != null) {
      markers.push(`item_metadata.${key}:seq_${item.sequence}`);
    }
  }

  return markers;
}

export function detectLegacyPlanMarkers(plan: BillingPlanRow): string[] {
  const markers: string[] = [];

  if (isDeprecatedBillingStrategy(plan.billing_strategy)) {
    markers.push(`plan.billing_strategy:${plan.billing_strategy}`);
  }

  if (plan.metadata?.context_virtual === true) {
    markers.push('plan.metadata.context_virtual');
  }

  for (const key of DEPRECATED_METADATA_MARKERS) {
    if (plan.metadata?.[key] != null) {
      markers.push(`plan.metadata.${key}`);
    }
  }

  if (plan.id.startsWith('virtual-plan-')) {
    markers.push(`virtual_plan_id:${plan.id}`);
  }

  return markers;
}

export function certifyPlanAndItems(
  plan: BillingPlanRow,
  items: BillingPlanItemRow[]
): ContextCertification {
  const legacy_dependencies_detected = [
    ...detectLegacyPlanMarkers(plan),
    ...items.flatMap(detectLegacyItemMarkers),
  ];

  const context_pure = legacy_dependencies_detected.length === 0;
  const context_certified =
    context_pure &&
    !isDeprecatedBillingStrategy(plan.billing_strategy) &&
    items.length > 0;

  return {
    context_certified,
    context_pure,
    legacy_dependencies_detected,
  };
}

export function assertContextIndependence(
  plan: BillingPlanRow,
  items: BillingPlanItemRow[]
): ContextCertification {
  if (isDeprecatedBillingStrategy(plan.billing_strategy)) {
    throw new BillingExecutionContextError(
      'Billing Plan com estratégia legada de cópia de fatura não é permitido',
      CONTEXT_ERROR_CODES.LEGACY_PLAN_STRATEGY
    );
  }

  const certification = certifyPlanAndItems(plan, items);

  if (!certification.context_pure) {
    throw new BillingExecutionContextError(
      `Marcadores legados detectados: ${certification.legacy_dependencies_detected.join(', ')}`,
      CONTEXT_ERROR_CODES.LEGACY_ITEM_DETECTED
    );
  }

  return certification;
}

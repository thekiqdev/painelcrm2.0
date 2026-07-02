/**
 * Billing Engine V2 — score e severidade da comparação Shadow.
 */
import type { RenewalComparisonDifference, ShadowComparisonSeverity } from './types.js';

const SEVERITY_WEIGHT: Record<ShadowComparisonSeverity, number> = {
  INFO: 1,
  WARNING: 5,
  ERROR: 25,
  CRITICAL: 50,
};

export function computeComparisonScore(differences: RenewalComparisonDifference[]): number {
  if (differences.length === 0) return 100;
  const penalty = differences.reduce((sum, d) => sum + SEVERITY_WEIGHT[d.severity], 0);
  return Math.max(0, 100 - penalty);
}

export function resolveOverallSeverity(
  differences: RenewalComparisonDifference[]
): ShadowComparisonSeverity {
  if (differences.some((d) => d.severity === 'CRITICAL')) return 'CRITICAL';
  if (differences.some((d) => d.severity === 'ERROR')) return 'ERROR';
  if (differences.some((d) => d.severity === 'WARNING')) return 'WARNING';
  if (differences.length > 0) return 'INFO';
  return 'INFO';
}

export function isComparisonApproved(
  score: number,
  differences: RenewalComparisonDifference[]
): boolean {
  if (score !== 100) return false;
  return !differences.some((d) => d.severity === 'ERROR' || d.severity === 'CRITICAL');
}

export function classifyFieldSeverity(
  field: string,
  legacyValue: unknown,
  shadowValue: unknown
): ShadowComparisonSeverity {
  const moneyFields = ['subtotal', 'discounts', 'taxes', 'total', 'amount'];
  const criticalFields = ['subscription.id', 'subscription.tenant', 'currency', 'total'];
  const errorFields = ['itemCount', 'dueDate', 'periodStart', 'periodEnd'];

  if (criticalFields.some((f) => field === f || field.endsWith(`.${f}`))) {
    return 'CRITICAL';
  }
  if (moneyFields.some((f) => field.includes(f))) {
    return 'ERROR';
  }
  if (errorFields.some((f) => field.includes(f))) {
    return 'ERROR';
  }
  if (field.startsWith('items[')) {
    const itemCritical = ['quantity', 'unit_price', 'total'];
    if (itemCritical.some((k) => field.includes(k))) return 'ERROR';
    return 'WARNING';
  }
  if (legacyValue == null && shadowValue == null) return 'INFO';
  return 'WARNING';
}

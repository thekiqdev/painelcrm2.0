/**
 * Billing Engine V2 — Sprint 2.3B: confidence score 0–100.
 */
import type { ConsistencyCheckResult, ConsistencySeverity } from './types.js';

export type ConfidencePenaltyConfig = Record<ConsistencySeverity, number>;

export const DEFAULT_CONFIDENCE_PENALTIES: ConfidencePenaltyConfig = {
  INFO: 1,
  WARNING: 5,
  ERROR: 20,
  CRITICAL: 40,
};

export class BillingConfidenceCalculator {
  constructor(private readonly penalties: ConfidencePenaltyConfig = DEFAULT_CONFIDENCE_PENALTIES) {}

  compute(checks: ConsistencyCheckResult[]): { confidence: number; score: number; severity: ConsistencySeverity } {
    const failed = checks.filter((c) => !c.passed);
    if (failed.length === 0) {
      return { confidence: 100, score: 100, severity: 'INFO' };
    }

    const penalty = failed.reduce((sum, c) => sum + this.penalties[c.severity], 0);
    const value = Math.max(0, 100 - penalty);

    let severity: ConsistencySeverity = 'INFO';
    if (failed.some((c) => c.severity === 'CRITICAL')) severity = 'CRITICAL';
    else if (failed.some((c) => c.severity === 'ERROR')) severity = 'ERROR';
    else if (failed.some((c) => c.severity === 'WARNING')) severity = 'WARNING';

    return { confidence: value, score: value, severity };
  }

  isApproved(result: { confidence: number; severity: ConsistencySeverity; errors: ConsistencyCheckResult[] }): boolean {
    if (result.confidence < 100) return false;
    if (result.severity === 'ERROR' || result.severity === 'CRITICAL') return false;
    return result.errors.length === 0;
  }
}

export const billingConfidenceCalculator = new BillingConfidenceCalculator();

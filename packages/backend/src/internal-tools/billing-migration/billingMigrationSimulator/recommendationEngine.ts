/**
 * Billing Engine V2 — Sprint 2.3F: recomendação final da simulação.
 */
import type {
  MigrationImpact,
  MigrationSimulationRecommendation,
} from './types.js';

export function resolveSimulationRecommendation(params: {
  overallScore: number;
  impact: MigrationImpact;
  consistencyApproved: boolean;
  hasSubscriptions: boolean;
}): MigrationSimulationRecommendation {
  if (!params.hasSubscriptions) return 'DO_NOT_MIGRATE';

  if (params.impact.risk === 'CRITICAL' || params.overallScore < 50) {
    return 'DO_NOT_MIGRATE';
  }

  if (!params.consistencyApproved) return 'BLOCKED';

  if (params.impact.risk === 'HIGH' || params.overallScore < 80) {
    return 'REQUIRES_REVIEW';
  }

  if (params.impact.identical && params.overallScore === 100 && params.consistencyApproved) {
    return 'READY_TO_MIGRATE';
  }

  if (
    params.overallScore >= 90 &&
    (params.impact.risk === 'NONE' || params.impact.risk === 'LOW')
  ) {
    return params.impact.differences.some((d) => d.severity === 'WARNING')
      ? 'READY_WITH_WARNINGS'
      : 'READY_TO_MIGRATE';
  }

  if (params.overallScore >= 80) return 'READY_WITH_WARNINGS';

  return 'REQUIRES_REVIEW';
}

/**
 * Billing Engine V2 — Sprint 3.0E: engine de certificação operacional V1 vs V2.
 */
import { randomUUID } from 'node:crypto';
import { compareOperationalSnapshots, aggregateGateScores } from './pipelineComparer.js';
import { logPipelineCertification } from './pipelineCertificationLogger.js';
import { getAllPipelineScenarioPairs } from './pipelineCertificationScenarios.js';
import {
  snapshotFromLegacyCapture,
  snapshotFromV2Capture,
} from './pipelineSnapshotNormalizer.js';
import type {
  BillingProductionCertificationReport,
  LegacyPipelineCapture,
  PipelineCompareResult,
  V2PipelineCapture,
} from './types.js';
import { PIPELINE_CERTIFICATION_VERSION } from './types.js';

const MANDATORY_GATE_MIN = 100;

export function certifyPipelinePair(params: {
  legacy: LegacyPipelineCapture;
  v2: V2PipelineCapture;
}): PipelineCompareResult {
  const legacySnapshot = snapshotFromLegacyCapture(params.legacy);
  const v2Snapshot = snapshotFromV2Capture(params.v2);
  return compareOperationalSnapshots(legacySnapshot, v2Snapshot);
}

export function resolveProductionCertification(params: {
  scenarios: PipelineCompareResult[];
  correlationId?: string;
}): BillingProductionCertificationReport {
  const scores = aggregateGateScores(params.scenarios);
  const blocking_issues: string[] = [];
  const warnings: string[] = [];

  const gateFields: Array<{
    key: keyof Pick<
      BillingProductionCertificationReport,
      | 'invoice_score'
      | 'invoice_items_score'
      | 'gateway_score'
      | 'notification_score'
      | 'timeline_score'
      | 'history_score'
      | 'subscription_score'
      | 'billing_result_score'
      | 'idempotency_score'
      | 'rollback_score'
    >;
    label: string;
  }> = [
    { key: 'invoice_score', label: 'invoice' },
    { key: 'invoice_items_score', label: 'invoice_items' },
    { key: 'gateway_score', label: 'gateway' },
    { key: 'notification_score', label: 'notification' },
    { key: 'timeline_score', label: 'timeline' },
    { key: 'history_score', label: 'history' },
    { key: 'subscription_score', label: 'subscription' },
    { key: 'billing_result_score', label: 'billing_result' },
    { key: 'idempotency_score', label: 'idempotency' },
    { key: 'rollback_score', label: 'rollback' },
  ];

  for (const gate of gateFields) {
    const score = scores[gate.key];
    if (score < MANDATORY_GATE_MIN) {
      blocking_issues.push(`Gate ${gate.label} below 100% (${score}%)`);
    }
  }

  for (const scenario of params.scenarios) {
    if (!scenario.approved) {
      const dims = scenario.gates
        .filter((g) => !g.passed)
        .map((g) => g.dimension)
        .join(', ');
      blocking_issues.push(`Scenario ${scenario.scenario_id} failed gates: ${dims}`);
    }
    if (scenario.differences.some((d) => !d.blocking)) {
      warnings.push(`Scenario ${scenario.scenario_id} has non-blocking diffs`);
    }
  }

  const approved =
    blocking_issues.length === 0 &&
    scores.overall_score === 100 &&
    params.scenarios.every((s) => s.approved);

  const recommendation = approved ? 'APPROVED' : 'NOT_APPROVED';

  logPipelineCertification('PIPELINE_RESULT', recommendation, {
    overall_score: scores.overall_score,
    scenario_count: params.scenarios.length,
    blocking_count: blocking_issues.length,
  });

  return {
    version: PIPELINE_CERTIFICATION_VERSION,
    correlation_id: params.correlationId ?? randomUUID(),
    ...scores,
    approved,
    blocking_issues,
    warnings,
    recommendation,
    scenarios: params.scenarios,
    certified_at: new Date().toISOString(),
  };
}

export class BillingProductionCertificationEngine {
  static runFullCertification(options?: {
    correlationId?: string;
  }): BillingProductionCertificationReport {
    const correlationId = options?.correlationId ?? randomUUID();

    logPipelineCertification('PIPELINE_CERTIFICATION', 'start', {
      correlation_id: correlationId,
      version: PIPELINE_CERTIFICATION_VERSION,
      scenario_count: getAllPipelineScenarioPairs().length,
    });

    const scenarioResults = getAllPipelineScenarioPairs().map((pair) =>
      certifyPipelinePair(pair)
    );

    const report = resolveProductionCertification({
      scenarios: scenarioResults,
      correlationId,
    });

    logPipelineCertification('PIPELINE_CERTIFICATION', 'complete', {
      correlation_id: correlationId,
      approved: report.approved,
      overall_score: report.overall_score,
      recommendation: report.recommendation,
    });

    return report;
  }
}

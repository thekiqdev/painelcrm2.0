/**
 * Billing Engine V2 — Sprint 2.3G: política centralizada de aprovação de cutover.
 */
import type { CutoverBlockingIssue, CutoverPolicyInput, CutoverPolicyResult } from './types.js';
import { logCutoverPolicy } from './cutoverLogger.js';

function issue(
  code: string,
  severity: CutoverBlockingIssue['severity'],
  source: CutoverBlockingIssue['source'],
  message: string,
  detail?: Record<string, unknown>
): CutoverBlockingIssue {
  return { code, severity, source, message, detail };
}

export function evaluateCutoverPolicy(
  input: CutoverPolicyInput,
  logContext?: { tenant_id: string; correlation_id?: string }
): CutoverPolicyResult {
  const blockingIssues: CutoverBlockingIssue[] = [];
  const warnings: CutoverBlockingIssue[] = [];

  const shadowScore = input.shadowScore ?? input.readiness.areaScores.find((a) => a.area === 'shadow')?.score ?? 0;
  const projectionScore =
    input.projectionScore ?? input.readiness.areaScores.find((a) => a.area === 'projection')?.score ?? 0;
  const consistencyApproved =
    input.consistencyApproved ??
    input.readiness.areaScores.find((a) => a.area === 'consistency')?.passed ??
    false;

  if (shadowScore < 100) {
    blockingIssues.push(
      issue('SHADOW_SCORE_NOT_100', shadowScore < 50 ? 'ERROR' : 'WARNING', 'shadow', `Shadow score ${shadowScore}`, {
        shadow_score: shadowScore,
      })
    );
  }

  if (projectionScore < 100) {
    blockingIssues.push(
      issue(
        'PROJECTION_SCORE_NOT_100',
        projectionScore < 50 ? 'ERROR' : 'WARNING',
        'projection',
        `Projection score ${projectionScore}`,
        { projection_score: projectionScore }
      )
    );
  }

  if (!consistencyApproved) {
    blockingIssues.push(
      issue('CONSISTENCY_NOT_APPROVED', 'ERROR', 'consistency', 'Consistency não aprovada')
    );
  }

  if (!input.readiness.readyForMigration) {
    blockingIssues.push(
      issue(
        'READINESS_NOT_READY',
        'ERROR',
        'readiness',
        `Readiness level ${input.readiness.approvalLevel}`,
        { recommendation: input.readiness.migrationRecommendation }
      )
    );
  }

  if (input.simulator.recommended !== 'READY_TO_MIGRATE') {
    const sev =
      input.simulator.recommended === 'DO_NOT_MIGRATE' || input.simulator.recommended === 'BLOCKED'
        ? 'CRITICAL'
        : 'WARNING';
    blockingIssues.push(
      issue(
        'SIMULATOR_NOT_READY',
        sev,
        'simulator',
        `Simulator recommendation ${input.simulator.recommended}`,
        { risk: input.simulator.impact.risk }
      )
    );
  }

  for (const bi of input.readiness.criticalIssues) {
    blockingIssues.push(
      issue(bi.code, 'CRITICAL', 'readiness', bi.message, bi.detail)
    );
  }
  for (const bi of input.readiness.blockingIssues.filter((i) => i.severity === 'ERROR')) {
    blockingIssues.push(issue(bi.code, 'ERROR', 'readiness', bi.message, bi.detail));
  }
  for (const w of input.readiness.warnings) {
    warnings.push(issue(w.code, 'WARNING', 'readiness', w.message, w.detail));
  }
  for (const w of input.simulator.impact.differences.filter((d) => d.severity === 'WARNING')) {
    warnings.push(
      issue(`SIM_${w.field}`, 'WARNING', 'simulator', w.reason, {
        field: w.field,
      })
    );
  }

  const hasCritical = blockingIssues.some((i) => i.severity === 'CRITICAL');
  const hasError = blockingIssues.some((i) => i.severity === 'ERROR');

  const overallScore = Math.round(
    (input.readiness.overallScore + input.simulator.overall_score) / 2
  );

  let approvalLevel: CutoverPolicyResult['approvalLevel'] = 'NOT_READY';
  let approved = false;

  if (hasCritical || input.simulator.recommended === 'DO_NOT_MIGRATE') {
    approvalLevel = 'BLOCKED';
  } else if (
    shadowScore === 100 &&
    projectionScore === 100 &&
    consistencyApproved &&
    input.readiness.readyForMigration &&
    input.simulator.recommended === 'READY_TO_MIGRATE' &&
    !hasError
  ) {
    approved = true;
    approvalLevel = warnings.length > 0 ? 'APPROVED' : 'CUTOVER_PENDING';
    if (warnings.length > 0 && approvalLevel === 'APPROVED') {
      approvalLevel = 'READY';
    }
    if (warnings.length === 0) {
      approvalLevel = 'CUTOVER_PENDING';
    }
  } else if (input.simulator.recommended === 'READY_WITH_WARNINGS' || warnings.length > 0) {
    approvalLevel = 'READY_WITH_WARNINGS';
  } else if (overallScore >= 50) {
    approvalLevel = 'READY';
  } else {
    approvalLevel = 'BLOCKED';
  }

  if (
    approved &&
    shadowScore === 100 &&
    projectionScore === 100 &&
    warnings.length === 0
  ) {
    approvalLevel = 'CUTOVER_PENDING';
  } else if (approved && warnings.length > 0) {
    approvalLevel = 'APPROVED';
  }

  const result: CutoverPolicyResult = {
    approved,
    approvalLevel,
    blockingIssues,
    warnings,
    overallScore,
  };

  if (logContext) {
    logCutoverPolicy(
      {
        tenant_id: logContext.tenant_id,
        correlation_id: logContext.correlation_id,
        approved: result.approved,
        approval_level: result.approvalLevel,
      },
      { overall_score: result.overallScore, blocker_count: blockingIssues.length }
    );
  }

  return result;
}

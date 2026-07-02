/**
 * Billing Engine V2 — Sprint 3.1A: auditoria operacional contínua do pipeline V2.
 */
import { pool } from '../utils/db.js';
import { getContextHealthStats } from '../billingExecutionContext/contextMetrics.js';
import { logBillingObservability } from './observabilityLogger.js';
import { getMetricsCollectorSnapshot } from './billingMetricsCollector.js';
import type { BillingMetricsSnapshot, BillingOperationalAuditIssue, BillingOperationalAuditReport } from './types.js';
import { BILLING_OBSERVABILITY_VERSION } from './types.js';

async function countOrphanJobs(): Promise<number> {
  const r = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM billing_recurring_jobs j
     LEFT JOIN subscriptions s ON s.id = j.subscription_id
     WHERE s.id IS NULL`
  );
  return Number(r.rows[0]?.count ?? 0);
}

function buildIssues(metrics: BillingMetricsSnapshot): BillingOperationalAuditIssue[] {
  const issues: BillingOperationalAuditIssue[] = [];

  if (metrics.renewals_failed > 0) {
    issues.push({
      code: 'renewal_failures',
      severity: metrics.renewals_failed > 5 ? 'critical' : 'warning',
      count: metrics.renewals_failed,
      detail: 'Renovações CRM V2 com falha registradas',
    });
  }

  if (metrics.engine_errors > 0) {
    issues.push({
      code: 'engine_errors',
      severity: metrics.engine_errors > 3 ? 'critical' : 'warning',
      count: metrics.engine_errors,
      detail: 'BillingEngine rejeitou ou falhou na execução',
    });
  }

  if (metrics.context_errors > 0) {
    issues.push({
      code: 'context_errors',
      severity: 'warning',
      count: metrics.context_errors,
      detail: 'Falhas ao construir BillingExecutionContext',
    });
  }

  if (metrics.billing_plan_errors > 0) {
    issues.push({
      code: 'billing_plan_errors',
      severity: 'critical',
      count: metrics.billing_plan_errors,
      detail: 'Assinaturas sem Billing Plan persistido válido',
    });
  }

  if (metrics.billing_items_errors > 0) {
    issues.push({
      code: 'billing_items_errors',
      severity: 'critical',
      count: metrics.billing_items_errors,
      detail: 'Assinaturas sem Billing Items persistidos válidos',
    });
  }

  if (metrics.gateway_success_rate !== null && metrics.gateway_success_rate < 85) {
    issues.push({
      code: 'gateway_degraded',
      severity: 'warning',
      count: 1,
      detail: `Taxa de sucesso gateway abaixo do esperado (${metrics.gateway_success_rate}%)`,
    });
  }

  if (metrics.notification_success_rate !== null && metrics.notification_success_rate < 85) {
    issues.push({
      code: 'notification_degraded',
      severity: 'warning',
      count: 1,
      detail: `Taxa de sucesso de notificações abaixo do esperado (${metrics.notification_success_rate}%)`,
    });
  }

  if (metrics.job_retry_rate !== null && metrics.job_retry_rate > 30) {
    issues.push({
      code: 'high_retry_rate',
      severity: 'warning',
      count: 1,
      detail: `Taxa de retry elevada (${metrics.job_retry_rate}%)`,
    });
  }

  if (metrics.orphan_jobs !== null && metrics.orphan_jobs > 0) {
    issues.push({
      code: 'orphan_jobs',
      severity: metrics.orphan_jobs > 0 ? 'critical' : 'info',
      count: metrics.orphan_jobs,
      detail: 'Jobs de renovação sem assinatura associada',
    });
  }

  const ctx = getContextHealthStats();
  if (!ctx.healthy) {
    issues.push({
      code: 'context_builder_unhealthy',
      severity: 'warning',
      count: ctx.builder_errors,
      detail: 'Context builder reportou erros acumulados',
    });
  }

  return issues;
}

function buildRecommendations(issues: BillingOperationalAuditIssue[]): string[] {
  const recs: string[] = [];
  for (const issue of issues) {
    if (issue.code === 'billing_plan_errors') {
      recs.push('Migrar assinaturas sem Billing Plan persistido antes da Sprint 3.2');
    }
    if (issue.code === 'billing_items_errors') {
      recs.push('Revisar Billing Items efetivos das assinaturas com falha de contexto');
    }
    if (issue.code === 'gateway_degraded') {
      recs.push('Investigar falhas de gateway no orchestrator (logs [GATEWAY_EXECUTION])');
    }
    if (issue.code === 'high_retry_rate') {
      recs.push('Analisar jobs com retry elevado em billing_recurring_jobs');
    }
    if (issue.code === 'orphan_jobs') {
      recs.push('Executar recovery de orphan jobs via billing recovery');
    }
  }
  if (recs.length === 0 && issues.length === 0) {
    recs.push('Pipeline V2 operacional — apto para Legacy Removal (Sprint 3.2)');
  }
  return [...new Set(recs)];
}

export async function runBillingOperationalAudit(): Promise<BillingOperationalAuditReport> {
  const orphanJobs = await countOrphanJobs();
  const metrics = getMetricsCollectorSnapshot(orphanJobs);
  const issues = buildIssues(metrics);
  const healthy = issues.filter((i) => i.severity === 'critical').length === 0;
  const recommendations = buildRecommendations(issues);

  logBillingObservability('BILLING_AUDIT', healthy ? 'healthy' : 'issues_detected', {
    issue_count: issues.length,
    critical_count: issues.filter((i) => i.severity === 'critical').length,
    renewals_total: metrics.renewals_total,
  });

  return {
    version: BILLING_OBSERVABILITY_VERSION,
    audited_at: new Date().toISOString(),
    healthy,
    issues,
    metrics,
    recommendations,
  };
}

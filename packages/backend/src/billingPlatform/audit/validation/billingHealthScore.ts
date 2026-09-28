/**
 * Sprint 4.2A — Billing Health Score (0–100 por domínio).
 */
import type { AuditModuleResult } from '../types.js';
import type { AuditorCertificationReport } from './auditorScenarioValidator.js';

export type BillingHealthScoreReport = {
  sprint: '4.2A';
  title: 'Billing Health Score';
  generated_at_iso: string;
  billing_health_score: number;
  deployment_ready: boolean;
  subscriptions: number;
  worker: number;
  scheduler: number;
  runtime: number;
  calendar: number;
  billing_plans: number;
  billing_items: number;
  invoices: number;
  cycles: number;
  timezone: number;
  performance: number;
  penalties: Record<string, number>;
};

const HEALTH_THRESHOLD = 99;

function scoreFromModule(
  result: AuditModuleResult | undefined,
  errorWeight = 8,
  warningWeight = 2
): number {
  if (!result) return 0;
  let score = 100;
  for (const issue of result.issues) {
    if (issue.severity === 'error') score -= errorWeight;
    else if (issue.severity === 'warning') score -= warningWeight;
  }
  if (!result.certified) score = Math.min(score, 85);
  return Math.max(0, Math.min(100, score));
}

function scoreFromMetrics(
  certified: boolean,
  errorCount: number,
  warningCount: number
): number {
  let score = 100 - errorCount * 8 - warningCount * 2;
  if (!certified) score = Math.min(score, 85);
  return Math.max(0, Math.min(100, score));
}

export function computeBillingHealthScore(
  modules: Record<string, AuditModuleResult>,
  auditorReport: AuditorCertificationReport
): BillingHealthScoreReport {
  const subs = modules.productionSubscriptions;
  const worker = modules.worker;
  const financial = modules.financial;
  const migration = modules.migration;
  const calendar = modules.calendar;
  const timezone = modules.timezone;
  const performance = modules.performance;

  const subscriptions = scoreFromModule(subs);
  const workerScore = scoreFromModule(worker);
  const schedulerScore = worker?.certified ? 100 : Math.max(0, workerScore - 5);
  const runtimeScore = scoreFromModule(subs, 6, 1);
  const calendarScore = scoreFromModule(calendar);
  const billingPlans = scoreFromMetrics(
    migration?.certified ?? false,
    parseInt(String(migration?.metrics.missing_plan_count ?? 0), 10),
    0
  );
  const billingItems = scoreFromMetrics(
    migration?.certified ?? false,
    parseInt(String(migration?.metrics.missing_items_count ?? 0), 10),
    0
  );
  const invoices = scoreFromModule(financial);
  const cycles = scoreFromModule(calendar, 7, 2);
  const timezoneScore = scoreFromModule(timezone);
  const performanceScore = scoreFromModule(performance, 5, 3);

  const auditorPenalty =
    auditorReport.scenarios_failed * 5 +
    auditorReport.false_positives * 10 +
    auditorReport.false_negatives * 10;

  const domainScores = [
    subscriptions,
    workerScore,
    schedulerScore,
    runtimeScore,
    calendarScore,
    billingPlans,
    billingItems,
    invoices,
    cycles,
    timezoneScore,
    performanceScore,
  ];

  const rawAverage = domainScores.reduce((a, b) => a + b, 0) / domainScores.length;
  const billing_health_score = Math.max(
    0,
    Math.min(100, Math.round(rawAverage - auditorPenalty / domainScores.length))
  );

  const deployment_ready =
    billing_health_score >= HEALTH_THRESHOLD &&
    auditorReport.auditor_certified &&
    Object.values(modules).every((m) => m.certified);

  return {
    sprint: '4.2A',
    title: 'Billing Health Score',
    generated_at_iso: new Date().toISOString(),
    billing_health_score,
    deployment_ready,
    subscriptions,
    worker: workerScore,
    scheduler: schedulerScore,
    runtime: runtimeScore,
    calendar: calendarScore,
    billing_plans: billingPlans,
    billing_items: billingItems,
    invoices,
    cycles,
    timezone: timezoneScore,
    performance: performanceScore,
    penalties: {
      auditor_scenarios_failed: auditorReport.scenarios_failed * 5,
      auditor_false_positives: auditorReport.false_positives * 10,
      auditor_false_negatives: auditorReport.false_negatives * 10,
    },
  };
}

export const BILLING_HEALTH_THRESHOLD = HEALTH_THRESHOLD;

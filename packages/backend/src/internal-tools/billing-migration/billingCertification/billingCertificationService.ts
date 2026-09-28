/**
 * Billing Engine V2 — Sprint 2.4A: serviço Certification Suite (APIs).
 */
import { randomUUID } from 'node:crypto';
import { BillingCertificationEngine } from './billingCertificationEngine.js';
import { billingCertificationRepository } from './billingCertificationRepository.js';
import { getCertificationHealthStats } from './certificationMetrics.js';
import type { BillingCertificationReport, CertificationDashboard } from './types.js';
import { getSubscriptionById } from '../../../services/billingSubscriptionService.js';

const REPORT_TTL_DAYS = 90;

async function persistReport(report: BillingCertificationReport): Promise<void> {
  await billingCertificationRepository.insert(report);
  void billingCertificationRepository.purgeOlderThan(REPORT_TTL_DAYS).catch(() => {});
}

export async function certifySubscriptionById(
  subscriptionId: string,
  options?: { correlationId?: string; persist?: boolean }
): Promise<BillingCertificationReport> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) {
    throw new Error('Assinatura não encontrada');
  }
  if (subscription.type !== 'customer' || subscription.status !== 'active') {
    throw new Error('Certificação disponível apenas para assinaturas customer ativas');
  }

  const report = await BillingCertificationEngine.certifySubscription({
    subscription,
    correlationId: options?.correlationId ?? randomUUID(),
  });

  if (options?.persist !== false) {
    await persistReport(report);
  }

  return report;
}

export async function runFullCertificationSuite(options?: {
  correlationId?: string;
  persist?: boolean;
}): Promise<{
  reports: BillingCertificationReport[];
  engine_certified: boolean;
  recommendation: 'CERTIFIED' | 'NOT_CERTIFIED';
  correlation_id: string;
}> {
  const result = await BillingCertificationEngine.runFullCertification({
    correlationId: options?.correlationId,
  });

  if (options?.persist !== false) {
    for (const report of result.reports) {
      await persistReport(report);
    }
  }

  return result;
}

export async function getCertificationReportForSubscription(
  subscriptionId: string
): Promise<{ report: BillingCertificationReport | null; from_cache: boolean }> {
  const row = await billingCertificationRepository.findLatestBySubscription(subscriptionId);
  if (!row) return { report: null, from_cache: false };
  return { report: row.report_json as BillingCertificationReport, from_cache: true };
}

export async function getCertificationDashboard(): Promise<CertificationDashboard> {
  const [stats, recent] = await Promise.all([
    billingCertificationRepository.getDashboardStats(),
    billingCertificationRepository.getRecent(10),
  ]);

  const total = stats.total_subscriptions;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 10000) / 100 : 0);

  return {
    total_subscriptions: total,
    certified: stats.certified,
    failed: stats.failed,
    average_score: stats.average_score,
    projection_100_pct: pct(stats.projection_100),
    shadow_100_pct: pct(stats.shadow_100),
    consistency_100_pct: pct(stats.consistency_100),
    simulator_ok_pct: pct(stats.simulator_ok),
    cutover_ok_pct: pct(stats.cutover_ok),
    engine_certified: total > 0 && stats.certified === total,
    recommendation: total > 0 && stats.certified === total ? 'CERTIFIED' : 'NOT_CERTIFIED',
    last_evaluation: stats.last_evaluation,
    recent,
  };
}

export function getBillingCertificationHealthStats() {
  return getCertificationHealthStats();
}

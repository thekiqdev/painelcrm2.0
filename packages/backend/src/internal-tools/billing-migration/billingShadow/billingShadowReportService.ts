/**
 * Archived — relatórios Shadow históricos (superadmin).
 */
import {
  billingShadowReportRepository,
  type BillingShadowReportRow,
} from './billingShadowReportRepository.js';

export type BillingShadowReportApiResponse = {
  enabled: boolean;
  subscription_id: string;
  latest: BillingShadowReportRow | null;
  history: BillingShadowReportRow[];
  aggregate: Awaited<ReturnType<typeof billingShadowReportRepository.getAggregateStats>>;
};

export async function getBillingShadowReportForSubscription(
  subscriptionId: string,
  historyLimit = 20
): Promise<BillingShadowReportApiResponse> {
  const [latest, history, aggregate] = await Promise.all([
    billingShadowReportRepository.findLatestBySubscription(subscriptionId),
    billingShadowReportRepository.findHistoryBySubscription(subscriptionId, historyLimit),
    billingShadowReportRepository.getAggregateStats(),
  ]);

  return {
    enabled: false,
    subscription_id: subscriptionId,
    latest,
    history,
    aggregate,
  };
}

export async function getBillingShadowHealthStats(): Promise<{
  enabled: boolean;
  last_execution: string | null;
  average_score: number | null;
  approved_reports: number;
  failed_reports: number;
  critical_reports: number;
}> {
  const stats = await billingShadowReportRepository.getAggregateStats();
  return {
    enabled: false,
    last_execution: stats.last_execution,
    average_score: stats.average_score,
    approved_reports: stats.approved,
    failed_reports: stats.failed,
    critical_reports: stats.critical,
  };
}

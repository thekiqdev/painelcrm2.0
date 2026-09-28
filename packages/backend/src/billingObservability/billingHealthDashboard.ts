/**
 * Billing Engine V2 — Sprint 3.1A: dashboard operacional consolidado.
 */
import type { BillingDashboardCard, BillingMetricsSnapshot } from './types.js';

function cardStatus(
  value: number | null,
  okMin: number,
  warnMin: number
): BillingDashboardCard['status'] {
  if (value === null) return 'ok';
  if (value >= okMin) return 'ok';
  if (value >= warnMin) return 'warning';
  return 'critical';
}

function errorStatus(count: number): BillingDashboardCard['status'] {
  if (count === 0) return 'ok';
  if (count <= 3) return 'warning';
  return 'critical';
}

export function buildBillingHealthDashboard(metrics: BillingMetricsSnapshot): BillingDashboardCard[] {
  const successRate =
    metrics.renewals_total > 0
      ? Math.round((metrics.renewals_success / metrics.renewals_total) * 100)
      : null;

  return [
    {
      id: 'total_renewals',
      label: 'Total Renewals',
      value: metrics.renewals_total,
      status: 'ok',
    },
    {
      id: 'success_rate',
      label: 'Success Rate',
      value: successRate ?? '—',
      unit: successRate !== null ? '%' : undefined,
      status: cardStatus(successRate, 95, 85),
    },
    {
      id: 'average_duration',
      label: 'Average Duration',
      value: metrics.average_execution_time ?? '—',
      unit: metrics.average_execution_time !== null ? 'ms' : undefined,
      status: metrics.max_execution_time !== null && metrics.max_execution_time > 30000 ? 'warning' : 'ok',
    },
    {
      id: 'gateway_success',
      label: 'Gateway Success',
      value: metrics.gateway_success_rate ?? '—',
      unit: metrics.gateway_success_rate !== null ? '%' : undefined,
      status: cardStatus(metrics.gateway_success_rate, 90, 75),
    },
    {
      id: 'notification_success',
      label: 'Notification Success',
      value: metrics.notification_success_rate ?? '—',
      unit: metrics.notification_success_rate !== null ? '%' : undefined,
      status: cardStatus(metrics.notification_success_rate, 90, 75),
    },
    {
      id: 'retry_rate',
      label: 'Retry Rate',
      value: metrics.job_retry_rate ?? '—',
      unit: metrics.job_retry_rate !== null ? '%' : undefined,
      status:
        metrics.job_retry_rate !== null && metrics.job_retry_rate > 40
          ? 'critical'
          : metrics.job_retry_rate !== null && metrics.job_retry_rate > 25
            ? 'warning'
            : 'ok',
    },
    {
      id: 'engine_errors',
      label: 'Engine Errors',
      value: metrics.engine_errors,
      status: errorStatus(metrics.engine_errors),
    },
    {
      id: 'context_errors',
      label: 'Context Errors',
      value: metrics.context_errors,
      status: errorStatus(metrics.context_errors),
    },
    {
      id: 'billing_plan_errors',
      label: 'Billing Plan Errors',
      value: metrics.billing_plan_errors,
      status: errorStatus(metrics.billing_plan_errors),
    },
    {
      id: 'billing_item_errors',
      label: 'Billing Item Errors',
      value: metrics.billing_items_errors,
      status: errorStatus(metrics.billing_items_errors),
    },
  ];
}

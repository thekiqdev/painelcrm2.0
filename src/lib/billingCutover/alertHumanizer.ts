/**
 * Sprint 5.0-22B — Humanizer de alertas (somente apresentação).
 * Sem regras de negócio; não lê timeline.
 */
import type { BillingAlertSnapshot } from '@/lib/billingAggregate';
import type { FinancialAlert, FinancialAlertKind } from '@/lib/subscriptionFinancialExperience';

const ALERT_EMOJI: Record<string, string> = {
  billing_missing: '⚠️',
  client_overdue: '🔴',
  gateway_failed: '💳',
  no_events: 'ℹ️',
  subscription_status: '📋',
  invoice_failed: '⚠️',
  cycle_cancelled: '⚫',
  next_invoice: '📅',
};

const ACTION_LABEL: Record<string, string> = {
  billing_missing: 'Gerar agora',
  client_overdue: 'Resolver agora',
  gateway_failed: 'Resolver agora',
  no_events: 'Ver detalhes',
  subscription_status: 'Ver detalhes',
  invoice_failed: 'Resolver agora',
  cycle_cancelled: 'Ver detalhes',
  next_invoice: 'Ver detalhes',
};

function toLegacyAlertKind(kind: BillingAlertSnapshot['kind']): FinancialAlertKind {
  if (kind === 'billing_missing' || kind === 'client_overdue' || kind === 'gateway_failed') {
    return kind;
  }
  if (kind === 'invoice_failed') return 'billing_missing';
  if (kind === 'gateway_failed') return 'gateway_failed';
  return 'client_overdue';
}

/** Converte alertas do Aggregate para o contrato FinancialAlert da UI. */
export function humanizeAggregateAlerts(alerts: BillingAlertSnapshot[]): FinancialAlert[] {
  return alerts.map((alert) => ({
    id: alert.id,
    kind: toLegacyAlertKind(alert.kind),
    emoji: ALERT_EMOJI[alert.kind] ?? '⚠️',
    title: alert.title,
    message: alert.description,
    actionLabel: ACTION_LABEL[alert.kind] ?? 'Resolver agora',
    technicalDetail: null,
  }));
}

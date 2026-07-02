import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import type { FinancialEvent } from './financialEventTypes';
import { formatEventAmount } from './financialEventHelpers';
import type { FinancialInsight } from './subscriptionFinancialExperience';

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00Z`).getTime();
  const b = new Date(`${toYmd}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function monthsSince(firstYmd: string, today: string): number {
  return Math.max(
    1,
    Math.round(
      (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${firstYmd}T12:00:00Z`).getTime()) /
        (86400000 * 30)
    )
  );
}

function forecastNext90Days(events: FinancialEvent[], today: string): number {
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 90);
  const endYmd = end.toISOString().slice(0, 10);
  return events
    .filter(
      (e) =>
        (e.type === 'upcoming_cycle' || e.type === 'invoice_due') &&
        e.ymd >= today &&
        e.ymd <= endYmd
    )
    .reduce((s, e) => s + (e.amountCents ?? 0), 0);
}

/** Insights contextuais derivados do Event Store. */
export function buildFinancialInsights(
  events: FinancialEvent[],
  detail: CrmSubscriptionDetailPayload,
  todayYmd: string
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];
  const payments = events.filter((e) => e.type === 'payment');
  const overdue = events.filter(
    (e) => e.type === 'invoice_due' && e.dueYmd && e.dueYmd < todayYmd
  );
  const failures = events.filter((e) => e.type === 'invoice_failed');

  if (overdue.length === 0 && payments.length > 0) {
    insights.push({
      id: 'never-late',
      icon: '✓',
      text: 'Cliente nunca atrasou pagamentos.',
    });
  }

  const forecast90 = forecastNext90Days(events, todayYmd);
  if (forecast90 > 0) {
    insights.push({
      id: 'forecast-90',
      icon: '📈',
      text: `Receita prevista dos próximos 90 dias: ${formatEventAmount(forecast90)}.`,
    });
  }

  const created = detail.subscription.created_at?.slice(0, 10);
  if (created) {
    const months = monthsSince(created, todayYmd);
    insights.push({
      id: 'active-months',
      icon: '💡',
      text: `Cliente ativo há ${months} ${months === 1 ? 'mês' : 'meses'}.`,
    });
  }

  const lastPay = [...payments].sort((a, b) => b.ymd.localeCompare(a.ymd))[0];
  if (lastPay) {
    const days = daysBetween(lastPay.ymd, todayYmd);
    if (days === 0) {
      insights.push({ id: 'last-pay-today', icon: '💰', text: 'Último pagamento ocorreu hoje.' });
    } else {
      insights.push({
        id: 'last-pay-days',
        icon: '💰',
        text: `Último pagamento ocorreu há ${days} ${days === 1 ? 'dia' : 'dias'}.`,
      });
    }
  }

  if (failures.length > 0) {
    insights.push({
      id: 'failures',
      icon: '⚠',
      text: `${failures.length} cobrança(s) precisaram de atenção no histórico.`,
    });
  }

  if (payments.length > 0 && payments.every((p) => p.paidAt && p.dueYmd && p.paidAt <= p.dueYmd)) {
    insights.push({ id: 'on-time', icon: '✓', text: 'Cliente costuma pagar no prazo.' });
  }

  return insights;
}

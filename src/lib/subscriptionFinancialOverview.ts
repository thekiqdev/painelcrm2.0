import { formatYmdBrSafe } from '@/lib/billingSafeDate';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import {
  friendlyBillingMessage,
  normalizeYmdInput,
  type FinancialHistoryRow,
} from './billingSubscriptionExperience';
import { formatEventDateShort } from './financialEventHelpers';
import type {
  FinancialAlert,
  FinancialCalendarKind,
  FinancialKpiCard,
  FinancialKpiKey,
} from './subscriptionFinancialExperience';

/** Ordem mental do usuário nos KPIs. */
export const KPI_DISPLAY_ORDER: FinancialKpiKey[] = [
  'next_receipt',
  'open',
  'received',
  'last_payment',
  'forecast_12m',
  'status',
];

const KPI_LABEL_OVERRIDES: Partial<Record<FinancialKpiKey, string>> = {
  forecast_12m: 'Receita anual',
};

export const FINANCIAL_SECTION_GAP = 'space-y-8';
export const FINANCIAL_CARD_SHELL = 'border shadow-sm rounded-lg overflow-hidden';
export const FINANCIAL_CARD_HEADER = 'bg-muted/30 border-b py-4';
export const FINANCIAL_CARD_BODY = 'pt-4 px-6 pb-6';

export function relabelKpiCard(card: FinancialKpiCard): FinancialKpiCard {
  const label = KPI_LABEL_OVERRIDES[card.key] ?? card.label;
  return label === card.label ? card : { ...card, label };
}

export function reorderKpiCards(cards: FinancialKpiCard[]): FinancialKpiCard[] {
  const map = new Map(cards.map((c) => [c.key, relabelKpiCard(c)]));
  return KPI_DISPLAY_ORDER.map((key) => map.get(key)).filter((c): c is FinancialKpiCard => Boolean(c));
}

export function calendarMiniCardLabel(kind: FinancialCalendarKind): string {
  const map: Record<FinancialCalendarKind, string> = {
    paid: 'Pago',
    invoiced: 'Cobrança',
    due: 'Vence',
    overdue: 'Vence',
    failed: 'Falhou',
    cancelled: 'Cancelada',
    reprocessed: 'Reprocessada',
  };
  return map[kind];
}

export function calendarMiniCardEmoji(kind: FinancialCalendarKind): string {
  const map: Record<FinancialCalendarKind, string> = {
    paid: '🟢',
    invoiced: '🔵',
    due: '🟠',
    overdue: '🔴',
    failed: '🔴',
    cancelled: '⚫',
    reprocessed: '🔄',
  };
  return map[kind];
}

/** Competência compacta: Jul/2026 ou 14 Jul. */
export function formatHistoryCompetence(row: FinancialHistoryRow): string {
  const due = normalizeYmdInput(row.dueYmd);
  if (due) return formatEventDateShort(due);
  const comp = row.competence?.trim();
  if (!comp) return '—';
  if (comp.length <= 12) return comp;
  return comp.slice(0, 10);
}

function looksTechnicalError(text: string): boolean {
  return /invalid input|syntax error|postgres|SQLSTATE|uuid|constraint|ENOENT/i.test(text);
}

function sanitizeTechnicalMessage(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Ocorreu um problema inesperado. Tente novamente.';
  if (looksTechnicalError(raw)) {
    return 'Ocorreu um problema inesperado. Tente novamente ou contacte o suporte.';
  }
  return friendlyBillingMessage(raw);
}

/** Alertas amigáveis — sem mensagens técnicas/SQL na UI. */
export function humanizeFinancialAlerts(
  alerts: FinancialAlert[],
  detail: CrmSubscriptionDetailPayload,
  todayYmd?: string
): FinancialAlert[] {
  const today = todayYmd ?? new Date().toISOString().slice(0, 10);

  return alerts.map((alert) => {
    if (alert.kind === 'billing_missing') {
      const failed = detail.timeline.find(
        (r) => r.operational_state === 'failed' && !r.invoice_id
      );
      const due = normalizeYmdInput(failed?.due_date);
      return {
        ...alert,
        title: 'Cobrança não foi criada',
        message: due
          ? `A cobrança prevista para ${formatYmdBrSafe(due)} não foi criada.`
          : 'Uma cobrança prevista não foi criada.',
        actionLabel: 'Gerar agora',
        technicalDetail: failed?.job_error_snippet ?? null,
      };
    }

    if (alert.kind === 'client_overdue') {
      const overdue = detail.timeline.find((r) => {
        const due = normalizeYmdInput(r.due_date);
        return due && due < today && (r.invoice_status ?? '').toLowerCase() === 'pending';
      });
      const due = normalizeYmdInput(overdue?.due_date);
      const days = due
        ? Math.floor(
            (new Date(`${today}T12:00:00Z`).getTime() - new Date(`${due}T12:00:00Z`).getTime()) /
              86400000
          )
        : 0;
      return {
        ...alert,
        title: 'Pagamento em atraso',
        message: due
          ? `O vencimento de ${formatYmdBrSafe(due)} está ${days} dia(s) em atraso.`
          : `Pagamento em atraso há ${days} dia(s).`,
        actionLabel: 'Resolver agora',
      };
    }

    if (alert.kind === 'gateway_failed') {
      return {
        ...alert,
        title: 'Pagamento recusado',
        message: 'O gateway não conseguiu processar a cobrança. Verifique o meio de pagamento do cliente.',
        actionLabel: 'Resolver agora',
      };
    }

    return {
      ...alert,
      message: sanitizeTechnicalMessage(alert.message),
      actionLabel: alert.actionLabel || 'Resolver agora',
    };
  });
}

import type { FinancialEvent, FinancialEventType } from './financialEventTypes';
import type { FinancialBadgeVariant } from './financialStatusBadge';
import type { FinancialCalendarKind } from './subscriptionFinancialExperience';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const TYPE_PRIORITY: Record<FinancialEventType, number> = {
  payment: 1,
  invoice_failed: 2,
  invoice_cancelled: 3,
  invoice_refunded: 4,
  invoice_due: 5,
  charge_attempt: 6,
  invoice_reprocessed: 7,
  invoice_generated: 8,
  manual_charge: 9,
  upcoming_cycle: 10,
};

const STANDARD_LABELS: Record<FinancialEventType, string> = {
  payment: 'Pago',
  invoice_generated: 'Emitida',
  invoice_due: 'Pendente',
  invoice_failed: 'Falhou',
  invoice_cancelled: 'Cancelado',
  invoice_reprocessed: 'Reprocessada',
  invoice_refunded: 'Reembolsada',
  upcoming_cycle: 'Prevista',
  manual_charge: 'Emitida',
  charge_attempt: 'Tentativa',
};

const TYPE_EMOJI: Record<FinancialEventType, string> = {
  payment: '🟢',
  invoice_generated: '🔵',
  invoice_due: '🟠',
  invoice_failed: '🔴',
  invoice_cancelled: '⚫',
  invoice_reprocessed: '🔄',
  invoice_refunded: '⚫',
  upcoming_cycle: '🟠',
  manual_charge: '🔵',
  charge_attempt: '🔄',
};

export function formatEventAmount(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function formatEventDateShort(ymd: string): string {
  const day = Number(ymd.slice(8, 10));
  const mi = Number(ymd.slice(5, 7)) - 1;
  return mi >= 0 && mi < 12 ? `${day} ${MONTH_SHORT[mi]}` : ymd;
}

export function standardStatusLabel(type: FinancialEventType, overdue = false): string {
  if (type === 'invoice_due' && overdue) return 'Atrasada';
  return STANDARD_LABELS[type];
}

export function badgeForEventType(type: FinancialEventType, overdue = false): FinancialBadgeVariant {
  if (type === 'payment') return 'paid';
  if (type === 'invoice_failed' || type === 'charge_attempt') return 'failed';
  if (type === 'invoice_due' && overdue) return 'overdue';
  if (type === 'invoice_cancelled' || type === 'invoice_refunded') return 'cancelled';
  if (
    type === 'invoice_generated' ||
    type === 'invoice_due' ||
    type === 'upcoming_cycle' ||
    type === 'manual_charge' ||
    type === 'invoice_reprocessed'
  ) {
    return 'pending';
  }
  return 'default';
}

export function eventTypePriority(type: FinancialEventType): number {
  return TYPE_PRIORITY[type] ?? 99;
}

export function sortEventsByPriority(events: FinancialEvent[]): FinancialEvent[] {
  return [...events].sort(
    (a, b) =>
      eventTypePriority(a.type) - eventTypePriority(b.type) ||
      a.ymd.localeCompare(b.ymd) ||
      a.id.localeCompare(b.id)
  );
}

export function groupEventsByDay(events: FinancialEvent[]): Map<string, FinancialEvent[]> {
  const map = new Map<string, FinancialEvent[]>();
  for (const ev of events) {
    const list = map.get(ev.ymd) ?? [];
    list.push(ev);
    map.set(ev.ymd, list);
  }
  for (const [ymd, list] of map) {
    map.set(ymd, sortEventsByPriority(list));
  }
  return map;
}

export function pickPrimaryEvent(events: FinancialEvent[]): FinancialEvent | undefined {
  return sortEventsByPriority(events)[0];
}

export function eventToCalendarKind(type: FinancialEventType, overdue: boolean): FinancialCalendarKind {
  if (type === 'payment') return 'paid';
  if (type === 'invoice_failed' || type === 'charge_attempt') return 'failed';
  if (type === 'invoice_due') return overdue ? 'overdue' : 'due';
  if (type === 'invoice_generated' || type === 'manual_charge') return 'invoiced';
  if (type === 'invoice_cancelled' || type === 'invoice_refunded') return 'cancelled';
  if (type === 'invoice_reprocessed') return 'reprocessed';
  return 'due';
}

export function eventEmoji(type: FinancialEventType): string {
  return TYPE_EMOJI[type];
}

export function timelineIcon(type: FinancialEventType): string {
  if (type === 'payment') return '💰';
  if (type === 'invoice_failed' || type === 'charge_attempt') return '⚠';
  if (type === 'invoice_cancelled' || type === 'invoice_refunded') return '⚫';
  if (type === 'invoice_reprocessed') return '🔄';
  return '🧾';
}

export function timelineTitle(type: FinancialEventType): string {
  if (type === 'payment') return 'Pago';
  if (type === 'invoice_generated' || type === 'manual_charge') return 'Cobrança criada';
  if (type === 'invoice_failed') return 'Falha';
  if (type === 'invoice_due') return 'Vencimento';
  if (type === 'upcoming_cycle') return 'Próximo recebimento';
  if (type === 'invoice_reprocessed') return 'Reprocessada';
  if (type === 'invoice_cancelled') return 'Cancelado';
  if (type === 'invoice_refunded') return 'Reembolsada';
  if (type === 'charge_attempt') return 'Tentativa de cobrança';
  return 'Evento';
}

export function cycleKeyFromParts(cycleId: string | null, dueYmd: string | null, competence: string | null): string {
  return cycleId ?? dueYmd ?? competence ?? 'unknown';
}

export function eventsForMonth(events: FinancialEvent[], monthKey: string): FinancialEvent[] {
  return events.filter((e) => e.ymd.startsWith(monthKey));
}

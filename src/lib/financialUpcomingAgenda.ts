import type { FinancialEvent, FinancialEventType } from './financialEventTypes';
import { formatEventDateShort, sortEventsByPriority } from './financialEventHelpers';

export type UpcomingAgendaItem = {
  id: string;
  ymd: string;
  dateLabel: string;
  title: string;
  isToday: boolean;
  amountCents: number | null;
  eventType: FinancialEventType;
};

const AGENDA_TYPES: FinancialEventType[] = [
  'invoice_failed',
  'invoice_due',
  'invoice_generated',
  'manual_charge',
  'upcoming_cycle',
  'charge_attempt',
];

function agendaTitle(type: FinancialEventType, ymd: string, today: string): string {
  if (ymd === today && type === 'upcoming_cycle') return 'Cobrança prevista para hoje';
  if (type === 'invoice_failed' || type === 'charge_attempt') return 'Cobrança não foi criada';
  if (type === 'invoice_generated' || type === 'manual_charge') return 'Cobrança automática';
  if (type === 'invoice_due') return 'Vencimento';
  if (type === 'upcoming_cycle') return 'Recebimento esperado';
  return 'Próximo evento';
}

/** Próximos acontecimentos em ordem cronológica (máx. 5). */
export function buildUpcomingAgenda(
  events: FinancialEvent[],
  todayYmd: string,
  maxItems = 5
): UpcomingAgendaItem[] {
  const seen = new Set<string>();
  const items: UpcomingAgendaItem[] = [];

  const candidates = events
    .filter((e) => e.ymd >= todayYmd && AGENDA_TYPES.includes(e.type))
    .sort((a, b) => a.ymd.localeCompare(b.ymd) || a.id.localeCompare(b.id));

  for (const ev of sortEventsByPriority(candidates)) {
    if (ev.ymd < todayYmd) continue;
    const key = `${ev.ymd}:${agendaTitle(ev.type, ev.ymd, todayYmd)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: ev.id,
      ymd: ev.ymd,
      dateLabel: ev.ymd === todayYmd ? 'Hoje' : formatEventDateShort(ev.ymd),
      title: agendaTitle(ev.type, ev.ymd, todayYmd),
      isToday: ev.ymd === todayYmd,
      amountCents: ev.amountCents,
      eventType: ev.type,
    });
    if (items.length >= maxItems) break;
  }

  return items.sort((a, b) => a.ymd.localeCompare(b.ymd));
}

export function nextAgendaHighlight(
  agenda: UpcomingAgendaItem[]
): UpcomingAgendaItem | null {
  return agenda[0] ?? null;
}

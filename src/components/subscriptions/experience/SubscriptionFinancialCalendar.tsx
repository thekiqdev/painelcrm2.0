import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  buildCalendarGrid,
  calendarDayAriaLabel,
  collectEventsForMonth,
  defaultCalendarMonthKey,
  focusRingClass,
  polishTransitionClass,
  shiftMonthKey,
} from '@/lib/billingSubscriptionExperiencePolish';
import { calendarLegend, type CalendarEvent } from '@/lib/billingSubscriptionExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { formatExperienceAmount, formatExperienceYmd } from './subscriptionExperienceFormat';
import { SubscriptionExperienceEmptyState } from './SubscriptionExperienceEmptyState';
import { detectExperienceEmpty } from '@/lib/billingSubscriptionExperiencePolish';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthKeyToLabelPt } from '@/lib/billingSubscriptionExperiencePolish';

type Props = {
  detail: CrmSubscriptionDetailPayload;
  canViewInvoices?: boolean;
  className?: string;
};

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function visualSymbol(visual: CalendarEvent['visual']): string {
  const found = calendarLegend().find((l) => l.visual === visual);
  return found?.symbol ?? '○';
}

function EventPopover({
  events,
  canViewInvoices,
}: {
  events: CalendarEvent[];
  canViewInvoices: boolean;
}) {
  const ev = events[0];
  if (!ev) return null;
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium">{ev.label}</p>
      <dl className="grid gap-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Competência</dt>
          <dd>{ev.competence ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="tabular-nums">{ev.amountCents != null ? formatExperienceAmount(ev.amountCents) : '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Vencimento</dt>
          <dd className="tabular-nums">{formatExperienceYmd(ev.dueYmd)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{ev.statusPt ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Gateway</dt>
          <dd>{ev.gateway ?? '—'}</dd>
        </div>
        {ev.invoiceId ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Invoice</dt>
            <dd className="font-mono text-[10px] truncate max-w-[120px]">{ev.invoiceId.slice(0, 8)}…</dd>
          </div>
        ) : null}
      </dl>
      {ev.invoiceId && canViewInvoices ? (
        <Button size="sm" className="w-full" asChild>
          <Link to={`/customer-invoices/${ev.invoiceId}`}>Abrir fatura</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function SubscriptionFinancialCalendar({ detail, canViewInvoices = true, className }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [monthKey, setMonthKey] = useState(() => defaultCalendarMonthKey(detail, today));
  const empty = detectExperienceEmpty('calendar', detail);

  const events = useMemo(() => collectEventsForMonth(detail, monthKey), [detail, monthKey]);
  const grid = useMemo(() => buildCalendarGrid(monthKey, events, today), [monthKey, events, today]);

  if (empty === 'calendar') {
    return <SubscriptionExperienceEmptyState kind="calendar" className={className} />;
  }

  return (
    <Card className={cn('border shadow-sm overflow-hidden', className)}>
      <CardHeader className="bg-muted/30 border-b py-4 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-medium">Calendário financeiro</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Mês anterior"
            onClick={() => setMonthKey((m) => shiftMonthKey(m, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center tabular-nums">
            {monthKeyToLabelPt(monthKey)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Próximo mês"
            onClick={() => setMonthKey((m) => shiftMonthKey(m, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          {calendarLegend().map((item) => (
            <span key={item.visual} className="inline-flex items-center gap-0.5">
              <span aria-hidden>{item.symbol}</span>
              {item.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-0.5">
            <span aria-hidden>○</span>
            Próxima cobrança
          </span>
        </div>

        <div className="grid grid-cols-7 gap-px text-center text-[10px] font-medium text-muted-foreground mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Calendário ${monthKeyToLabelPt(monthKey)}`}>
          {grid.map((cell, idx) => {
            if (!cell.inMonth || cell.day == null) {
              return <div key={`pad-${idx}`} className="min-h-[52px] sm:min-h-[64px]" role="gridcell" aria-hidden />;
            }
            const hasEvents = cell.events.length > 0;
            const inner = (
              <div
                className={cn(
                  'min-h-[52px] sm:min-h-[64px] rounded-lg border p-1 text-left flex flex-col',
                  polishTransitionClass(),
                  cell.isToday && 'border-crm-primary/50 bg-crm-primary/5 ring-1 ring-crm-primary/20',
                  !cell.isToday && 'border-transparent hover:border-border hover:bg-muted/30',
                  hasEvents && focusRingClass()
                )}
              >
                <span className={cn('text-xs font-semibold tabular-nums', cell.isToday && 'text-crm-primary')}>
                  {cell.day}
                </span>
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {cell.events.slice(0, 3).map((ev) => (
                    <span key={ev.id} className="text-[10px] leading-none" title={ev.label} aria-hidden>
                      {visualSymbol(ev.visual)}
                    </span>
                  ))}
                </div>
              </div>
            );

            if (!hasEvents) {
              return (
                <div key={cell.ymd} role="gridcell" aria-label={calendarDayAriaLabel(cell)}>
                  {inner}
                </div>
              );
            }

            return (
              <Popover key={cell.ymd}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="w-full text-left"
                    aria-label={calendarDayAriaLabel(cell)}
                  >
                    {inner}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                  <EventPopover events={cell.events} canViewInvoices={canViewInvoices} />
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

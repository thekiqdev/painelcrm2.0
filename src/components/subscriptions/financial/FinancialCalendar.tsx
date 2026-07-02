import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  buildCalendarGrid,
  defaultFinancialCalendarMonth,
  financialDayAriaLabel,
  shiftMonthKey,
} from '@/lib/subscriptionFinancialExperience';
import { monthKeyToLabelPt } from '@/lib/billingSubscriptionExperience';
import type { CrmSubscriptionDetailPayload } from '@/services/crmSubscriptions';
import { useFinancialEventStore } from './FinancialEventStoreContext';
import { eventToCalendarKind } from '@/lib/financialEventHelpers';
import {
  keyboardActivatesClick,
  swipeMonthDirection,
} from '@/lib/subscriptionFinancialRefinement';
import { FinancialCalendarMiniCard } from './FinancialCalendarMiniCard';
import { FinancialCalendarPopover } from './FinancialCalendarPopover';
import { FinancialCalendarTooltipContent } from './FinancialCalendarTooltipContent';
import { FINANCIAL_CARD_BODY, FINANCIAL_CARD_HEADER, FINANCIAL_CARD_SHELL } from '@/lib/subscriptionFinancialOverview';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { focusRingClass } from './FinancialStatCard';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

type Props = {
  detail: CrmSubscriptionDetailPayload;
  canViewInvoices?: boolean;
  onGenerateBilling?: () => void;
  onChangeDue?: () => void;
  onViewHistory?: () => void;
  className?: string;
};

export function FinancialCalendar({
  detail,
  canViewInvoices = true,
  onGenerateBilling,
  onChangeDue,
  onViewHistory,
  className,
}: Props) {
  const store = useFinancialEventStore();
  const today = store.today;
  const [monthKey, setMonthKey] = useState(() => defaultFinancialCalendarMonth(detail, today));
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});
  const touchStartX = useRef<number | null>(null);

  const monthEvents = useMemo(() => store.getEventsForMonth(monthKey), [store, monthKey]);
  const eventsByDay = useMemo(() => store.getEventsByDay(), [store]);
  const calendarEvents = useMemo(() => store.getCalendarEvents(), [store]);

  const grid = useMemo(
    () =>
      buildCalendarGrid(
        monthKey,
        monthEvents.map((e) => {
          const overdue = e.type === 'invoice_due' && Boolean(e.dueYmd && e.dueYmd < today);
          const kind = eventToCalendarKind(e.type, overdue);
          return {
            id: e.id,
            ymd: e.ymd,
            monthKey: e.ymd.slice(0, 7),
            day: Number(e.ymd.slice(8, 10)),
            kind: 'due' as const,
            visual: 'future' as const,
            label: e.statusLabel,
            competence: e.competence,
            invoiceId: e.invoiceId,
            amountCents: e.amountCents,
            dueYmd: e.ymd,
            statusPt: e.statusLabel,
            gateway: e.gateway,
            cycleLabel: e.competence,
          };
        }),
        today
      ),
    [monthKey, monthEvents, today]
  );

  const legendKinds = useMemo(() => {
    const kinds = new Set(monthEvents.map((e) => eventToCalendarKind(e.type, Boolean(e.dueYmd && e.dueYmd < today))));
    return [...kinds];
  }, [monthEvents, today]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const dir = swipeMonthDirection(endX - touchStartX.current);
    touchStartX.current = null;
    if (dir === 'prev') setMonthKey((m) => shiftMonthKey(m, -1));
    if (dir === 'next') setMonthKey((m) => shiftMonthKey(m, 1));
  };

  return (
    <Card className={cn(FINANCIAL_CARD_SHELL, className)}>
      <CardHeader className={cn(FINANCIAL_CARD_HEADER, 'flex flex-row items-center justify-between gap-2')}>
        <CardTitle className="text-base font-medium">Calendário financeiro</CardTitle>
        <div className="flex items-center gap-1" role="navigation" aria-label="Navegação do calendário">
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Mês anterior" onClick={() => setMonthKey((m) => shiftMonthKey(m, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[120px] text-center">{monthKeyToLabelPt(monthKey)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Próximo mês" onClick={() => setMonthKey((m) => shiftMonthKey(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className={cn(FINANCIAL_CARD_BODY, 'space-y-3')} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="flex flex-wrap gap-2" role="list" aria-label="Legenda do calendário">
          {legendKinds.map((kind) => (
            <FinancialCalendarMiniCard key={kind} kind={kind} />
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px text-center text-[10px] font-medium text-muted-foreground" role="row">
          {WEEKDAYS.map((d) => <div key={d} className="py-1" role="columnheader">{d}</div>)}
        </div>
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-7 gap-1" role="grid">
            {grid.map((cell, idx) => {
              if (!cell.inMonth || cell.day == null || !cell.ymd) {
                return <div key={`p-${idx}`} className="min-h-[104px] sm:min-h-[120px]" aria-hidden />;
              }
              const dayEvents = eventsByDay.get(cell.ymd) ?? [];
              const isExpanded = expandedDays[cell.ymd];
              const visibleEvents = isExpanded ? dayEvents : dayEvents.slice(0, 2);
              const hiddenCount = dayEvents.length - visibleEvents.length;

              const inner = (
                <div className={cn(
                  'min-h-[104px] sm:min-h-[120px] rounded-lg border p-1 flex flex-col gap-0.5 transition-colors',
                  cell.isToday && 'border-crm-primary/40 bg-crm-primary/5',
                  dayEvents.length > 0 && 'hover:bg-muted/40 cursor-pointer',
                  focusRingClass()
                )}>
                  <span className={cn('text-xs font-semibold tabular-nums', cell.isToday && 'text-crm-primary')}>{cell.day}</span>
                  {dayEvents.length > 0 ? (
                    <div className="mt-auto space-y-0.5 flex-1 flex flex-col justify-end">
                      {visibleEvents.map((ev) => {
                        const overdue = ev.type === 'invoice_due' && Boolean(ev.dueYmd && ev.dueYmd < today);
                        const kind = eventToCalendarKind(ev.type, overdue);
                        return (
                          <FinancialCalendarMiniCard key={ev.id} kind={kind} amountCents={ev.amountCents} />
                        );
                      })}
                      {hiddenCount > 0 ? (
                        <button
                          type="button"
                          className="text-[8px] text-muted-foreground text-left hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDays((p) => ({ ...p, [cell.ymd!]: true }));
                          }}
                        >
                          +{hiddenCount} evento{hiddenCount === 1 ? '' : 's'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );

              if (dayEvents.length === 0) {
                return (
                  <div key={cell.ymd} role="gridcell" aria-label={financialDayAriaLabel(cell.day, [])}>
                    {inner}
                  </div>
                );
              }

              const calEvents = calendarEvents.filter((c) => c.ymd === cell.ymd);

              return (
                <Popover key={cell.ymd}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full text-left"
                          aria-label={financialDayAriaLabel(cell.day, calEvents)}
                          onKeyDown={(e) => {
                            if (keyboardActivatesClick(e.key)) {
                              e.preventDefault();
                              (e.currentTarget as HTMLButtonElement).click();
                            }
                          }}
                        >
                          {inner}
                        </button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="p-3">
                      <FinancialCalendarTooltipContent
                        events={dayEvents}
                        clientName={detail.client_name ?? null}
                      />
                    </TooltipContent>
                  </Tooltip>
                  <PopoverContent className="w-80" align="start" data-focus-trap-root>
                    <FinancialCalendarPopover
                      events={dayEvents}
                      detail={detail}
                      canViewInvoices={canViewInvoices}
                      onGenerateBilling={onGenerateBilling}
                      onChangeDue={onChangeDue}
                      onViewHistory={onViewHistory}
                    />
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

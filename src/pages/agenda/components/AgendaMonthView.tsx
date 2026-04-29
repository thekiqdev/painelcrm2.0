import React, { useMemo, useState } from 'react';
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/appointments';
import type { AvailabilityBlock } from '@/services/appointmentAvailabilityBlocks';
import type { AppointmentHolidayApi } from '@/services/appointmentHolidays';
import {
  TYPE_ACCENT,
  TYPE_BAR,
  TYPE_OPTIONS,
  appointmentAttendanceLabel,
  appointmentPublicConfirmationLabel,
} from '../agendaConstants';

const MAX_VISIBLE = 3;
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

type CellItem =
  | { t: 'ap'; ap: Appointment }
  | { t: 'b'; b: AvailabilityBlock }
  | { t: 'h'; h: AppointmentHolidayApi };

type Props = {
  month: Date;
  items: Appointment[];
  blocks?: AvailabilityBlock[];
  holidays?: AppointmentHolidayApi[];
  typeLabelByKey?: Record<string, string>;
  isLoading: boolean;
  isMobile: boolean;
  onEventClick: (id: string) => void;
  onDayEmptyClick: (day: Date) => void;
  onShowDayList: (day: Date) => void;
  canCreate: boolean;
};

function dayKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function cellSortKey(c: CellItem): string {
  if (c.t === 'h') return `00:00:00-${c.h.name}`;
  if (c.t === 'ap') return format(parseISO(c.ap.starts_at), 'HH:mm:ss');
  return format(parseISO(c.b.starts_at), 'HH:mm:ss');
}

function MonthGridSkeleton() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/40 shadow-sm">
      <div className="min-w-[320px] animate-pulse">
        <div className="grid grid-cols-7 border-b border-border/50 bg-muted/25 py-2">
          {weekdays.map((w) => (
            <div key={w} className="text-center">
              <div className="mx-auto h-2.5 w-6 rounded bg-muted-foreground/25" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div
              key={i}
              className="min-h-[5.5rem] border-b border-r border-border/35 bg-muted/10 p-1 last:border-r-0"
            >
              <div className="mx-auto mb-1 h-5 w-5 rounded-full bg-muted-foreground/15" />
              <div className="space-y-1">
                <div className="h-2.5 w-full rounded bg-muted-foreground/10" />
                <div className="h-2.5 w-4/5 rounded bg-muted-foreground/10" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgendaMonthView({
  month,
  items,
  blocks = [],
  holidays = [],
  typeLabelByKey,
  isLoading,
  isMobile,
  onEventClick,
  onDayEmptyClick,
  onShowDayList,
  canCreate,
}: Props) {
  const [daySheet, setDaySheet] = useState<Date | null>(null);

  const { days, mergedByDay } = useMemo(() => {
    const ms = startOfMonth(month);
    const me = endOfMonth(month);
    const gridStart = startOfWeek(ms, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(me, { weekStartsOn: 1 });
    const dayList = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const mergedMap = new Map<string, CellItem[]>();
    for (const d of dayList) {
      const k = dayKey(d);
      const d0 = startOfDay(d);
      const d1 = endOfDay(d);
      const arr: CellItem[] = [];
      for (const ap of items) {
        if (format(parseISO(ap.starts_at), 'yyyy-MM-dd') === k) arr.push({ t: 'ap', ap });
      }
      for (const b of blocks) {
        const bs = parseISO(b.starts_at);
        const be = parseISO(b.ends_at);
        if (be > d0 && bs < d1) arr.push({ t: 'b', b });
      }
      for (const h of holidays) {
        if ((h.display_date ?? h.holiday_date).slice(0, 10) === k) {
          arr.push({ t: 'h', h });
        }
      }
      arr.sort((x, y) => cellSortKey(x).localeCompare(cellSortKey(y)));
      mergedMap.set(k, arr);
    }
    return { days: dayList, mergedByDay: mergedMap };
  }, [month, items, blocks, holidays]);

  const daySheetList = useMemo(() => {
    if (!daySheet) return [];
    return mergedByDay.get(dayKey(daySheet)) ?? [];
  }, [daySheet, mergedByDay]);

  if (isLoading) {
    return <MonthGridSkeleton />;
  }

  const openDay = (d: Date, dayItems: CellItem[]) => {
    if (isMobile) {
      setDaySheet(d);
      return;
    }
    if (dayItems.length > MAX_VISIBLE) {
      onShowDayList(d);
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/30 shadow-sm">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 border-b border-border/50 bg-muted/25 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {weekdays.map((w) => (
              <div key={w} className="px-0.5 py-2 sm:px-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-[10px] sm:text-xs">
            {days.map((d) => {
              const k = dayKey(d);
              const inMonth = isSameMonth(d, month);
              const t = isToday(d);
              const list = mergedByDay.get(k) ?? [];
              const visible = list.slice(0, MAX_VISIBLE);
              const more = list.length - visible.length;
              const hasAppointments = list.some((c) => c.t === 'ap');

              return (
                <div
                  key={k}
                  className={cn(
                    'border-b border-r border-border/40 p-px sm:p-1',
                    isMobile ? 'min-h-[4.5rem]' : 'min-h-[5.25rem] sm:min-h-[6rem]',
                    !inMonth && 'bg-muted/12 text-muted-foreground/50',
                    t && inMonth && 'bg-primary/[0.08] ring-1 ring-inset ring-primary/20',
                    hasAppointments && inMonth && !t && 'bg-muted/20',
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      'relative mb-0.5 flex min-h-[2.75rem] w-full items-center justify-center rounded-md py-1 text-xs font-semibold tabular-nums touch-manipulation sm:mb-1 sm:min-h-0 sm:py-0.5',
                      t ? 'text-primary' : inMonth ? 'text-foreground' : 'text-muted-foreground',
                    )}
                    onClick={() => {
                      if (isMobile) {
                        setDaySheet(d);
                        return;
                      }
                      if (list.length === 0) onDayEmptyClick(d);
                      else openDay(d, list);
                    }}
                  >
                    {hasAppointments && inMonth ? (
                      <span
                        className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary/70"
                        aria-hidden
                      />
                    ) : null}
                    {format(d, 'd')}
                  </button>
                  {visible.length > 0
                    ? visible.map((cell) =>
                        cell.t === 'h' ? (
                          <div
                            key={`h-${cell.h.id}-${(cell.h.display_date ?? cell.h.holiday_date).slice(0, 10)}`}
                            className="mb-0.5 w-full rounded border border-amber-500/40 bg-amber-500/10 px-0.5 py-0.5 text-left text-[9px] leading-tight sm:text-[10px]"
                          >
                            <div className="text-[8px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                              Feriado
                            </div>
                            <span className="line-clamp-2 font-medium text-foreground">{cell.h.name}</span>
                          </div>
                        ) : cell.t === 'b' ? (
                          <div
                            key={`b-${cell.b.id}`}
                            className="mb-0.5 w-full rounded border border-dashed border-muted-foreground/40 bg-muted/35 px-0.5 py-0.5 text-left text-[9px] leading-tight text-muted-foreground sm:text-[10px]"
                          >
                            <span className="font-mono opacity-90">
                              {cell.b.all_day ? '⋅ ' : `${format(parseISO(cell.b.starts_at), 'HH:mm')} `}
                            </span>
                            <span className="line-clamp-1 font-medium text-foreground">{cell.b.title}</span>
                            <span className="ml-1 text-[8px] uppercase">Indisp.</span>
                          </div>
                        ) : (
                          <button
                            key={cell.ap.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEventClick(cell.ap.id);
                            }}
                            className={cn(
                              'mb-0.5 flex w-full items-start gap-0.5 rounded-md border border-border/50 bg-background/90 px-0.5 py-0.5 text-left text-[9px] leading-tight transition-colors sm:text-[10px]',
                              'hover:border-primary/30 hover:bg-muted/50',
                              TYPE_ACCENT[cell.ap.type] ?? TYPE_ACCENT.other,
                            )}
                          >
                            <span
                              className={cn(
                                'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                                TYPE_BAR[cell.ap.type] ?? TYPE_BAR.other,
                              )}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-mono text-muted-foreground">
                                {format(parseISO(cell.ap.starts_at), 'HH:mm')}
                              </span>{' '}
                              <span className="line-clamp-1 font-medium text-foreground">{cell.ap.title}</span>
                              {cell.ap.recurrence_series_id ? (
                                <span className="ml-1 text-[8px] text-primary">Rec.</span>
                              ) : null}
                            </span>
                          </button>
                        ),
                      )
                    : null}
                  {more > 0 ? (
                    <button
                      type="button"
                      className="mt-1 w-full rounded-md bg-primary/10 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/18 sm:text-[11px]"
                      onClick={() => (isMobile ? setDaySheet(d) : onShowDayList(d))}
                    >
                      +{more} mais
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Sheet open={daySheet != null} onOpenChange={(o) => !o && setDaySheet(null)}>
        <SheetContent
          side="bottom"
          className="flex max-h-[min(85vh,36rem)] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:max-h-[min(80vh,32rem)]"
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/25 md:hidden" aria-hidden />
          <SheetHeader className="px-4 pb-2 pt-3 text-left">
            <SheetTitle className="text-lg">
              {daySheet ? format(daySheet, "EEEE, d 'de' MMMM", { locale: ptBR }) : ''}
            </SheetTitle>
          </SheetHeader>
          <ul className="mt-1 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-2 pr-3">
            {daySheetList.length === 0 ? (
              <li className="list-none py-8 text-center text-sm text-muted-foreground">
                Sem compromissos neste dia.
              </li>
            ) : (
              daySheetList.map((cell) =>
              cell.t === 'h' ? (
                <li key={`h-${cell.h.id}-${(cell.h.display_date ?? cell.h.holiday_date).slice(0, 10)}`}>
                  <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-left text-sm">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                      Feriado
                    </div>
                    <div className="font-medium text-foreground">{cell.h.name}</div>
                    <div className="text-[10px] text-muted-foreground">Indicação no calendário (não é compromisso)</div>
                  </div>
                </li>
              ) : cell.t === 'b' ? (
                <li key={`b-${cell.b.id}`}>
                  <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-left text-sm">
                    <div className="font-mono text-xs text-muted-foreground">
                      {cell.b.all_day
                        ? 'Dia inteiro'
                        : `${format(parseISO(cell.b.starts_at), 'HH:mm')} – ${format(
                            parseISO(cell.b.ends_at),
                            'HH:mm',
                          )}`}
                    </div>
                    <div className="font-medium">{cell.b.title}</div>
                    <div className="text-[10px] text-muted-foreground">Indisponível</div>
                  </div>
                </li>
              ) : (
                <li key={cell.ap.id}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-start border border-border/60 py-2 text-left"
                    onClick={() => {
                      onEventClick(cell.ap.id);
                      setDaySheet(null);
                    }}
                  >
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {format(parseISO(cell.ap.starts_at), 'HH:mm')} –{' '}
                        {format(parseISO(cell.ap.ends_at), 'HH:mm')}
                      </div>
                      <div className="font-medium">{cell.ap.title}</div>
                      {cell.ap.recurrence_series_id ? (
                        <div className="text-[10px] text-primary">Recorrente</div>
                      ) : null}
                      <div className="text-[10px] text-muted-foreground">
                        {appointmentAttendanceLabel(cell.ap.attendance_status)}
                      </div>
                      {appointmentPublicConfirmationLabel(cell.ap.public_confirmation_response ?? null) ? (
                        <div className="text-[10px] text-amber-700 dark:text-amber-300">
                          {appointmentPublicConfirmationLabel(cell.ap.public_confirmation_response ?? null)}
                        </div>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        {typeLabelByKey?.[cell.ap.type] ??
                          TYPE_OPTIONS.find((o) => o.value === cell.ap.type)?.label}
                      </div>
                    </div>
                  </Button>
                </li>
              )
              )
            )}
          </ul>
          {daySheet && canCreate ? (
            <div className="border-t border-border/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-3">
              <Button
                className="w-full"
                onClick={() => {
                  onDayEmptyClick(daySheet);
                  setDaySheet(null);
                }}
              >
                Novo compromisso neste dia
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
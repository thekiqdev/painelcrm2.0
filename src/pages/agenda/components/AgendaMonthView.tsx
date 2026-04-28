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
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/appointments';
import { TYPE_ACCENT, TYPE_OPTIONS } from '../agendaConstants';

const MAX_VISIBLE = 3;
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

type Props = {
  month: Date;
  items: Appointment[];
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

export function AgendaMonthView({
  month,
  items,
  isLoading,
  isMobile,
  onEventClick,
  onDayEmptyClick,
  onShowDayList,
  canCreate,
}: Props) {
  const [daySheet, setDaySheet] = useState<Date | null>(null);

  const { days, byDay } = useMemo(() => {
    const ms = startOfMonth(month);
    const me = endOfMonth(month);
    const gridStart = startOfWeek(ms, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(me, { weekStartsOn: 1 });
    const dayList = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const m = new Map<string, Appointment[]>();
    for (const a of items) {
      const k = format(parseISO(a.starts_at), 'yyyy-MM-dd');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return { days: dayList, byDay: m };
  }, [month, items]);

  const daySheetList = useMemo(() => {
    if (!daySheet) return [];
    return byDay.get(dayKey(daySheet)) ?? [];
  }, [daySheet, byDay]);

  if (isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  const openDay = (d: Date, dayItems: Appointment[]) => {
    if (isMobile && dayItems.length > 0) {
      setDaySheet(d);
    } else if (dayItems.length > MAX_VISIBLE) {
      onShowDayList(d);
    }
  };

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border/80">
        <div className="min-w-[320px]">
          <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20 text-center text-[10px] font-medium text-muted-foreground sm:text-xs">
            {weekdays.map((w) => (
              <div key={w} className="px-0.5 py-1.5 sm:px-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-[10px] sm:text-xs">
            {days.map((d) => {
              const k = dayKey(d);
              const inMonth = isSameMonth(d, month);
              const t = isToday(d);
              const list = byDay.get(k) ?? [];
              const visible = list.slice(0, MAX_VISIBLE);
              const more = list.length - visible.length;

              return (
                <div
                  key={k}
                  className={cn(
                    'min-h-[4.5rem] border-b border-r border-border/50 p-0.5 sm:min-h-[5.5rem] sm:p-1',
                    !inMonth && 'bg-muted/15 text-muted-foreground/50',
                    t && inMonth && 'bg-primary/5',
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      'mb-0.5 flex w-full items-center justify-center rounded-md py-0.5 text-xs font-medium sm:mb-1',
                      t ? 'text-primary' : inMonth ? 'text-foreground' : 'text-muted-foreground',
                    )}
                    onClick={() => {
                      if (list.length === 0) onDayEmptyClick(d);
                      else openDay(d, list);
                    }}
                  >
                    {format(d, 'd')}
                  </button>
                  {visible.length > 0
                    ? visible.map((ap) => (
                        <button
                          key={ap.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(ap.id);
                          }}
                          className={cn(
                            'mb-0.5 w-full rounded border-l-2 px-0.5 py-0.5 text-left text-[9px] leading-tight transition-colors sm:text-[10px]',
                            'hover:bg-muted/60',
                            TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other,
                          )}
                        >
                          <span className="font-mono text-muted-foreground">
                            {format(parseISO(ap.starts_at), 'HH:mm')}
                          </span>{' '}
                          <span className="line-clamp-1 font-medium text-foreground">{ap.title}</span>
                        </button>
                      ))
                    : null}
                  {more > 0 ? (
                    <button
                      type="button"
                      className="mt-0.5 w-full text-[9px] font-medium text-primary hover:underline sm:text-[10px]"
                      onClick={() => (isMobile ? setDaySheet(d) : onShowDayList(d))}
                    >
                      +{more} {more === 1 ? 'compromisso' : 'compromissos'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Sheet open={daySheet != null} onOpenChange={(o) => !o && setDaySheet(null)}>
        <SheetContent side="bottom" className="max-h-[min(80vh,32rem)]">
          <SheetHeader>
            <SheetTitle>
              {daySheet
                ? format(daySheet, "d 'de' MMMM", { locale: ptBR })
                : ''}
            </SheetTitle>
          </SheetHeader>
          <ul className="mt-2 space-y-1 overflow-y-auto pr-1">
            {daySheetList.map((ap) => (
              <li key={ap.id}>
                <Button
                  variant="ghost"
                  className="h-auto w-full justify-start border border-border/60 py-2 text-left"
                  onClick={() => {
                    onEventClick(ap.id);
                    setDaySheet(null);
                  }}
                >
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {format(parseISO(ap.starts_at), 'HH:mm')} –{' '}
                      {format(parseISO(ap.ends_at), 'HH:mm')}
                    </div>
                    <div className="font-medium">{ap.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {TYPE_OPTIONS.find((o) => o.value === ap.type)?.label}
                    </div>
                  </div>
                </Button>
              </li>
            ))}
          </ul>
          {daySheet && canCreate ? (
            <Button
              className="mt-2 w-full"
              onClick={() => {
                onDayEmptyClick(daySheet);
                setDaySheet(null);
              }}
            >
              Novo compromisso neste dia
            </Button>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
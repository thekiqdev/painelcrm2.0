import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO, addDays, startOfWeek, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Video, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/appointments';
import type { AvailabilityBlock } from '@/services/appointmentAvailabilityBlocks';
import type { AppointmentHolidayApi } from '@/services/appointmentHolidays';
import { ClientEntityLink } from '@/components/entities';
import {
  TYPE_ACCENT,
  TYPE_BAR,
  WEEK_VIEW_FALLBACK_HOUR_END,
  WEEK_VIEW_FALLBACK_HOUR_START,
  appointmentAttendanceLabel,
  appointmentPublicConfirmationLabel,
  syncPill,
} from '../agendaConstants';
import { getWeekVisibleHours } from '../weekViewHours';

function dayKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function createLayoutHelpers(viewStartMin: number, viewEndMinExclusive: number) {
  const VIEW_RANGE = Math.max(1, viewEndMinExclusive - viewStartMin);

  function eventLayout(apt: Appointment, day: Date): { topPct: number; heightPct: number } | null {
    const s = parseISO(apt.starts_at);
    const e = parseISO(apt.ends_at);
    if (format(s, 'yyyy-MM-dd') !== format(day, 'yyyy-MM-dd')) return null;
    let startM = s.getHours() * 60 + s.getMinutes();
    const endMRaw = e.getHours() * 60 + e.getMinutes();
    let endM = Math.max(endMRaw, startM + 15);
    if (endM <= viewStartMin || startM >= viewEndMinExclusive) return null;
    startM = Math.max(startM, viewStartMin);
    endM = Math.min(endM, viewEndMinExclusive);
    const topPct = ((startM - viewStartMin) / VIEW_RANGE) * 100;
    const heightPct = ((endM - startM) / VIEW_RANGE) * 100;
    return { topPct, heightPct: Math.max(heightPct, 1.1) };
  }

  function segmentLayout(
    startIso: string,
    endIso: string,
    day: Date,
    allDay: boolean,
  ): { topPct: number; heightPct: number } | null {
    const bs = parseISO(startIso);
    const be = parseISO(endIso);
    const d0 = startOfDay(day);
    const d1 = endOfDay(day);
    const segS = bs < d0 ? d0 : bs;
    const segE = be > d1 ? d1 : be;
    if (segE <= segS) return null;
    if (allDay) {
      return { topPct: 0, heightPct: 100 };
    }
    let startM = segS.getHours() * 60 + segS.getMinutes();
    const endMRaw = segE.getHours() * 60 + segE.getMinutes();
    let endM = Math.max(endMRaw, startM + 15);
    if (endM <= viewStartMin || startM >= viewEndMinExclusive) return null;
    startM = Math.max(startM, viewStartMin);
    endM = Math.min(endM, viewEndMinExclusive);
    const topPct = ((startM - viewStartMin) / VIEW_RANGE) * 100;
    const heightPct = ((endM - startM) / VIEW_RANGE) * 100;
    return { topPct, heightPct: Math.max(heightPct, 1.1) };
  }

  return { eventLayout, segmentLayout, VIEW_RANGE, viewStartMin, viewEndMinExclusive };
}

type MobileLane =
  | { k: 'ap'; ap: Appointment }
  | { k: 'b'; b: AvailabilityBlock }
  | { k: 'h'; h: AppointmentHolidayApi };

type Props = {
  weekStart: Date;
  items: Appointment[];
  blocks?: AvailabilityBlock[];
  holidays?: AppointmentHolidayApi[];
  isLoading: boolean;
  isMobile: boolean;
  onEventClick: (id: string) => void;
  onEmptyClick: (day: Date, suggestedStart: string, suggestedEnd: string) => void;
  /** Expediente (HH:mm) — usa fallback 07:00–22:00 se omitido. */
  workStartTime?: string;
  workEndTime?: string;
};

const SKELETON_HOUR_ROWS = 12;

function WeekGridSkeleton() {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/40 shadow-sm">
      <div className="flex min-w-[720px]">
        <div className="w-10 shrink-0 border-r border-border/50 bg-muted/10 pt-6">
          {Array.from({ length: SKELETON_HOUR_ROWS }).map((_, i) => (
            <div key={i} className="h-12 border-b border-transparent" />
          ))}
        </div>
        <div className="grid min-w-0 flex-1 animate-pulse grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'border-r border-border/40 last:border-r-0',
                i === 3 ? 'bg-primary/[0.04]' : 'bg-muted/10',
              )}
            >
              <div className="border-b border-border/50 bg-muted/25 py-2">
                <div className="mx-auto h-3 w-7 rounded bg-muted-foreground/20" />
              </div>
              <div
                className="bg-gradient-to-b from-muted/20 to-transparent"
                style={{ height: `${SKELETON_HOUR_ROWS * 3}rem` }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WeekMobileSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="-mx-1 flex gap-2 overflow-hidden px-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-14 w-[3.75rem] shrink-0 animate-pulse rounded-2xl bg-muted/45" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted/35" />
    </div>
  );
}

export function AgendaWeekView({
  weekStart,
  items,
  blocks = [],
  holidays = [],
  isLoading,
  isMobile,
  onEventClick,
  onEmptyClick,
  workStartTime,
  workEndTime,
}: Props) {
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    if (isMobile) return;
    const t = window.setInterval(() => setNowTick(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, [isMobile]);

  const resolvedOfficeStart =
    workStartTime ?? `${String(WEEK_VIEW_FALLBACK_HOUR_START).padStart(2, '0')}:00`;
  const resolvedOfficeEnd =
    workEndTime ?? `${String(WEEK_VIEW_FALLBACK_HOUR_END).padStart(2, '0')}:00`;

  const visibleHours = useMemo(
    () =>
      getWeekVisibleHours({
        workStartTime: resolvedOfficeStart,
        workEndTime: resolvedOfficeEnd,
        weekAnchor: weekStart,
        appointments: items,
        blocks,
      }),
    [resolvedOfficeStart, resolvedOfficeEnd, weekStart, items, blocks],
  );

  const { eventLayout, segmentLayout, VIEW_RANGE, viewStartMin, viewEndMinExclusive } = useMemo(
    () =>
      createLayoutHelpers(visibleHours.viewStartMin, visibleHours.viewEndMinExclusive),
    [visibleHours.viewStartMin, visibleHours.viewEndMinExclusive],
  );

  const hourLabels = useMemo(() => {
    const out: number[] = [];
    for (let h = visibleHours.startHour; h <= visibleHours.endHourInclusive; h++) {
      out.push(h);
    }
    return out;
  }, [visibleHours.startHour, visibleHours.endHourInclusive]);

  const gridHeightRem = hourLabels.length * 3;

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(weekStart, { weekStartsOn: 1 }), i)),
    [weekStart],
  );

  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const d of days) {
      m.set(dayKey(d), []);
    }
    for (const a of items) {
      const k = format(parseISO(a.starts_at), 'yyyy-MM-dd');
      if (!m.has(k)) continue;
      m.get(k)!.push(a);
    }
    for (const arr of m.values()) {
      arr.sort((x, y) => x.starts_at.localeCompare(y.starts_at));
    }
    return m;
  }, [items, days]);

  const mobileLanesByDay = useMemo(() => {
    const m = new Map<string, MobileLane[]>();
    for (const d of days) {
      const k = dayKey(d);
      const d0 = startOfDay(d);
      const d1 = endOfDay(d);
      const lanes: MobileLane[] = [];
      for (const a of items) {
        if (format(parseISO(a.starts_at), 'yyyy-MM-dd') === k) lanes.push({ k: 'ap', ap: a });
      }
      for (const b of blocks) {
        const bs = parseISO(b.starts_at);
        const be = parseISO(b.ends_at);
        if (be > d0 && bs < d1) lanes.push({ k: 'b', b });
      }
      for (const h of holidays) {
        if ((h.display_date ?? h.holiday_date).slice(0, 10) === k) {
          lanes.push({ k: 'h', h });
        }
      }
      lanes.sort((x, y) => {
        const sa =
          x.k === 'ap' ? x.ap.starts_at : x.k === 'b' ? x.b.starts_at : `${k}T00:00:00.000Z`;
        const sb =
          y.k === 'ap' ? y.ap.starts_at : y.k === 'b' ? y.b.starts_at : `${k}T00:00:00.000Z`;
        return sa.localeCompare(sb);
      });
      m.set(k, lanes);
    }
    return m;
  }, [days, items, blocks, holidays]);

  const [mobileSelectedDay, setMobileSelectedDay] = useState<Date | null>(null);
  useEffect(() => {
    if (!isMobile) return;
    const today = new Date();
    const tk = dayKey(today);
    const hit = days.find((d) => dayKey(d) === tk);
    setMobileSelectedDay(hit ?? days[0] ?? null);
  }, [isMobile, days]);

  const blocksOverlappingDay = useCallback((d: Date) => {
    const d0 = startOfDay(d);
    const d1 = endOfDay(d);
    return blocks.filter((b) => {
      const bs = parseISO(b.starts_at);
      const be = parseISO(b.ends_at);
      return be > d0 && bs < d1;
    });
  }, [blocks]);

  const onColumnClick = useCallback(
    (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
      const t = e.currentTarget;
      const y = e.clientY - t.getBoundingClientRect().top;
      const h = t.offsetHeight;
      const ratio = Math.max(0, Math.min(1, y / h));
      const range = viewEndMinExclusive - viewStartMin;
      const mins = Math.round((viewStartMin + ratio * range) / 15) * 15;
      const clamped = Math.max(viewStartMin, Math.min(viewEndMinExclusive - 1, mins));
      const sh = Math.floor(clamped / 60);
      const sm = clamped % 60;
      const endCandidate = clamped + 60;
      const em = Math.min(endCandidate, viewEndMinExclusive - 1);
      const eh = Math.floor(em / 60);
      const emin = em % 60;
      onEmptyClick(
        day,
        `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
        `${String(eh).padStart(2, '0')}:${String(emin).padStart(2, '0')}`,
      );
    },
    [onEmptyClick, viewStartMin, viewEndMinExclusive],
  );

  if (isLoading) {
    if (!isMobile) {
      return <WeekGridSkeleton />;
    }
    return <WeekMobileSkeleton />;
  }

  if (isMobile) {
    const activeDay = mobileSelectedDay ?? days[0]!;
    const ak = dayKey(activeDay);
    const list = mobileLanesByDay.get(ak) ?? [];
    const isToday = ak === dayKey(new Date());

    return (
      <div className="space-y-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
          {days.map((d) => {
            const k = dayKey(d);
            const sel = k === ak;
            const isDowToday = k === dayKey(new Date());
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMobileSelectedDay(d)}
                className={cn(
                  'flex min-w-[3.75rem] shrink-0 snap-center flex-col items-center justify-center rounded-2xl border px-2.5 py-2 text-center transition-colors touch-manipulation',
                  sel
                    ? 'border-primary bg-primary/12 shadow-sm'
                    : 'border-border/60 bg-card/50 active:bg-muted/50',
                  isDowToday && !sel && 'ring-1 ring-primary/25',
                )}
              >
                <span className="text-[10px] font-semibold uppercase leading-none text-muted-foreground">
                  {format(d, 'EEE', { locale: ptBR })}
                </span>
                <span className={cn('mt-0.5 text-lg font-bold tabular-nums', sel && 'text-primary')}>
                  {format(d, 'd', { locale: ptBR })}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className={cn(
            'rounded-xl border p-2.5',
            isToday ? 'border-primary/30 bg-primary/5' : 'border-border/70 bg-card/30',
          )}
        >
          <p className="text-xs font-semibold capitalize text-foreground">
            {format(activeDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
          {list.length === 0 ? (
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-dashed border-border/80 py-2.5 text-xs text-muted-foreground hover:bg-muted/40"
              onClick={() => onEmptyClick(activeDay, '09:00', '10:00')}
            >
              Sem compromissos — toque para agendar
            </button>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {list.map((lane) =>
                lane.k === 'h' ? (
                  <li key={`h-${lane.h.id}-${(lane.h.display_date ?? lane.h.holiday_date).slice(0, 10)}`}>
                    <div
                      className={cn(
                        'w-full rounded-md border border-amber-500/35 bg-amber-500/[0.07] px-2 py-1.5 text-left text-sm',
                      )}
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                        Feriado
                      </div>
                      <div className="line-clamp-2 font-medium leading-tight text-foreground">{lane.h.name}</div>
                      <div className="text-[10px] text-muted-foreground">Indicação — não é compromisso</div>
                    </div>
                  </li>
                ) : lane.k === 'b' ? (
                  <li key={`b-${lane.b.id}`}>
                    <div
                      className={cn(
                        'w-full rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-2 py-1.5 text-left text-sm',
                      )}
                    >
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {lane.b.all_day
                          ? 'Dia inteiro'
                          : `${format(parseISO(lane.b.starts_at), 'HH:mm')} – ${format(
                              parseISO(lane.b.ends_at),
                              'HH:mm',
                            )}`}
                      </div>
                      <div className="line-clamp-1 font-medium leading-tight">{lane.b.title}</div>
                      <div className="text-[10px] text-muted-foreground">Indisponível</div>
                    </div>
                  </li>
                ) : (
                  <li key={lane.ap.id}>
                    <div
                      className={cn(
                        'w-full overflow-hidden rounded-md border text-left text-sm transition-colors',
                        'border-l-2',
                        TYPE_ACCENT[lane.ap.type] ?? TYPE_ACCENT.other,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onEventClick(lane.ap.id)}
                        className="w-full px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {format(parseISO(lane.ap.starts_at), 'HH:mm')} –{' '}
                          {format(parseISO(lane.ap.ends_at), 'HH:mm')}
                        </div>
                        <div className="line-clamp-1 font-medium leading-tight">{lane.ap.title}</div>
                        {lane.ap.recurrence_series_id ? (
                          <div className="text-[10px] text-primary">Recorrente</div>
                        ) : null}
                        <div className="text-[10px] text-muted-foreground">
                          {appointmentAttendanceLabel(lane.ap.attendance_status)}
                        </div>
                        {appointmentPublicConfirmationLabel(lane.ap.public_confirmation_response ?? null) ? (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300">
                            {appointmentPublicConfirmationLabel(lane.ap.public_confirmation_response ?? null)}
                          </div>
                        ) : null}
                      </button>
                      {lane.ap.client_id ? (
                        <div className="flex min-w-0 items-center gap-1 border-t border-border/50 bg-muted/15 px-2 py-1 text-[11px] text-muted-foreground">
                          <User className="h-3 w-3 shrink-0 opacity-70" />
                          <ClientEntityLink
                            clientId={lane.ap.client_id}
                            name={lane.ap.client_name}
                            disabledFallbackText="Cliente"
                            variant="compact"
                            className="min-w-0"
                          />
                        </div>
                      ) : lane.ap.client_name || lane.ap.lead_name ? (
                        <div className="line-clamp-1 border-t border-border/50 bg-muted/15 px-2 py-1 text-[11px] text-muted-foreground">
                          {lane.ap.client_name ?? `Lead: ${lane.ap.lead_name}`}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    );
  }

  const nowKey = dayKey(new Date());
  const nowMinutes = nowTick.getHours() * 60 + nowTick.getMinutes();
  const showNowLine = nowMinutes >= viewStartMin && nowMinutes < viewEndMinExclusive;
  const nowTopPct = showNowLine ? ((nowMinutes - viewStartMin) / VIEW_RANGE) * 100 : 0;

  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/30 shadow-sm">
        <div className="flex min-w-[720px]">
          <div className="w-10 shrink-0 border-r border-border/50 bg-muted/10 pt-6">
            {hourLabels.map((h) => (
              <div
                key={h}
                className="h-12 border-b border-transparent pr-1 text-right text-[10px] tabular-nums text-muted-foreground"
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-7 border-l border-border/30">
            {days.map((d) => {
              const k = dayKey(d);
              const isTodayCol = k === nowKey;
              const dayEvents = (byDay.get(k) ?? []).filter((a) => eventLayout(a, d) != null);
              const dayBlocks = blocksOverlappingDay(d).filter(
                (b) => segmentLayout(b.starts_at, b.ends_at, d, b.all_day) != null,
              );
              const dayHolidays = holidays.filter(
                (h) => (h.display_date ?? h.holiday_date).slice(0, 10) === k,
              );
              return (
                <div
                  key={k}
                  className={cn(
                    'relative border-r border-border/40 last:border-r-0',
                    isTodayCol && 'bg-primary/[0.06] ring-1 ring-inset ring-primary/15',
                  )}
                >
                  <div
                    className={cn(
                      'sticky top-0 z-10 border-b border-border/50 bg-background/95 py-1.5 text-center text-[10px] font-medium leading-tight backdrop-blur-sm',
                      isTodayCol && 'bg-primary/[0.07]',
                    )}
                  >
                    <div className="text-muted-foreground">{format(d, 'EEE', { locale: ptBR })}</div>
                    <div className={cn('text-sm tabular-nums', isTodayCol && 'font-bold text-primary')}>
                      {format(d, 'd', { locale: ptBR })}
                    </div>
                  </div>
                  {dayHolidays.length > 0 ? (
                    <div className="space-y-1 border-b border-amber-500/25 bg-amber-500/[0.06] px-1 py-1.5">
                      {dayHolidays.map((h) => (
                        <div
                          key={`${h.id}-${(h.display_date ?? h.holiday_date).slice(0, 10)}`}
                          className="rounded-md border border-amber-500/30 px-1 py-0.5 text-center text-[10px] leading-tight"
                        >
                          <div className="font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                            Feriado
                          </div>
                          <div className="font-medium text-foreground">{h.name}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className="relative cursor-pointer"
                    style={{ height: `${gridHeightRem}rem` }}
                    role="presentation"
                    onClick={(e) => onColumnClick(d, e)}
                  >
                    {hourLabels.map((h) => (
                      <div
                        key={h}
                        className="h-12 border-b border-dashed border-border/20"
                        aria-hidden
                      />
                    ))}
                    {isTodayCol && showNowLine ? (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-[19]"
                        style={{ top: `${nowTopPct}%` }}
                        aria-hidden
                      >
                        <div className="relative -mt-px border-t-2 border-primary/80 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] dark:border-primary/70" />
                        <div className="absolute -left-0.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-primary shadow-sm ring-2 ring-background" />
                      </div>
                    ) : null}
                    {dayBlocks.map((b) => {
                      const L = segmentLayout(b.starts_at, b.ends_at, d, b.all_day);
                      if (!L) return null;
                      return (
                        <div
                          key={b.id}
                          className={cn(
                            'pointer-events-none absolute left-1 right-1 z-[2] overflow-hidden rounded-md border border-dashed border-muted-foreground/45 bg-muted/45 p-0.5 text-left',
                            'text-[10px] leading-tight text-muted-foreground',
                          )}
                          style={{ top: `${L.topPct}%`, height: `${L.heightPct}%` }}
                        >
                          <div className="font-mono text-[9px] opacity-80">
                            {b.all_day ? 'Dia inteiro' : format(parseISO(b.starts_at), 'HH:mm')}
                          </div>
                          <div className="line-clamp-2 font-medium text-foreground">{b.title}</div>
                          <div className="text-[8px] uppercase tracking-wide">Indisponível</div>
                        </div>
                      );
                    })}
                    {dayEvents.map((ap) => {
                      const L = eventLayout(ap, d);
                      if (!L) return null;
                      const sp = syncPill(ap);
                      const publicConfirmationLabel = appointmentPublicConfirmationLabel(
                        ap.public_confirmation_response ?? null,
                      );
                      const compact = L.heightPct < 7;
                      const bar = TYPE_BAR[ap.type] ?? TYPE_BAR.other;
                      return (
                        <div
                          key={ap.id}
                          className={cn(
                            'absolute left-1 right-1 z-[3] flex overflow-hidden rounded-md border border-border/65 bg-background/95 text-left shadow-sm transition-all duration-150',
                            'hover:z-[4] hover:border-primary/35 hover:shadow-md',
                            TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other,
                          )}
                          style={{ top: `${L.topPct}%`, height: `${L.heightPct}%` }}
                        >
                          <div className={cn('w-0.5 shrink-0', bar)} aria-hidden />
                          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                            <div
                              role="button"
                              tabIndex={0}
                              className="min-h-0 flex-1 cursor-pointer overflow-hidden p-0.5 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onEventClick(ap.id);
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter' || ev.key === ' ') {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  onEventClick(ap.id);
                                }
                              }}
                            >
                              {compact ? (
                                <div className="truncate font-mono text-[10px] leading-tight">
                                  <span className="text-muted-foreground">{format(parseISO(ap.starts_at), 'HH:mm')}</span>{' '}
                                  <span className="font-semibold text-foreground">{ap.title}</span>
                                </div>
                              ) : (
                                <>
                                  <div className="font-mono text-[9px] font-medium text-muted-foreground">
                                    {format(parseISO(ap.starts_at), 'HH:mm')}
                                  </div>
                                  <div className="line-clamp-2 font-semibold leading-snug text-foreground">{ap.title}</div>
                                  {ap.recurrence_series_id ? (
                                    <div className="text-[8px] text-primary">Recorrente</div>
                                  ) : null}
                                  <div className="line-clamp-1 text-[8px] text-muted-foreground">
                                    {appointmentAttendanceLabel(ap.attendance_status)}
                                    {publicConfirmationLabel ? ` · ${publicConfirmationLabel}` : ''}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-0.5">
                                    {ap.google_meet_link ? (
                                      <span className="inline-flex items-center gap-0.5 rounded bg-sky-100/80 px-0.5 text-[8px] text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                                        <Video className="h-2 w-2" />
                                        Meet
                                      </span>
                                    ) : null}
                                    {ap.create_google_event && ap.sync_status === 'synced' ? (
                                      <span className="text-[8px] text-sky-700 dark:text-sky-300">Google</span>
                                    ) : null}
                                    {sp.key === 'error' ? (
                                      <span className="text-[8px] font-medium text-amber-800 dark:text-amber-200">Erro</span>
                                    ) : null}
                                  </div>
                                </>
                              )}
                            </div>
                            {!compact && ap.client_id ? (
                              <div
                                className="shrink-0 border-t border-border/45 bg-background/95 px-1 py-0.5"
                                onClick={(ev) => ev.stopPropagation()}
                                onKeyDown={(ev) => ev.stopPropagation()}
                              >
                                <ClientEntityLink
                                  clientId={ap.client_id}
                                  name={ap.client_name}
                                  disabledFallbackText="Cliente"
                                  variant="compact"
                                  className="text-[9px] leading-tight"
                                />
                              </div>
                            ) : !compact && (ap.client_name || ap.lead_name) && !ap.client_id ? (
                              <div className="line-clamp-1 shrink-0 border-t border-border/45 bg-background/95 px-1 py-0.5 text-[9px] text-muted-foreground">
                                {ap.client_name ?? ap.lead_name}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="hidden flex-col gap-0.5 px-0.5 text-[11px] leading-snug text-muted-foreground md:flex md:flex-row md:flex-wrap md:items-baseline md:gap-x-4 md:gap-y-0">
        <span>
          Expediente: {visibleHours.officeDisplayStart}–{visibleHours.officeDisplayEnd}
        </span>
        {visibleHours.expandedBeyondAvailability ? (
          <span className="text-amber-800/95 dark:text-amber-200/95">
            Exibindo horários fora do expediente por haver compromissos agendados.
          </span>
        ) : null}
      </div>
    </div>
  );
}

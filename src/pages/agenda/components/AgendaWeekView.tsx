import React, { useCallback, useMemo } from 'react';
import { format, parseISO, addDays, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/appointments';
import {
  TYPE_ACCENT,
  WEEK_VIEW_HOUR_START,
  WEEK_VIEW_HOUR_END,
  syncPill,
} from '../agendaConstants';

const VIEW_START_MIN = WEEK_VIEW_HOUR_START * 60;
const VIEW_END_MIN = (WEEK_VIEW_HOUR_END + 1) * 60;
const VIEW_RANGE = VIEW_END_MIN - VIEW_START_MIN;

function dayKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function eventLayout(apt: Appointment, day: Date): { topPct: number; heightPct: number } | null {
  const s = parseISO(apt.starts_at);
  const e = parseISO(apt.ends_at);
  if (format(s, 'yyyy-MM-dd') !== format(day, 'yyyy-MM-dd')) return null;
  let startM = s.getHours() * 60 + s.getMinutes();
  const endMRaw = e.getHours() * 60 + e.getMinutes();
  let endM = Math.max(endMRaw, startM + 15);
  if (endM <= VIEW_START_MIN || startM >= VIEW_END_MIN) return null;
  startM = Math.max(startM, VIEW_START_MIN);
  endM = Math.min(endM, VIEW_END_MIN);
  const topPct = ((startM - VIEW_START_MIN) / VIEW_RANGE) * 100;
  const heightPct = ((endM - startM) / VIEW_RANGE) * 100;
  return { topPct, heightPct: Math.max(heightPct, 1.1) };
}

type Props = {
  weekStart: Date;
  items: Appointment[];
  isLoading: boolean;
  isMobile: boolean;
  onEventClick: (id: string) => void;
  onEmptyClick: (day: Date, suggestedStart: string, suggestedEnd: string) => void;
};

const HOURS = Array.from(
  { length: WEEK_VIEW_HOUR_END - WEEK_VIEW_HOUR_START + 1 },
  (_, i) => WEEK_VIEW_HOUR_START + i,
);

export function AgendaWeekView({ weekStart, items, isLoading, isMobile, onEventClick, onEmptyClick }: Props) {
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

  const onColumnClick = useCallback(
    (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
      const t = e.currentTarget;
      const y = e.clientY - t.getBoundingClientRect().top;
      const h = t.offsetHeight;
      const ratio = Math.max(0, Math.min(1, y / h));
      const mins = Math.round((VIEW_START_MIN + ratio * VIEW_RANGE) / 15) * 15;
      const sh = Math.floor(mins / 60);
      const sm = mins % 60;
      const em = Math.min(mins + 60, VIEW_END_MIN - 1);
      const eh = Math.floor(em / 60);
      const emin = em % 60;
      onEmptyClick(
        day,
        `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
        `${String(eh).padStart(2, '0')}:${String(emin).padStart(2, '0')}`,
      );
    },
    [onEmptyClick],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {days.map((d) => {
          const k = dayKey(d);
          const list = byDay.get(k) ?? [];
          const isToday = k === dayKey(new Date());
          return (
            <div
              key={k}
              className={cn(
                'rounded-lg border p-2.5',
                isToday ? 'border-primary/30 bg-primary/5' : 'border-border/70 bg-card/30',
              )}
            >
              <p className="text-xs font-semibold capitalize text-foreground">
                {format(d, "EEEE, d MMM", { locale: ptBR })}
              </p>
              {list.length === 0 ? (
                <button
                  type="button"
                  className="mt-2 w-full rounded-md border border-dashed border-border/80 py-2 text-xs text-muted-foreground hover:bg-muted/40"
                  onClick={() => onEmptyClick(d, '09:00', '10:00')}
                >
                  Sem compromissos — toque para agendar
                </button>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {list.map((ap) => (
                    <li key={ap.id}>
                      <button
                        type="button"
                        onClick={() => onEventClick(ap.id)}
                        className={cn(
                          'w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50',
                          'border-l-2',
                          TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other,
                        )}
                      >
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {format(parseISO(ap.starts_at), 'HH:mm')} – {format(parseISO(ap.ends_at), 'HH:mm')}
                        </div>
                        <div className="line-clamp-1 font-medium leading-tight">{ap.title}</div>
                        {ap.client_name || ap.lead_name ? (
                          <div className="line-clamp-1 text-[11px] text-muted-foreground">
                            {ap.client_name ?? `Lead: ${ap.lead_name}`}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/80 bg-card/20">
      <div className="flex min-w-[720px]">
        <div className="w-10 shrink-0 border-r border-border/60 bg-muted/10 pt-6">
          {HOURS.map((h) => (
            <div key={h} className="h-12 border-b border-transparent pr-1 text-right text-[10px] text-muted-foreground">
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-7 border-l border-border/40">
          {days.map((d) => {
            const k = dayKey(d);
            const isToday = k === dayKey(new Date());
            const dayEvents = (byDay.get(k) ?? []).filter((a) => eventLayout(a, d) != null);
            return (
              <div
                key={k}
                className={cn(
                  'relative border-r border-border/50 last:border-r-0',
                  isToday && 'bg-primary/5',
                )}
              >
                <div
                  className="sticky top-0 z-10 border-b border-border/60 bg-background/95 py-1 text-center text-[10px] font-medium leading-tight"
                >
                  <div className="text-muted-foreground">{format(d, 'EEE', { locale: ptBR })}</div>
                  <div className={cn('text-sm', isToday && 'font-bold text-primary')}>
                    {format(d, 'd', { locale: ptBR })}
                  </div>
                </div>
                <div
                  className="relative h-[48rem] cursor-pointer"
                  role="presentation"
                  onClick={(e) => onColumnClick(d, e)}
                >
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="h-12 border-b border-dashed border-border/30"
                      aria-hidden
                    />
                  ))}
                  {dayEvents.map((ap) => {
                    const L = eventLayout(ap, d);
                    if (!L) return null;
                    const sp = syncPill(ap);
                    return (
                      <button
                        key={ap.id}
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEventClick(ap.id);
                        }}
                        className={cn(
                          'absolute left-0.5 right-0.5 z-[1] overflow-hidden rounded border bg-background/95 p-0.5 text-left shadow-sm transition-colors hover:ring-1 hover:ring-primary/25',
                          'text-[10px] leading-tight',
                          TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other,
                        )}
                        style={{ top: `${L.topPct}%`, height: `${L.heightPct}%` }}
                      >
                        <div className="font-mono text-[9px] text-muted-foreground">
                          {format(parseISO(ap.starts_at), 'HH:mm')}
                        </div>
                        <div className="line-clamp-2 font-medium text-foreground">{ap.title}</div>
                        {ap.client_name || ap.lead_name ? (
                          <div className="line-clamp-1 text-[9px] text-muted-foreground">
                            {ap.client_name ?? ap.lead_name}
                          </div>
                        ) : null}
                        <div className="mt-0.5 flex flex-wrap gap-0.5">
                          {ap.google_meet_link ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-sky-100/80 px-0.5 text-[8px] text-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                              <Video className="h-2 w-2" />
                              Meet
                            </span>
                          ) : null}
                          {ap.create_google_event && ap.sync_status === 'synced' ? (
                            <span className="text-[8px] text-sky-700">Google</span>
                          ) : null}
                          {sp.key === 'error' ? <span className="text-[8px] text-amber-800">Sync</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

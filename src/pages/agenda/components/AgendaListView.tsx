import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ExternalLink, MoreHorizontal, RefreshCw, User, Video } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/appointments';
import type { AvailabilityBlock } from '@/services/appointmentAvailabilityBlocks';
import type { AppointmentHolidayApi } from '@/services/appointmentHolidays';
import { retryAppointmentSync } from '@/services/appointments';
import {
  TYPE_ACCENT,
  TYPE_BAR,
  TYPE_OPTIONS,
  appointmentStatusLabel,
  appointmentAttendanceLabel,
  appointmentAttendanceBadgeClass,
  appointmentPublicConfirmationLabel,
  appointmentPublicConfirmationBadgeClass,
  syncPill,
} from '../agendaConstants';

type ListLaneRow =
  | { kind: 'appointment'; ap: Appointment }
  | { kind: 'block'; block: AvailabilityBlock }
  | { kind: 'holiday'; holiday: AppointmentHolidayApi };

type Props = {
  items: Appointment[];
  blocks?: AvailabilityBlock[];
  holidays?: AppointmentHolidayApi[];
  /** Labels por `type_key` (API + fallback). */
  typeLabelByKey?: Record<string, string>;
  isLoading: boolean;
  canCreate: boolean;
  canRowEdit: (ap: Appointment) => boolean;
  onOpenNew: () => void;
  onOpenDetail: (id: string) => void;
  onCancel: (id: string) => void;
  onAfterRetry: () => void;
  onQuickReschedule?: (ap: Appointment) => void;
  onQuickComplete?: (ap: Appointment) => void;
  onQuickRequestConfirmation?: (ap: Appointment) => void;
  /** Lista mais compacta para telemóvel (não altera desktop). */
  compactMobile?: boolean;
};

function laneSortKey(row: ListLaneRow): string {
  if (row.kind === 'holiday') return `00:00:00-${row.holiday.name}`;
  if (row.kind === 'block') return format(parseISO(row.block.starts_at), 'HH:mm:ss');
  return format(parseISO(row.ap.starts_at), 'HH:mm:ss');
}

function ListSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      {[0, 1].map((sec) => (
        <div key={sec} className="space-y-2">
          <div className="h-3 w-40 animate-pulse rounded bg-muted/80" />
          <ul className="space-y-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex gap-0 overflow-hidden rounded-lg border border-border/60 bg-card/40"
              >
                <div className="w-1 shrink-0 bg-muted animate-pulse" />
                <div className="flex w-14 shrink-0 flex-col justify-center gap-1 border-r border-border/50 px-2 py-3">
                  <div className="mx-auto h-3 w-10 animate-pulse rounded bg-muted" />
                  <div className="mx-auto h-2 w-8 animate-pulse rounded bg-muted/70" />
                </div>
                <div className="min-w-0 flex-1 space-y-2 py-3 pl-3 pr-2">
                  <div className="h-4 w-[min(14rem,55%)] max-w-full animate-pulse rounded bg-muted" />
                  <div className="flex flex-wrap gap-1">
                    <div className="h-5 w-16 animate-pulse rounded-full bg-muted/70" />
                    <div className="h-5 w-14 animate-pulse rounded-full bg-muted/70" />
                    <div className="h-5 w-20 animate-pulse rounded-full bg-muted/70" />
                  </div>
                  <div className="h-3 w-48 animate-pulse rounded bg-muted/60" />
                </div>
                <div className="w-10 shrink-0 border-l border-border/40 bg-muted/10" />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ListSkeletonCompact() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1].map((sec) => (
        <div key={sec} className="space-y-2">
          <div className="h-2.5 w-32 animate-pulse rounded bg-muted/70" />
          <ul className="space-y-1.5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-lg bg-muted/35" />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AgendaListView({
  items,
  blocks = [],
  holidays = [],
  typeLabelByKey,
  isLoading,
  canCreate,
  onOpenNew,
  onOpenDetail,
  onCancel,
  onAfterRetry,
  canRowEdit,
  onQuickReschedule,
  onQuickComplete,
  onQuickRequestConfirmation,
  compactMobile = false,
}: Props) {
  const grouped = useMemo(() => {
    const m = new Map<string, ListLaneRow[]>();
    for (const a of items) {
      const k = format(parseISO(a.starts_at), 'yyyy-MM-dd');
      const g = m.get(k) ?? [];
      g.push({ kind: 'appointment', ap: a });
      m.set(k, g);
    }
    for (const b of blocks) {
      const k = format(parseISO(b.starts_at), 'yyyy-MM-dd');
      const g = m.get(k) ?? [];
      g.push({ kind: 'block', block: b });
      m.set(k, g);
    }
    for (const h of holidays) {
      const k = (h.display_date ?? h.holiday_date).slice(0, 10);
      const g = m.get(k) ?? [];
      g.push({ kind: 'holiday', holiday: h });
      m.set(k, g);
    }
    for (const g of m.values()) {
      g.sort((x, y) => laneSortKey(x).localeCompare(laneSortKey(y)));
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [items, blocks, holidays]);

  const retryMut = useMutation({
    mutationFn: (id: string) => retryAppointmentSync(id, false),
    onSuccess: () => onAfterRetry(),
  });

  if (isLoading) {
    return compactMobile ? <ListSkeletonCompact /> : <ListSkeleton />;
  }

  if (grouped.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/10 px-5 text-center',
          compactMobile ? 'py-12' : 'gap-3 px-6 py-16',
        )}
      >
        <CalendarDays className={cn('text-muted-foreground/80', compactMobile ? 'h-8 w-8' : 'h-10 w-10')} />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {compactMobile ? 'Sem compromissos' : 'Nenhum compromisso neste período.'}
          </p>
          <p className="text-xs text-muted-foreground">
            {compactMobile ? 'Toque em + para agendar' : 'Crie um compromisso ou ajuste os filtros.'}
          </p>
        </div>
        {canCreate && !compactMobile ? (
          <Button size="sm" className="gap-1.5" onClick={onOpenNew}>
            + Novo compromisso
          </Button>
        ) : null}
      </div>
    );
  }

  const renderHolidayCard = (h: AppointmentHolidayApi) => (
    <li key={`holiday-${h.id}-${(h.display_date ?? h.holiday_date).slice(0, 10)}`}>
      <div
        className={cn(
          'flex overflow-hidden rounded-lg border border-amber-500/30 bg-amber-500/[0.07] transition-colors',
          'hover:border-amber-500/45',
        )}
      >
        <div className="w-1 shrink-0 bg-amber-500/70" />
        <div className="flex min-h-[3.25rem] min-w-0 flex-1 items-center gap-2 px-2.5 py-2 sm:px-3">
          <Badge
            variant="outline"
            className="h-5 shrink-0 border-amber-500/45 px-1.5 text-[10px] font-medium text-amber-950 dark:text-amber-100"
          >
            Feriado
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{h.name}</p>
            <p className="text-[11px] text-muted-foreground">Referência no calendário — não é compromisso.</p>
          </div>
        </div>
      </div>
    </li>
  );

  const renderBlockCard = (b: AvailabilityBlock) => (
    <li key={`block-${b.id}`}>
      <div
        className={cn(
          'flex overflow-hidden rounded-lg border border-dashed border-muted-foreground/35 bg-muted/20 transition-colors',
          'hover:bg-muted/30',
        )}
      >
        <div className="w-1 shrink-0 bg-muted-foreground/45" />
        <div className="flex w-[3.25rem] shrink-0 flex-col items-center justify-center border-r border-border/50 bg-muted/25 px-1 py-2">
          <span className="text-center text-xs font-semibold tabular-nums text-foreground">
            {b.all_day ? '—' : format(parseISO(b.starts_at), 'HH:mm')}
          </span>
          <span className="text-[9px] text-muted-foreground">{b.all_day ? 'dia' : 'até'}</span>
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            {b.all_day ? '⋅' : format(parseISO(b.ends_at), 'HH:mm')}
          </span>
        </div>
        <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground sm:line-clamp-1">{b.title}</p>
            <Badge variant="outline" className="h-5 border-dashed px-1.5 text-[10px] font-normal">
              Indisponível
            </Badge>
          </div>
          {b.description ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{b.description}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {b.block_scope === 'tenant' ? 'Empresa — todos os responsáveis' : 'Bloqueio do utilizador'}
          </p>
        </div>
      </div>
    </li>
  );

  return (
    <div className={cn(compactMobile ? 'space-y-4' : 'space-y-6')}>
      {grouped.map(([day, rows]) => (
        <section key={day} className="space-y-2">
          <h2
            className={cn(
              compactMobile
                ? 'sticky top-0 z-[1] -mx-1 border-b border-border/50 bg-background/95 py-2 pl-1 text-[11px] font-bold uppercase tracking-wide text-foreground backdrop-blur-sm'
                : 'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
            )}
          >
            {compactMobile
              ? format(parseISO(`${day}T12:00:00`), "EEEE '•' d MMM", { locale: ptBR })
              : format(parseISO(`${day}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
          <ul className={cn(compactMobile ? 'space-y-1.5' : 'space-y-2')}>
            {rows.map((row) => {
              if (row.kind === 'holiday') {
                const h = row.holiday;
                if (compactMobile) {
                  return (
                    <li key={`holiday-${h.id}-${(h.display_date ?? h.holiday_date).slice(0, 10)}`}>
                      <div className="flex min-h-[2.75rem] items-center gap-2 rounded-md border border-amber-500/35 bg-amber-500/[0.08] px-2.5 py-2">
                        <Badge
                          variant="outline"
                          className="h-5 shrink-0 border-amber-500/45 px-1.5 text-[10px] font-medium text-amber-950 dark:text-amber-100"
                        >
                          Feriado
                        </Badge>
                        <span className="min-w-0 truncate text-sm font-medium leading-tight">{h.name}</span>
                      </div>
                    </li>
                  );
                }
                return renderHolidayCard(h);
              }
              if (row.kind === 'block') {
                const b = row.block;
                if (compactMobile) {
                  return (
                    <li key={`block-${b.id}`}>
                      <div className="rounded-md border border-dashed border-muted-foreground/35 bg-muted/25 px-2.5 py-2">
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {b.all_day
                            ? 'Dia inteiro'
                            : `${format(parseISO(b.starts_at), 'HH:mm')} — ${format(parseISO(b.ends_at), 'HH:mm')}`}
                        </div>
                        <div className="line-clamp-1 text-sm font-medium leading-tight">{b.title}</div>
                        <div className="text-[10px] text-muted-foreground">Indisponível</div>
                      </div>
                    </li>
                  );
                }
                return renderBlockCard(b);
              }
              const ap = row.ap;
              const ce = canRowEdit(ap);
              const syncP = syncPill(ap);
              const publicConfirmationLabel = appointmentPublicConfirmationLabel(
                ap.public_confirmation_response ?? null,
              );
              const accent = TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other;
              const bar = TYPE_BAR[ap.type] ?? TYPE_BAR.other;
              const canQuick =
                ce && ap.status !== 'cancelled' && (onQuickReschedule || onQuickComplete || onQuickRequestConfirmation);
              const showRequestConf =
                ap.status === 'scheduled' &&
                (ap.attendance_status === 'pending' || ap.attendance_status === 'not_confirmed') &&
                onQuickRequestConfirmation;

              if (compactMobile) {
                const responsibleLine =
                  ap.responsible_name ||
                  ap.client_name ||
                  (ap.lead_name ? `Lead: ${ap.lead_name}` : null);
                return (
                  <li key={ap.id}>
                    <div
                      className={cn(
                        'relative flex items-stretch overflow-hidden rounded-lg border border-border/65 bg-card/90',
                        accent,
                      )}
                    >
                      <div className={cn('w-0.5 shrink-0 rounded-l-[1px]', bar)} aria-hidden />
                      <div className="flex shrink-0 flex-col justify-center border-r border-border/45 px-2 py-2 text-center">
                        <span className="text-[11px] font-semibold tabular-nums leading-none text-foreground">
                          {format(parseISO(ap.starts_at), 'HH:mm')}
                        </span>
                        <span className="text-[9px] text-muted-foreground">—</span>
                        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                          {format(parseISO(ap.ends_at), 'HH:mm')}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        onClick={() => void onOpenDetail(ap.id)}
                      >
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{ap.title}</p>
                        {responsibleLine ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{responsibleLine}</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
                            {appointmentStatusLabel(ap.status)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-5 px-1.5 text-[10px] font-normal',
                              appointmentAttendanceBadgeClass(ap.attendance_status),
                            )}
                          >
                            {appointmentAttendanceLabel(ap.attendance_status)}
                          </Badge>
                          {publicConfirmationLabel ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 max-w-[9rem] truncate px-1.5 text-[10px] font-normal',
                                appointmentPublicConfirmationBadgeClass(ap.public_confirmation_response ?? null),
                              )}
                            >
                              {publicConfirmationLabel}
                            </Badge>
                          ) : null}
                          {ap.recurrence_series_id ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-primary/35 px-1.5 text-[10px] font-normal text-primary"
                            >
                              Recorrente
                            </Badge>
                          ) : null}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0 border-l border-border/45 bg-muted/[0.06] pr-0.5">
                        {ap.sync_status === 'error' && ap.create_google_event && ce ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => retryMut.mutate(ap.id)}
                            disabled={retryMut.isPending}
                            aria-label="Retentar sincronização"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-9 w-9 text-muted-foreground hover:text-foreground"
                              aria-label="Mais opções"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {ap.sync_status === 'error' && ap.create_google_event && ce ? (
                              <DropdownMenuItem
                                onClick={() => retryMut.mutate(ap.id)}
                                disabled={retryMut.isPending}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Retentar sincronização
                              </DropdownMenuItem>
                            ) : null}
                            {canQuick && ap.status === 'scheduled' && onQuickReschedule ? (
                              <DropdownMenuItem onClick={() => onQuickReschedule(ap)}>Reagendar</DropdownMenuItem>
                            ) : null}
                            {canQuick && ap.status === 'scheduled' && onQuickComplete ? (
                              <DropdownMenuItem onClick={() => onQuickComplete(ap)}>Concluir</DropdownMenuItem>
                            ) : null}
                            {showRequestConf ? (
                              <DropdownMenuItem onClick={() => onQuickRequestConfirmation!(ap)}>
                                Solicitar confirmação
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onClick={() => void onOpenDetail(ap.id)}>
                              {ce && ap.status !== 'cancelled' ? 'Editar' : 'Ver'}
                            </DropdownMenuItem>
                            {ce && ap.status !== 'cancelled' ? (
                              <DropdownMenuItem className="text-destructive" onClick={() => onCancel(ap.id)}>
                                Cancelar
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </li>
                );
              }

              return (
                <li key={ap.id}>
                  <div
                    className={cn(
                      'group/card relative flex overflow-hidden rounded-lg border border-border/70 bg-card transition-all duration-150',
                      'hover:border-border hover:shadow-sm md:hover:shadow-md',
                      accent,
                    )}
                  >
                    <div className={cn('w-1 shrink-0 rounded-l-[2px]', bar)} aria-hidden />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => void onOpenDetail(ap.id)}
                    >
                      <div className="flex w-[3.35rem] shrink-0 flex-col items-center justify-center border-r border-border/50 bg-muted/15 px-1 py-2">
                        <span className="text-sm font-semibold tabular-nums leading-none text-foreground">
                          {format(parseISO(ap.starts_at), 'HH:mm')}
                        </span>
                        <span className="mt-0.5 text-[9px] font-medium text-muted-foreground">até</span>
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">
                          {format(parseISO(ap.ends_at), 'HH:mm')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 px-2.5 py-2 sm:px-3 sm:py-2.5">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:line-clamp-1">
                          {ap.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="h-5 max-w-[9rem] truncate px-1.5 text-[10px] font-normal sm:max-w-none"
                          >
                            {typeLabelByKey?.[ap.type] ??
                              TYPE_OPTIONS.find((t) => t.value === ap.type)?.label ??
                              ap.type}
                          </Badge>
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
                            {appointmentStatusLabel(ap.status)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn('h-5 px-1.5 text-[10px] font-normal', appointmentAttendanceBadgeClass(ap.attendance_status))}
                          >
                            {appointmentAttendanceLabel(ap.attendance_status)}
                          </Badge>
                          {publicConfirmationLabel ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'h-5 px-1.5 text-[10px] font-normal',
                                appointmentPublicConfirmationBadgeClass(ap.public_confirmation_response ?? null),
                              )}
                            >
                              {publicConfirmationLabel}
                            </Badge>
                          ) : null}
                          {ap.recurrence_series_id ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-primary/35 px-1.5 text-[10px] font-normal text-primary"
                            >
                              Recorrente
                            </Badge>
                          ) : null}
                          <span
                            className={cn(
                              'inline-flex h-5 max-w-full items-center rounded-md border px-1.5 text-[10px] font-medium',
                              syncP.className,
                            )}
                          >
                            {syncP.label}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {ap.client_name ? (
                            <span className="inline-flex max-w-full items-center gap-1 truncate">
                              <User className="h-3 w-3 shrink-0 opacity-70" />
                              <span className="truncate">{ap.client_name}</span>
                            </span>
                          ) : null}
                          {ap.lead_name && !ap.client_name ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3 shrink-0 opacity-70" />
                              Lead: {ap.lead_name}
                            </span>
                          ) : null}
                          {ap.responsible_name ? (
                            <span className="text-muted-foreground/90">Resp. {ap.responsible_name}</span>
                          ) : null}
                        </div>
                        {ap.sync_status === 'error' && ap.create_google_event ? (
                          <p className="mt-1 text-[11px] text-amber-800/90 dark:text-amber-200/90">
                            Não foi possível sincronizar com o Google Agenda.
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {ap.google_meet_link ? (
                            <a
                              href={ap.google_meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Video className="h-3.5 w-3.5 shrink-0" />
                              Meet
                            </a>
                          ) : null}
                          {ap.google_html_link ? (
                            <a
                              href={ap.google_html_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              Google
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    {canQuick ? (
                      <div
                        className={cn(
                          'hidden shrink-0 flex-col justify-center gap-0.5 border-l border-border/50 bg-muted/[0.08] px-1 py-1.5 md:flex',
                          'opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100',
                        )}
                      >
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px] font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            void onOpenDetail(ap.id);
                          }}
                        >
                          Abrir
                        </Button>
                        {ap.status === 'scheduled' && onQuickReschedule ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickReschedule(ap);
                            }}
                          >
                            Reagendar
                          </Button>
                        ) : null}
                        {ap.status === 'scheduled' && onQuickComplete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickComplete(ap);
                            }}
                          >
                            Concluir
                          </Button>
                        ) : null}
                        {showRequestConf ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickRequestConfirmation(ap);
                            }}
                          >
                            Solicitar confirmação
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="flex shrink-0 flex-col items-end justify-center gap-1 border-l border-border/50 bg-muted/5 px-1 py-1 sm:px-1.5">
                      {ap.sync_status === 'error' && ap.create_google_event && ce ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-[10px] sm:text-xs"
                          onClick={() => retryMut.mutate(ap.id)}
                          disabled={retryMut.isPending}
                        >
                          <RefreshCw className="h-3 w-3 shrink-0" />
                          <span className="hidden min-[400px]:inline">Retentar</span>
                        </Button>
                      ) : null}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {ap.sync_status === 'error' && ap.create_google_event && ce ? (
                            <DropdownMenuItem
                              onClick={() => retryMut.mutate(ap.id)}
                              disabled={retryMut.isPending}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Retentar sincronização
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onClick={() => void onOpenDetail(ap.id)}>
                            {ce && ap.status !== 'cancelled' ? 'Editar' : 'Ver'}
                          </DropdownMenuItem>
                          {ce && ap.status !== 'cancelled' ? (
                            <DropdownMenuItem className="text-destructive" onClick={() => onCancel(ap.id)}>
                              Cancelar
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

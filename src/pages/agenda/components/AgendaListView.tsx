import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExternalLink, Loader2, MoreHorizontal, RefreshCw, User, Video } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarDays } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/services/appointments';
import { retryAppointmentSync } from '@/services/appointments';
import {
  TYPE_ACCENT,
  TYPE_OPTIONS,
  appointmentStatusLabel,
  appointmentAttendanceLabel,
  appointmentAttendanceBadgeClass,
  appointmentPublicConfirmationLabel,
  appointmentPublicConfirmationBadgeClass,
  syncPill,
} from '../agendaConstants';

type Props = {
  items: Appointment[];
  isLoading: boolean;
  canCreate: boolean;
  canRowEdit: (ap: Appointment) => boolean;
  onOpenNew: () => void;
  onOpenDetail: (id: string) => void;
  onCancel: (id: string) => void;
  onAfterRetry: () => void;
};

export function AgendaListView({
  items,
  isLoading,
  canCreate,
  onOpenNew,
  onOpenDetail,
  onCancel,
  onAfterRetry,
  canRowEdit,
}: Props) {
  const grouped = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of items) {
      const k = format(parseISO(a.starts_at), 'yyyy-MM-dd');
      const g = m.get(k) ?? [];
      g.push(a);
      m.set(k, g);
    }
    for (const g of m.values()) {
      g.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    }
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [items]);

  const retryMut = useMutation({
    mutationFn: (id: string) => retryAppointmentSync(id, false),
    onSuccess: () => onAfterRetry(),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        A carregar…
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Você ainda não possui compromissos nesse período.</p>
          {canCreate ? <Button onClick={onOpenNew}>Criar compromisso</Button> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {grouped.map(([day, rows]) => (
        <section key={day} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {format(parseISO(`${day}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </h2>
          <ul className="space-y-2">
            {rows.map((ap) => {
              const ce = canRowEdit(ap);
              const syncP = syncPill(ap);
              const publicConfirmationLabel = appointmentPublicConfirmationLabel(
                ap.public_confirmation_response ?? null,
              );
              const accent = TYPE_ACCENT[ap.type] ?? TYPE_ACCENT.other;
              return (
                <li key={ap.id}>
                  <Card
                    className={cn(
                      'group overflow-hidden border border-border/70 shadow-sm transition-colors',
                      'hover:border-border hover:bg-muted/20',
                      'border-l-4',
                      accent,
                    )}
                  >
                    <CardContent className="flex min-h-[4.5rem] gap-0 p-0 sm:min-h-0">
                      <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center border-r border-border/60 bg-muted/20 px-2 py-2.5 sm:py-3">
                        <span className="text-center text-sm font-semibold leading-none tabular-nums text-foreground">
                          {format(parseISO(ap.starts_at), 'HH:mm')}
                        </span>
                        <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">até</span>
                        <span className="text-center text-xs font-medium tabular-nums text-muted-foreground">
                          {format(parseISO(ap.ends_at), 'HH:mm')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 px-2.5 py-2.5 sm:px-3 sm:py-2.5">
                        <p className="line-clamp-2 font-medium leading-snug text-foreground sm:line-clamp-1">
                          {ap.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="h-5 max-w-[9rem] truncate px-1.5 text-[10px] font-normal sm:max-w-none"
                          >
                            {TYPE_OPTIONS.find((t) => t.value === ap.type)?.label ?? ap.type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
                          >
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
                              className="h-5 px-1.5 text-[10px] font-normal border-primary/40 text-primary"
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
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {ap.client_name ? (
                            <span className="inline-flex max-w-full items-center gap-1 truncate">
                              <User className="h-3 w-3 shrink-0" />
                              {ap.client_name}
                            </span>
                          ) : null}
                          {ap.lead_name && !ap.client_name ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Lead: {ap.lead_name}
                            </span>
                          ) : null}
                          {ap.responsible_name ? <span>Resp. {ap.responsible_name}</span> : null}
                        </div>
                        {ap.sync_status === 'error' && ap.create_google_event ? (
                          <p className="mt-1.5 text-[11px] text-muted-foreground">
                            Não foi possível sincronizar com o Google Agenda.
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {ap.google_meet_link ? (
                            <a
                              href={ap.google_meet_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
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
                            >
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                              Google
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end justify-center gap-1 border-l border-border/50 bg-muted/5 px-1.5 py-1.5 sm:px-2">
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
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => onCancel(ap.id)}
                              >
                                Cancelar
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

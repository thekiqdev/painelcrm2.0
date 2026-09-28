import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Video } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getClientAppointmentsForProfile, type Appointment } from '@/services/appointments';
import { TYPE_OPTIONS, appointmentAttendanceBadgeClass, appointmentAttendanceLabel, syncPill } from '@/pages/agenda/agendaConstants';

type Props = {
  clientId: string;
  /** agenda module + can view */
  enabled: boolean;
  canCreateAgenda: boolean;
};

function typeLabel(type: string) {
  return TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

function EventRow({ ap, onRowClick }: { ap: Appointment; onRowClick: (id: string) => void }) {
  const sp = syncPill(ap);
  return (
    <li>
      <button
        type="button"
        onClick={() => onRowClick(ap.id)}
        className="flex w-full flex-col gap-1 rounded-md border border-border/60 bg-card/30 px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/40"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            {format(parseISO(ap.starts_at), 'HH:mm')} – {format(parseISO(ap.ends_at), 'HH:mm')}
          </span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
            {typeLabel(ap.type)}
          </Badge>
          <Badge
            variant="outline"
            className={cn('h-5 px-1.5 text-[10px] font-normal', appointmentAttendanceBadgeClass(ap.attendance_status))}
          >
            {appointmentAttendanceLabel(ap.attendance_status)}
          </Badge>
          {ap.create_google_event ? (
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-medium',
                ap.sync_status === 'synced'
                  ? 'border-sky-200/80 bg-sky-50/80 text-sky-900 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-200'
                  : sp.className,
              )}
            >
              {ap.sync_status === 'synced' ? 'Google' : sp.label}
            </span>
          ) : null}
        </div>
        <span className="line-clamp-1 font-medium leading-tight text-foreground">{ap.title}</span>
        {ap.responsible_name ? (
          <span className="text-xs text-muted-foreground">Resp.: {ap.responsible_name}</span>
        ) : null}
        {ap.google_meet_link ? (
          <a
            href={ap.google_meet_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Video className="h-3 w-3" />
            Meet
          </a>
        ) : null}
      </button>
    </li>
  );
}

export function ClientUpcomingAppointments({ clientId, enabled, canCreateAgenda }: Props) {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['appointments', 'client', clientId] as const,
    queryFn: () => getClientAppointmentsForProfile(clientId),
    enabled: enabled && Boolean(clientId),
    staleTime: 30_000,
  });

  const upcoming = data?.upcoming ?? [];

  const goDetail = (id: string) => {
    navigate(`/agenda?appointment_id=${encodeURIComponent(id)}`);
  };

  return (
    <Card className="border-border/80 max-md:shadow-sm">
      <CardHeader className="pb-2 pt-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-semibold">Próximos compromissos</CardTitle>
          <Button variant="link" className="h-auto px-0 text-xs" asChild>
            <Link to={`/agenda?client_id=${encodeURIComponent(clientId)}`}>Ver todos</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isPending ? (
          <p className="text-xs text-muted-foreground">A carregar…</p>
        ) : isError ? (
          <p className="text-xs text-destructive">
            {error instanceof Error ? error.message : 'Erro ao carregar'}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => void refetch()}
            >
              Tentar de novo
            </button>
          </p>
        ) : upcoming.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Nenhum compromisso agendado</p>
            {canCreateAgenda ? (
              <Button size="sm" variant="outline" asChild>
                <Link
                  to={`/agenda?${new URLSearchParams({ client_id: clientId, new: '1' }).toString()}`}
                >
                  Agendar compromisso
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((ap) => (
              <EventRow key={ap.id} ap={ap} onRowClick={goDetail} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientAppointmentsForProfile, type Appointment } from '@/services/appointments';
import { appointmentAttendanceLabel, appointmentStatusLabel } from '@/pages/agenda/agendaConstants';

type Props = {
  clientId: string;
  enabled: boolean;
};

function statusClass(status: string) {
  if (status === 'done') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'cancelled') return 'text-muted-foreground line-through';
  return '';
}

function outcomeLabel(outcome: string | null | undefined): string {
  const map: Record<string, string> = {
    success: 'Sucesso',
    no_show: 'Não compareceu',
    rescheduled: 'Remarcado',
    needs_follow_up: 'Precisa follow-up',
    lost: 'Perdido',
    other: 'Outro',
  };
  if (!outcome) return '—';
  return map[outcome] ?? outcome;
}

export function ClientAppointmentsHistory({ clientId, enabled }: Props) {
  const navigate = useNavigate();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['appointments', 'client', clientId] as const,
    queryFn: () => getClientAppointmentsForProfile(clientId),
    enabled: enabled && Boolean(clientId),
    staleTime: 30_000,
  });

  const history = data?.history ?? [];

  return (
    <Card className="border-border/80 max-md:shadow-sm">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm font-semibold">Histórico de compromissos</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {isPending ? (
          <p className="text-xs text-muted-foreground">A carregar…</p>
        ) : isError ? (
          <p className="text-xs text-destructive">
            {error instanceof Error ? error.message : 'Erro ao carregar'}
            <button type="button" className="ml-2 underline" onClick={() => void refetch()}>
              Tentar de novo
            </button>
          </p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum compromisso concluído ou cancelado recentemente.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((ap: Appointment) => (
              <li key={ap.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/agenda?appointment_id=${encodeURIComponent(ap.id)}`)}
                  className="flex w-full flex-col gap-0.5 rounded-md border border-border/50 px-2.5 py-2 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(ap.starts_at), "d 'de' MMM 'de' yyyy", { locale: ptBR })} —{' '}
                    <span className="font-mono">
                      {format(parseISO(ap.starts_at), 'HH:mm')} – {format(parseISO(ap.ends_at), 'HH:mm')}
                    </span>
                  </span>
                  <span className="line-clamp-1 font-medium">{ap.title}</span>
                  <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span className={statusClass(ap.status)}>{appointmentStatusLabel(ap.status)}</span>
                    <span>{appointmentAttendanceLabel(ap.attendance_status)}</span>
                    {ap.responsible_name ? <span>Resp.: {ap.responsible_name}</span> : null}
                    {ap.status === 'done' ? <span>Resultado: {outcomeLabel(ap.outcome)}</span> : null}
                  </div>
                  {ap.status === 'done' && ap.completion_notes ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{ap.completion_notes}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckCircle2, ExternalLink, Loader2, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarStatus,
} from '@/services/googleCalendarIntegration';
import { useAuth } from '@/contexts/AuthContext';

export function GoogleCalendarSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isPending, refetch, isError } = useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: getGoogleCalendarStatus,
    enabled: !!user,
  });

  useEffect(() => {
    const raw = searchParams.get('google_calendar');
    if (!raw) return;
    if (raw === 'connected') {
      toast.success('Google Agenda conectado com sucesso.');
    } else if (raw === 'denied') {
      toast.error('Autorização Google cancelada ou negada.');
    } else if (raw === 'invalid' || raw === 'error') {
      toast.error('Não foi possível concluir a ligação com o Google.');
    } else if (raw === 'misconfigured' || raw === 'disabled') {
      toast.error('Integração Google indisponível neste ambiente.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('google_calendar');
    setSearchParams(next, { replace: true });
    void queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
  }, [searchParams, setSearchParams, queryClient]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const url = await getGoogleCalendarConnectUrl();
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao iniciar conexão'),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGoogleCalendar,
    onSuccess: async () => {
      toast.success('Google Agenda desconectado.');
      await queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao desconectar'),
  });

  if (isPending) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        A carregar estado da integração…
      </div>
    );
  }

  if (isError || !data?.enabled) {
    return (
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 opacity-80" aria-hidden />
            Google Agenda
          </CardTitle>
          <CardDescription>
            A integração nativa com o Google Calendar não está ativa neste servidor. Peça ao administrador para
            definir <code className="rounded bg-muted px-1 py-0.5 text-xs">ENABLE_GOOGLE_CALENDAR=true</code> e as
            credenciais OAuth.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const misconfigured = data.encryption_configured === false || data.oauth_configured === false;

  return (
    <Card className="border-border/80">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 opacity-80" aria-hidden />
              Google Agenda
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-xl">
              Conecte a sua conta Google para criar eventos, convites e reuniões com Meet a partir do PainelCRM (tokens
              ficam apenas no servidor, cifrados).
            </CardDescription>
          </div>
          {data.connected ? (
            <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600/90">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Google conectado
            </Badge>
          ) : (
            <Badge variant="secondary">Não conectado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {misconfigured ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            O servidor não tem todas as variáveis necessárias (OAuth Google e chave de cifra dos tokens). Contacte o
            suporte técnico.
          </p>
        ) : null}

        {data.connected && data.google_email ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Conta ligada</p>
            <p className="mt-1 text-muted-foreground">{data.google_email}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!data.connected ? (
            <Button
              type="button"
              onClick={() => connectMutation.mutate()}
              disabled={misconfigured || connectMutation.isPending}
              className="gap-2"
            >
              {connectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ExternalLink className="h-4 w-4" aria-hidden />
              )}
              Conectar Google Agenda
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Unplug className="h-4 w-4" aria-hidden />
              )}
              Desconectar
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void refetch()}>
            Atualizar estado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default GoogleCalendarSection;

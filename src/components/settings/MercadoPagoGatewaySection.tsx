/**
 * Configuração Mercado Pago — Fase 2: OAuth + status (isolado do fluxo Asaas).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, PlugZap, RefreshCw, Unplug, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';

const API_AVAILABILITY = '/api/integrations/mercado-pago/availability';
const API_CONNECT_URL = '/api/integrations/mercado-pago/connect-url';
const API_STATUS = '/api/integrations/mercado-pago/status';
const API_TEST = '/api/integrations/mercado-pago/test';
const API_DISCONNECT = '/api/integrations/mercado-pago/disconnect';

type Availability = {
  enabled: boolean;
  encryption_configured: boolean;
  oauth_state_configured: boolean;
  oauth_client_configured: boolean;
  oauth_environment?: 'sandbox' | 'production';
};

type Status = {
  connected: boolean;
  environment: 'sandbox' | 'production' | null;
  user_id: string | null;
  last_test_at: string | null;
  last_connection_status: string | null;
  config_status: string | null;
  is_active_gateway: boolean;
  encryption_configured: boolean;
  oauth_state_configured: boolean;
  feature_enabled?: boolean;
  oauth_client_configured?: boolean;
};

export const MercadoPagoGatewaySection: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [redirectingToMp, setRedirectingToMp] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await apiClient.get<Status>(API_STATUS);
    if (res.error) {
      const st = (res as { details?: { status?: number } }).details?.status;
      if (st === 404 || res.code === 'MERCADO_PAGO_DISABLED') {
        setStatus(null);
        return;
      }
      toast.error(res.error);
      return;
    }
    if (res.data) setStatus(res.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const a = await apiClient.get<Availability>(API_AVAILABILITY);
      if (cancelled) return;
      setAvailability(a.data ?? null);
      if (a.data?.enabled) await loadStatus();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStatus]);

  useEffect(() => {
    const oauth = searchParams.get('mp_oauth');
    if (!oauth) return;
    if (oauth === 'success') {
      toast.success('Mercado Pago conectado com sucesso.');
      void loadStatus();
    } else if (oauth === 'disabled') {
      toast.error('Integração Mercado Pago desativada no servidor.');
    } else {
      const msg = searchParams.get('mp_oauth_msg');
      toast.error(msg ? decodeURIComponent(msg) : 'Falha ao conectar Mercado Pago.');
      void loadStatus();
    }
    const next = new URLSearchParams(searchParams);
    next.delete('mp_oauth');
    next.delete('mp_oauth_msg');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loadStatus]);

  const startOAuthFlow = async (reconnect: boolean) => {
    const label = reconnect ? 'reconectar' : 'conectar';
    setConnecting(true);
    setRedirectingToMp(true);
    const qs = reconnect ? '?reconnect=true' : '';
    const res = await apiClient.get<{ url: string }>(`${API_CONNECT_URL}${qs}`, { cache: 'no-store' });
    if (res.error || !res.data?.url) {
      setConnecting(false);
      setRedirectingToMp(false);
      toast.error(res.error || `Não foi possível iniciar o OAuth para ${label}.`);
      return;
    }
    window.location.href = res.data.url;
  };

  const handleConnect = async () => {
    await startOAuthFlow(false);
  };

  const handleReconnect = async () => {
    await startOAuthFlow(true);
  };

  const handleTest = async () => {
    setTesting(true);
    const res = await apiClient.post<{ ok: boolean; status?: Status }>(API_TEST, {});
    setTesting(false);
    if (res.error) {
      toast.error(res.error);
      void loadStatus();
      return;
    }
    if (res.data?.ok) {
      toast.success('Conexão com Mercado Pago validada.');
    } else {
      toast.error('Mercado Pago não conectado ou token inválido.');
    }
    void loadStatus();
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Desconectar Mercado Pago? As cobranças existentes não são apagadas.')) return;
    setDisconnecting(true);
    const res = await apiClient.post<{ ok: boolean }>(API_DISCONNECT, {});
    setDisconnecting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Mercado Pago desconectado.');
    void loadStatus();
  };

  if (loading && !availability) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    );
  }

  if (redirectingToMp) {
    return (
      <div className="mx-auto w-full max-w-3xl flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">Redirecionando para o Mercado Pago…</p>
        <p className="text-xs text-center max-w-sm">Complete a autorização na página do Mercado Pago para atualizar a conexão.</p>
      </div>
    );
  }

  if (!availability?.enabled) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Mercado Pago indisponível</AlertTitle>
        <AlertDescription>
          A integração está desligada no servidor (<code className="text-xs">MERCADO_PAGO_GATEWAY_ENABLED</code>).
        </AlertDescription>
      </Alert>
    );
  }

  const envLabel =
    status?.environment === 'production'
      ? 'Produção'
      : status?.environment === 'sandbox'
        ? 'Sandbox'
        : '—';
  const nextConnectEnv =
    availability?.oauth_environment === 'production' ? 'Produção' : availability?.oauth_environment === 'sandbox' ? 'Sandbox' : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PlugZap className="h-5 w-5 text-primary" />
                Conectar Mercado Pago
              </CardTitle>
              <CardDescription className="mt-1">
                Autorize sua conta Mercado Pago para emitir cobranças e receber atualizações de pagamento automaticamente.
              </CardDescription>
            </div>
            <Badge variant={status?.connected ? 'default' : 'secondary'}>
              {status?.connected ? 'Conectado' : 'Não conectado'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {!availability.encryption_configured || !availability.oauth_state_configured || !availability.oauth_client_configured ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuração incompleta</AlertTitle>
          <AlertDescription className="text-sm space-y-1">
            {!availability.oauth_client_configured && (
              <p>Defina MERCADO_PAGO_CLIENT_ID, MERCADO_PAGO_CLIENT_SECRET e MERCADO_PAGO_REDIRECT_URI no backend.</p>
            )}
            {!availability.encryption_configured && (
              <p>Defina MERCADO_PAGO_OAUTH_TOKEN_ENCRYPTION_KEY (mín. 16 caracteres).</p>
            )}
            {!availability.oauth_state_configured && (
              <p>Defina MERCADO_PAGO_OAUTH_STATE_SECRET (mín. 16 caracteres).</p>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Status da conexão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status ? (
            <>
              <p>
                <span className="text-muted-foreground">Ambiente:</span> {envLabel}
              </p>
              {nextConnectEnv && !status?.connected ? (
                <p className="text-muted-foreground text-xs">
                  OAuth configurado no servidor como <span className="text-foreground">{nextConnectEnv}</span>.
                </p>
              ) : null}
              {status.user_id ? (
                <p>
                  <span className="text-muted-foreground">Conta (user id):</span> {status.user_id}
                </p>
              ) : null}
              <p>
                <span className="text-muted-foreground">Último teste:</span>{' '}
                {status.last_test_at ? new Date(status.last_test_at).toLocaleString('pt-BR') : '—'}
              </p>
              <p>
                <span className="text-muted-foreground">Gateway ativo para faturas:</span>{' '}
                {status.is_active_gateway ? 'Sim' : 'Não (conectado, mas outro gateway pode estar ativo)'}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Carregue o status após conectar.</p>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {!status?.connected ? (
              <Button
                type="button"
                onClick={() => void handleConnect()}
                disabled={connecting || !availability.oauth_client_configured}
              >
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                Conectar Mercado Pago
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => void handleReconnect()}
                disabled={connecting || !availability.oauth_client_configured}
              >
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Reconectar
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => void handleTest()} disabled={testing || !status?.connected}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Testar conexão
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDisconnect()}
              disabled={disconnecting || !status?.connected}
            >
              {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
              Desconectar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

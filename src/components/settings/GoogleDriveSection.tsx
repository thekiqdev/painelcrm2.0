import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ExternalLink, FolderOpen, Loader2, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import {
  disconnectGoogleDrive,
  getGoogleDriveConnectUrl,
  getGoogleDriveStatus,
} from '@/services/googleDriveIntegration';
import { useAuth } from '@/contexts/AuthContext';

export function GoogleDriveSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTenantAdmin = Boolean(user?.is_tenant_admin);

  const { data, isPending, refetch, isError } = useQuery({
    queryKey: ['google-drive-status'],
    queryFn: getGoogleDriveStatus,
    enabled: !!user,
  });

  useEffect(() => {
    const raw = searchParams.get('google_drive');
    if (!raw) return;
    const reason = searchParams.get('reason') || undefined;
    if (raw === 'connected') {
      toast.success('Google Drive ligado com sucesso.');
    } else if (raw === 'error') {
      if (reason === 'email_not_found') {
        toast.error(
          'Não foi possível obter o e-mail da conta Google. Verifique os scopes (openid, email, profile) na Google Cloud.',
        );
      } else if (reason === 'folders_failed') {
        toast.error(
          'Os tokens foram obtidos mas falhou a criação das pastas no Drive. Verifique permissões e tente ligar de novo.',
        );
      } else if (reason === 'denied') {
        toast.error('Autorização Google cancelada ou negada.');
      } else if (reason === 'misconfigured') {
        toast.error('A integração Google neste ambiente ainda não está concluída. Contacte o suporte.');
      } else if (reason === 'forbidden') {
        toast.error('A conta utilizada não tem permissão para concluir esta ligação.');
      } else if (reason === 'disabled' || reason === 'invalid') {
        toast.error('Ligação inválida ou integração desativada.');
      } else {
        toast.error('Não foi possível concluir a ligação com o Google Drive.');
      }
    }
    const next = new URLSearchParams(searchParams);
    next.delete('google_drive');
    next.delete('reason');
    setSearchParams(next, { replace: true });
    void queryClient.invalidateQueries({ queryKey: ['google-drive-status'] });
  }, [searchParams, setSearchParams, queryClient]);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const url = await getGoogleDriveConnectUrl();
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao iniciar conexão'),
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectGoogleDrive,
    onSuccess: async () => {
      toast.success('Google Drive desligado.');
      await queryClient.invalidateQueries({ queryKey: ['google-drive-status'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao desligar'),
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
            <FolderOpen className="h-5 w-5 opacity-80" aria-hidden />
            Google Drive
          </CardTitle>
          <CardDescription>
            A integração com o Google Drive não está ativa neste servidor. Peça ao administrador para definir{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">ENABLE_GOOGLE_DRIVE=true</code>, credenciais OAuth e{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">GOOGLE_DRIVE_REDIRECT_URI</code>{' '}
            (ou <code className="rounded bg-muted px-1 py-0.5 text-xs">GOOGLE_REDIRECT_URI</code> derivável).
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
              <FolderOpen className="h-5 w-5 opacity-80" aria-hidden />
              Google Drive
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-xl">
              Liga a conta Google da empresa ao Drive para criar automaticamente a pasta com o nome da empresa e a
              subpasta «Clientes». Upload e sincronização de ficheiros virão nas fases seguintes.
            </CardDescription>
          </div>
          {data.connected ? (
            <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600/90">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Ligado
            </Badge>
          ) : (
            <Badge variant="secondary">Não ligado</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="flex gap-2 font-medium text-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Permissões Google
          </div>
          <p className="mt-2 text-muted-foreground">
            Esta integração solicita o scope completo do Drive (<code className="rounded bg-muted/80 px-1 text-xs">drive</code>
            ), para poder criar pastas na raiz «Meu Drive» e preparar a hierarquia empresa/clientes. É uma permissão ampla:
            o consentimento pode exigir verificação na Google Cloud Console.
          </p>
        </div>

        {misconfigured ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            A integração Google neste ambiente ainda não está concluída. Contacte o suporte.
          </p>
        ) : null}

        {!isTenantAdmin ? (
          <p className="text-sm text-muted-foreground">
            Apenas administradores da empresa podem ligar ou desligar o Google Drive.
          </p>
        ) : null}

        {data.connected && data.google_email ? (
          <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Conta Google</p>
            <p className="mt-1 text-muted-foreground">{data.google_email}</p>
            {(data.root_folder_id || data.clients_folder_id) && (
              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div>
                  <dt className="inline font-medium text-foreground">Pasta empresa (root)</dt>
                  <dd className="mt-0.5 font-mono break-all">{data.root_folder_id ?? '—'}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground">Pasta Clientes</dt>
                  <dd className="mt-0.5 font-mono break-all">{data.clients_folder_id ?? '—'}</dd>
                </div>
              </dl>
            )}
            {data.connection_error ? (
              <p className="mt-2 text-xs text-destructive">{data.connection_error}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {isTenantAdmin && !data.connected ? (
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
              Ligar Google Drive
            </Button>
          ) : null}
          {isTenantAdmin && data.connected ? (
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
              Desligar
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void refetch()}>
            Atualizar estado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default GoogleDriveSection;

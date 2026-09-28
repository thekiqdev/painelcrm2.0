import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import type { ChatInstance } from '@/services/chat';
import {
  PLATFORM_WHATSAPP_INSTANCE_NAME,
  superadminPlatformWhatsAppService,
} from '@/services/superadminPlatformWhatsApp';
import { Loader2, MessageCircle, Phone, QrCode, RefreshCw, Trash2 } from 'lucide-react';

type GlobalRow = {
  platform_notifications_whatsapp_chat_instance_id: string | null;
};

function instancePhone(inst: ChatInstance): string | null {
  const row = inst as ChatInstance & { connected_phone?: string | null };
  if (row.connected_phone) return row.connected_phone;
  const m = inst.metadata as Record<string, unknown> | null | undefined;
  const ph = m?.connectedPhone;
  return typeof ph === 'string' ? ph : null;
}

export default function SuperAdminPlatformWhatsAppPanel() {
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<ChatInstance[]>([]);
  const [designatedId, setDesignatedId] = useState<string | null>(null);
  const [savingDesignation, setSavingDesignation] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [qrForId, setQrForId] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const loadGlobal = useCallback(async () => {
    const res = await apiClient.get<GlobalRow & { ok?: boolean }>(
      '/api/superadmin/platform-notifications/global-settings',
    );
    if (res.data?.platform_notifications_whatsapp_chat_instance_id) {
      setDesignatedId(res.data.platform_notifications_whatsapp_chat_instance_id);
    } else {
      setDesignatedId(null);
    }
  }, []);

  const loadInstances = useCallback(async () => {
    const data = await superadminPlatformWhatsAppService.listInstances();
    setInstances(data);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadGlobal(), loadInstances()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar WhatsApp da plataforma.');
    } finally {
      setLoading(false);
    }
  }, [loadGlobal, loadInstances]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => {
      void loadInstances();
    }, 12_000);
    return () => clearInterval(t);
  }, [polling, loadInstances]);

  const designate = async (instanceId: string) => {
    setSavingDesignation(true);
    const res = await apiClient.put<GlobalRow & { ok?: boolean }>(
      '/api/superadmin/platform-notifications/global-settings',
      { platform_notifications_whatsapp_chat_instance_id: instanceId },
    );
    setSavingDesignation(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Número definido como remetente oficial do motor da plataforma.');
    await loadGlobal();
  };

  const clearDesignation = async () => {
    setSavingDesignation(true);
    const res = await apiClient.put<GlobalRow & { ok?: boolean }>(
      '/api/superadmin/platform-notifications/global-settings',
      { platform_notifications_whatsapp_chat_instance_id: '' },
    );
    setSavingDesignation(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Remetente oficial removido. O motor deixa de enviar até definir outra instância.');
    await loadGlobal();
  };

  const createPlatformInstance = async () => {
    setCreating(true);
    try {
      await superadminPlatformWhatsAppService.createInstance({
        name: PLATFORM_WHATSAPP_INSTANCE_NAME,
        metadata: {
          connectionName: PLATFORM_WHATSAPP_INSTANCE_NAME,
          platform_motor: true,
        },
      });
      toast.success('Instância criada. Gere o QR code para conectar o número.');
      await loadInstances();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível criar a instância.');
    } finally {
      setCreating(false);
    }
  };

  const showQr = async (id: string) => {
    setConnectingId(id);
    setQrData(null);
    try {
      const connectResponse = await superadminPlatformWhatsAppService.connectInstance(id);
      const instanceData = (connectResponse?.instance as Record<string, unknown>) || {};
      const qrRaw =
        (instanceData?.qrcode as string | undefined) ||
        (connectResponse?.qrcode as string | undefined) ||
        (connectResponse?.code as string | undefined);
      const pairingCode =
        (instanceData?.paircode as string | undefined) ||
        (connectResponse?.paircode as string | undefined) ||
        (connectResponse?.pairingCode as string | undefined);

      if (typeof qrRaw === 'string' && qrRaw.length > 0) {
        const processed = qrRaw.startsWith('data:image') ? qrRaw : `data:image/png;base64,${qrRaw}`;
        setQrData(processed);
        setQrForId(id);
        setPolling(true);
        toast.success('QR code gerado. Escaneie com o WhatsApp neste telefone.');
      } else if (pairingCode) {
        toast.info(`Código de pareamento: ${pairingCode}`);
      } else {
        toast.message('Sem QR na resposta; verifique o estado da ligação.');
      }
      await loadInstances();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao gerar QR.');
    } finally {
      setConnectingId(null);
    }
  };

  const checkStatus = async (id: string) => {
    try {
      await superadminPlatformWhatsAppService.getInstanceStatus(id);
      await loadInstances();
      await loadGlobal();
      toast.success('Estado atualizado.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao consultar estado.');
    }
  };

  const removeInstance = async (id: string) => {
    if (!confirm('Remover esta instância do painel? Se for o remetente oficial, a designação será limpa.')) return;
    setDeletingId(id);
    try {
      await superadminPlatformWhatsAppService.deleteInstance(id);
      toast.success('Instância removida.');
      if (qrForId === id) {
        setQrForId(null);
        setQrData(null);
      }
      await Promise.all([loadInstances(), loadGlobal()]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao remover.');
    } finally {
      setDeletingId(null);
    }
  };

  const platformInstance = instances.find((i) => i.name === PLATFORM_WHATSAPP_INSTANCE_NAME);
  const isConnected = (s: string) => s === 'connected' || s === 'open';

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <MessageCircle className="h-5 w-5 text-crm-primary" />
          WhatsApp da plataforma
        </CardTitle>
        <CardDescription>
          Ligação direta do Super Admin (UazAPI + <code className="text-xs">chat_instances</code>), igual ao fluxo do
          painel do cliente.{' '}
          <strong className="text-foreground">Este número será usado nas notificações automáticas da plataforma</strong>{' '}
          após o clicar em &quot;Usar como remetente oficial&quot; com a sessão conectada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-muted-foreground">Remetente oficial:</span>
              {designatedId ? (
                <>
                  <Badge variant="default">Configurado</Badge>
                  <code className="text-xs bg-muted px-1 rounded">{designatedId}</code>
                  <Button type="button" variant="outline" size="sm" disabled={savingDesignation} onClick={() => void clearDesignation()}>
                    Remover designação
                  </Button>
                </>
              ) : (
                <Badge variant="secondary">Não configurado — o motor não envia WhatsApp</Badge>
              )}
            </div>

            {!platformInstance ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Ainda não existe a instância recomendada para o motor. Será criada com o nome fixo:
                </p>
                <code className="text-xs block bg-muted p-2 rounded">{PLATFORM_WHATSAPP_INSTANCE_NAME}</code>
                <Button type="button" onClick={() => void createPlatformInstance()} disabled={creating}>
                  {creating ? 'A criar…' : 'Criar instância da plataforma'}
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-border p-4 space-y-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{platformInstance.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">id: {platformInstance.id}</p>
                    <p className="text-sm mt-1 flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {instancePhone(platformInstance) ?? '—'}
                    </p>
                  </div>
                  <Badge variant={isConnected(platformInstance.status) ? 'default' : 'outline'}>
                    {platformInstance.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1"
                    disabled={connectingId === platformInstance.id}
                    onClick={() => void showQr(platformInstance.id)}
                  >
                    <QrCode className="h-4 w-4" />
                    {connectingId === platformInstance.id ? 'A pedir QR…' : 'Ligar / QR code'}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => void checkStatus(platformInstance.id)}>
                    <RefreshCw className="h-4 w-4" />
                    Atualizar estado
                  </Button>
                  {isConnected(platformInstance.status) && designatedId !== platformInstance.id ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingDesignation}
                      onClick={() => void designate(platformInstance.id)}
                    >
                      Usar como remetente oficial
                    </Button>
                  ) : null}
                  {designatedId === platformInstance.id ? (
                    <Badge variant="outline" className="self-center">
                      Remetente oficial ativo
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-1"
                    disabled={deletingId === platformInstance.id}
                    onClick={() => void removeInstance(platformInstance.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover instância
                  </Button>
                </div>
              </div>
            )}

            {qrForId && qrData ? (
              <div className="rounded-md border border-dashed border-border p-4 space-y-2 bg-muted/20">
                <p className="text-sm font-medium text-foreground">QR code (escaneie no WhatsApp)</p>
                <img src={qrData} alt="QR WhatsApp" className="max-w-[280px] rounded border border-border" />
                <p className="text-xs text-muted-foreground">
                  Após conectar, clique em &quot;Atualizar estado&quot; e depois &quot;Usar como remetente oficial&quot;.
                </p>
              </div>
            ) : null}

            {instances.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Existem outras instâncias neste utilizador; para o motor da plataforma use apenas a instância com o nome
                acima.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

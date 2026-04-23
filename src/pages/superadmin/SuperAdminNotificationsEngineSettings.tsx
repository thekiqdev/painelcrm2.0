import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { BellRing, Save } from 'lucide-react';

type GlobalFlags = {
  notifications_engine_enabled: boolean;
  notifications_engine_business_events_enabled: boolean;
  notifications_engine_whatsapp_send_enabled: boolean;
};

export default function SuperAdminNotificationsEngineSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [motor, setMotor] = useState(true);
  const [business, setBusiness] = useState(true);
  const [whatsapp, setWhatsapp] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<GlobalFlags & { ok?: boolean }>(
      '/api/superadmin/notifications-engine/global-settings',
    );
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível carregar as definições.');
      setLoading(false);
      return;
    }
    const d = res.data;
    setMotor(d.notifications_engine_enabled !== false);
    setBusiness(d.notifications_engine_business_events_enabled !== false);
    setWhatsapp(d.notifications_engine_whatsapp_send_enabled !== false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    const res = await apiClient.put<GlobalFlags & { ok?: boolean }>(
      '/api/superadmin/notifications-engine/global-settings',
      {
        notifications_engine_enabled: motor,
        notifications_engine_business_events_enabled: business,
        notifications_engine_whatsapp_send_enabled: whatsapp,
      },
    );
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Configuração global guardada. Os tenants verão o novo estado em segundos.');
    void load();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Motor de notificações</h1>
        <p className="text-muted-foreground mt-1">
          Controlo global da plataforma (persistido na base de dados). As preferências por tenant continuam em
          Configurações → Notificações de cada conta.
        </p>
      </div>

      <Alert>
        <AlertTitle>Kill switch de emergência via ambiente</AlertTitle>
        <AlertDescription className="text-sm">
          Variáveis <code className="text-xs">NOTIFICATIONS_ENGINE_*</code> definidas explicitamente como{' '}
          <code className="text-xs">false</code>, <code className="text-xs">0</code> ou <code className="text-xs">no</code>{' '}
          forçam o respetivo toggle a OFF, independentemente do painel. Omitir o env = não força nada; o valor em vigor
          vem daqui.
        </AlertDescription>
      </Alert>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <BellRing className="h-5 w-5" />
            Toggles globais
          </CardTitle>
          <CardDescription>
            Alterações aplicam-se a toda a plataforma sem redeploy. O servidor atualiza o cache em poucos segundos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ne-global-motor" className="text-base">
                    Motor de notificações ativo
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Liga API do motor, catálogo tenant e orquestrador. Se desligado, o CRM deixa de processar
                    notificações transacionais.
                  </p>
                </div>
                <Switch id="ne-global-motor" checked={motor} onCheckedChange={setMotor} />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ne-global-business" className="text-base">
                    Publicação automática de eventos ativa
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Permite que propostas, contratos e faturas publiquem eventos para o motor (ex.: invoice.created).
                    Requer o motor ativo.
                  </p>
                </div>
                <Switch id="ne-global-business" checked={business} onCheckedChange={setBusiness} disabled={!motor} />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ne-global-wa" className="text-base">
                    Envio real por WhatsApp ativo
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Se desligado, as mensagens são renderizadas mas não são enviadas ao gateway (entregas podem ficar
                    em skipped). Requer o motor ativo.
                  </p>
                </div>
                <Switch id="ne-global-wa" checked={whatsapp} onCheckedChange={setWhatsapp} disabled={!motor} />
              </div>
              <Button className="mt-2" onClick={() => void save()} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'A guardar…' : 'Guardar alterações'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

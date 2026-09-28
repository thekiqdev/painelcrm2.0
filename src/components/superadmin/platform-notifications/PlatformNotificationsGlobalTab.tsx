import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';

export type PlatformNotificationsGlobalTabProps = {
  globalLoading: boolean;
  globalSaving: boolean;
  gMotor: boolean;
  gBusiness: boolean;
  gWhatsapp: boolean;
  gVerbose: boolean;
  setGMotor: (v: boolean) => void;
  setGBusiness: (v: boolean) => void;
  setGWhatsapp: (v: boolean) => void;
  setGVerbose: (v: boolean) => void;
  onSave: () => void;
};

export function PlatformNotificationsGlobalTab({
  globalLoading,
  globalSaving,
  gMotor,
  gBusiness,
  gWhatsapp,
  gVerbose,
  setGMotor,
  setGBusiness,
  setGWhatsapp,
  setGVerbose,
  onSave,
}: PlatformNotificationsGlobalTabProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Toggles globais do motor da plataforma</CardTitle>
        <CardDescription>
          Persistidos em <code className="text-xs">superadmin_settings</code> (chaves{' '}
          <code className="text-xs">platform_notifications_*</code>), independentes do motor do tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {globalLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-base">Motor da plataforma ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Liga o processamento de notificações transacionais da plataforma (fila, worker, envio).
                </p>
              </div>
              <Switch checked={gMotor} onCheckedChange={setGMotor} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-base">Eventos de negócio da plataforma</Label>
                <p className="text-sm text-muted-foreground">
                  Permite publicar eventos <code className="text-xs">platform.*</code> para o motor (cadastro,
                  billing, etc.).
                </p>
              </div>
              <Switch checked={gBusiness} onCheckedChange={setGBusiness} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-base">Envio WhatsApp da plataforma</Label>
                <p className="text-sm text-muted-foreground">
                  Quando desligado, o motor pode continuar a registar entregas em fila sem despachar ao provedor.
                </p>
              </div>
              <Switch checked={gWhatsapp} onCheckedChange={setGWhatsapp} />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-base">Log verboso (diagnóstico)</Label>
                <p className="text-sm text-muted-foreground">Mais detalhe nos logs do servidor; uso operacional.</p>
              </div>
              <Switch checked={gVerbose} onCheckedChange={setGVerbose} />
            </div>
            <Button onClick={() => void onSave()} disabled={globalSaving} className="gap-2">
              <Save className="h-4 w-4" />
              {globalSaving ? 'A guardar…' : 'Guardar configuração'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

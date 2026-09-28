import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { Repeat2, Save } from 'lucide-react';

type Flags = {
  subscription_cycles_read: boolean;
  subscription_cycles_write: boolean;
};

export default function SuperAdminSubscriptionCyclesSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readEnabled, setReadEnabled] = useState(true);
  const [writeEnabled, setWriteEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<Flags>('/api/superadmin/billing/subscription-cycles-flags');
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível carregar as definições.');
      setLoading(false);
      return;
    }
    setReadEnabled(res.data.subscription_cycles_read !== false);
    setWriteEnabled(res.data.subscription_cycles_write !== false);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    const res = await apiClient.put<Flags>('/api/superadmin/billing/subscription-cycles-flags', {
      subscription_cycles_read: readEnabled,
      subscription_cycles_write: writeEnabled,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Configuração guardada.');
    void load();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Faturas recorrentes — Ciclos de assinatura</h1>
        <p className="text-muted-foreground mt-1">
          Esta configuração melhora a rastreabilidade das faturas recorrentes. O motor legado continua preservado.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Repeat2 className="h-5 w-5" />
            Leitura e gravação paralela
          </CardTitle>
          <CardDescription>
            Alterações aplicam-se em toda a plataforma. A escrita em ciclos usa cache curto no servidor (~20s).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="sc-read" className="text-base">
                    Usar ciclos de assinatura na leitura/insight
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Quando ativo, o insight de recorrência pode incluir dados de <code className="text-xs">subscription_cycles</code>{' '}
                    (com fallback legado se não houver ciclo).
                  </p>
                </div>
                <Switch id="sc-read" checked={readEnabled} onCheckedChange={setReadEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="sc-write" className="text-base">
                    Gravar ciclos de assinatura em paralelo ao motor atual
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Dual-write: scheduler e worker espelham estados em <code className="text-xs">subscription_cycles</code> sem
                    substituir a fila técnica de jobs.
                  </p>
                </div>
                <Switch id="sc-write" checked={writeEnabled} onCheckedChange={setWriteEnabled} />
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

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { RadioTower, Save } from 'lucide-react';

type TrackingSettingsDto = {
  ok?: boolean;
  meta_pixel_enabled: boolean;
  meta_pixel_id: string | null;
  meta_track_page_view: boolean;
  meta_track_lead: boolean;
  meta_track_complete_registration: boolean;
};

export default function SuperAdminTrackingSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [trackPageView, setTrackPageView] = useState(true);
  const [trackLead, setTrackLead] = useState(true);
  const [trackCompleteRegistration, setTrackCompleteRegistration] = useState(true);

  const applyDto = useCallback((d: TrackingSettingsDto) => {
    setEnabled(d.meta_pixel_enabled);
    setPixelId(d.meta_pixel_id ?? '');
    setTrackPageView(d.meta_track_page_view);
    setTrackLead(d.meta_track_lead);
    setTrackCompleteRegistration(d.meta_track_complete_registration);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<TrackingSettingsDto>('/api/superadmin/tracking-settings');
    setLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível carregar o tracking.');
      return;
    }
    applyDto(res.data);
  }, [applyDto]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const digits = pixelId.replace(/\D/g, '');
    if (enabled && !digits) {
      toast.error('Informe um Meta Pixel ID válido (apenas números).');
      return;
    }
    setSaving(true);
    const res = await apiClient.put<TrackingSettingsDto>('/api/superadmin/tracking-settings', {
      meta_pixel_enabled: enabled,
      meta_pixel_id: digits || null,
      meta_track_page_view: trackPageView,
      meta_track_lead: trackLead,
      meta_track_complete_registration: trackCompleteRegistration,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) applyDto(res.data);
    toast.success('Configuração de tracking guardada.');
  };

  const testConfig = async () => {
    setTesting(true);
    const res = await apiClient.post<{ ok?: boolean; message?: string; error?: string }>(
      '/api/superadmin/tracking-settings/test',
      {},
    );
    setTesting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data?.message ?? 'Configuração válida.');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs text-muted-foreground">
          Super Admin / <span className="text-foreground font-medium">Marketing</span>
        </p>
        <h1 className="text-2xl font-bold text-foreground mt-1 flex items-center gap-2">
          <RadioTower className="h-7 w-7 text-crm-primary shrink-0" />
          Tracking
        </h1>
        <p className="text-muted-foreground mt-1">
          Meta Pixel para campanhas Facebook/Instagram Ads (PageView, Lead e CompleteRegistration).
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Meta Pixel / Facebook Ads</CardTitle>
          <CardDescription>
            O script é gerado de forma segura a partir do Pixel ID. Páginas públicas e{' '}
            <code className="text-xs">/signup-success</code> disparam eventos conforme os interruptores abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label>Ativar rastreamento</Label>
                  <p className="text-sm text-muted-foreground">Liga o Meta Pixel nas páginas públicas configuradas.</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-pixel-id">Meta Pixel ID</Label>
                <Input
                  id="meta-pixel-id"
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder="123456789012345"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <Label>PageView</Label>
                  <Switch checked={trackPageView} onCheckedChange={setTrackPageView} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <Label>Lead</Label>
                  <Switch checked={trackLead} onCheckedChange={setTrackLead} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <Label>CompleteRegistration</Label>
                  <Switch checked={trackCompleteRegistration} onCheckedChange={setTrackCompleteRegistration} />
                </div>
              </div>
              {enabled && !pixelId.trim() ? (
                <Alert variant="destructive">
                  <AlertTitle>Pixel ID obrigatório</AlertTitle>
                  <AlertDescription>Ative o rastreamento apenas após informar um Pixel ID numérico.</AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void save()} disabled={saving || loading} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'A guardar…' : 'Salvar configurações'}
        </Button>
        <Button variant="secondary" onClick={() => void testConfig()} disabled={testing || loading}>
          {testing ? 'A validar…' : 'Testar configuração'}
        </Button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import {
  invalidateSignupCaches,
  loadSignupEntryConfig,
} from '@/lib/signupEntry';
import { loadSignupStrategy } from '@/lib/signupStrategy';

type SignupEntryMode = 'legacy_checkout' | 'acquisition_flow';

type SettingsResponse = {
  ok: boolean;
  config: {
    mode: SignupEntryMode;
    post_activation_path: string;
    legacy_checkout_enabled: boolean;
    acquisition_flow_enabled: boolean;
  };
  effective_entry_mode: SignupEntryMode;
  paths: Record<string, string>;
  acquisition_flags: Record<string, boolean>;
};

export default function SuperAdminSignupAcquisitionPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SettingsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<SettingsResponse>('/api/superadmin/platform/signup-acquisition');
    if (res.error || !res.data?.ok) {
      toast.error(res.error ?? 'Falha ao carregar');
      setData(null);
    } else {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<SettingsResponse['config']>) {
    if (!data) return;
    setSaving(true);
    const res = await apiClient.patch<SettingsResponse>('/api/superadmin/platform/signup-acquisition', {
      ...data.config,
      ...patch,
    });
    setSaving(false);
    if (res.error || !res.data?.ok) {
      toast.error(res.error ?? 'Falha ao salvar');
      return;
    }
    if (patch.mode !== undefined) {
      invalidateSignupCaches();
      await Promise.all([loadSignupStrategy(true), loadSignupEntryConfig(true)]);
    }
    setData(res.data);
    toast.success('Configuração salva');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-muted-foreground">Não foi possível carregar as configurações.</p>;
  }

  const cfg = data.config;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Signup / Acquisition</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurações avançadas de redirect. O fluxo principal é controlado em{' '}
          <a href="/superadmin/configuracoes/growth/signup-strategy" className="text-primary hover:underline">
            Growth → Estratégia de Cadastro
          </a>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo padrão do site</CardTitle>
          <CardDescription>
            Efetivo agora: <strong>{data.effective_entry_mode}</strong> →{' '}
            <code className="text-xs">{data.paths.signup}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Modo de entrada (platform.signup_entry_mode)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant={cfg.mode === 'legacy_checkout' ? 'default' : 'outline'}
                onClick={() => void save({ mode: 'legacy_checkout' })}
                disabled={saving}
              >
                Legacy — /checkout
              </Button>
              <Button
                type="button"
                variant={cfg.mode === 'acquisition_flow' ? 'default' : 'outline'}
                onClick={() => void save({ mode: 'acquisition_flow' })}
                disabled={saving}
              >
                Acquisition — /cadastro
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Checkout legado habilitado</p>
              <p className="text-xs text-muted-foreground">Permite /checkout e retomadas comerciais.</p>
            </div>
            <Switch
              checked={cfg.legacy_checkout_enabled}
              onCheckedChange={(v) => void save({ legacy_checkout_enabled: v })}
              disabled={saving}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <p className="font-medium text-sm">Acquisition flow habilitado</p>
              <p className="text-xs text-muted-foreground">
                Sincronizado com <code>active_signup_flow</code> (Growth). Não depende de ENV.
              </p>
            </div>
            <Switch
              checked={cfg.acquisition_flow_enabled}
              onCheckedChange={(v) => void save({ acquisition_flow_enabled: v })}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="post-path">Redirect pós-ativação (trial)</Label>
            <div className="flex gap-2">
              <input
                id="post-path"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                defaultValue={cfg.post_activation_path}
                key={cfg.post_activation_path}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== cfg.post_activation_path) void save({ post_activation_path: v });
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Flags acquisition (runtime)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1 text-sm font-mono">
            {Object.entries(data.acquisition_flags).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-border/50 py-1">
                <span>{k}</span>
                <span className={v ? 'text-green-600' : 'text-muted-foreground'}>{v ? 'on' : 'off'}</span>
              </li>
            ))}
          </ul>
          <Button variant="link" className="mt-3 px-0" asChild>
            <a href="/superadmin/avancado/feature-flags">Abrir feature flags avançadas →</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import type { ActiveSignupFlow, SignupStrategy } from '@/lib/signupStrategy';
import {
  invalidateSignupCaches,
  loadSignupEntryConfig,
} from '@/lib/signupEntry';
import { loadSignupStrategy } from '@/lib/signupStrategy';

type HealthResponse = {
  flow: ActiveSignupFlow;
  checks: {
    phone_verification: boolean;
    whatsapp_platform_connected: boolean;
    whatsapp_instance_ready: boolean;
    public_routes_ready: boolean;
  };
  healthy: boolean;
  issues?: string[];
};

type SettingsResponse = {
  ok: boolean;
  active_signup_flow: ActiveSignupFlow;
  strategy: SignupStrategy;
  health: HealthResponse;
};

const FLOW_OPTIONS: { value: ActiveSignupFlow; label: string; description: string }[] = [
  {
    value: 'checkout',
    label: 'Checkout Tradicional',
    description: 'CTAs públicos apontam para /checkout. Fluxo comercial padrão.',
  },
  {
    value: 'exclusive_signup',
    label: 'Teste Fechado',
    description: 'CTAs apontam para /cadastro com verificação WhatsApp e selo de teste fechado.',
  },
];

export default function SuperAdminGrowthSignupStrategyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SettingsResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<SettingsResponse>('/api/superadmin/platform/growth/signup-strategy');
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

  async function save(flow: ActiveSignupFlow) {
    if (!data || data.active_signup_flow === flow) return;
    setSaving(true);
    const res = await apiClient.patch<SettingsResponse>('/api/superadmin/platform/growth/signup-strategy', {
      active_signup_flow: flow,
    });
    setSaving(false);
    if (res.error || !res.data?.ok) {
      toast.error(res.error ?? 'Falha ao salvar');
      return;
    }
    invalidateSignupCaches();
    await Promise.all([loadSignupStrategy(true), loadSignupEntryConfig(true)]);
    setData(res.data);
    toast.success('Estratégia de cadastro atualizada');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-muted-foreground">Não foi possível carregar a estratégia.</p>;
  }

  const { strategy, health } = data;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-3xl">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Growth</p>
        <h1 className="text-2xl font-semibold tracking-tight">Estratégia de Cadastro</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Uma única configuração controla CTAs do site, /cadastro e ativação automática do teste fechado.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fluxo ativo</CardTitle>
          <CardDescription>
            Entrada atual: <code className="text-xs">{strategy.entry_url}</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FLOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={saving}
              onClick={() => void save(opt.value)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                data.active_signup_flow === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{opt.label}</span>
                {data.active_signup_flow === opt.value ? (
                  <Badge variant="default">Ativo</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funcionalidades ativadas</CardTitle>
          <CardDescription>Derivadas automaticamente de <code>active_signup_flow</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            {Object.entries(strategy.features).map(([key, on]) => (
              <li key={key} className="flex items-center justify-between border-b border-border/50 py-1.5">
                <span className="font-mono text-xs">{key}</span>
                <span className={on ? 'text-emerald-600' : 'text-muted-foreground'}>{on ? 'sim' : 'não'}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Saúde do fluxo</CardTitle>
            <Badge variant={health.healthy ? 'default' : 'destructive'}>
              {health.healthy ? 'Saudável' : 'Atenção'}
            </Badge>
          </div>
          <CardDescription>
            Valida dependências do teste fechado (WhatsApp da plataforma e verificação de telefone).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(
            [
              ['phone_verification', 'Verificação de telefone'],
              ['whatsapp_platform_connected', 'WhatsApp da plataforma configurado'],
              ['whatsapp_instance_ready', 'Instância WhatsApp pronta'],
              ['public_routes_ready', 'Rotas públicas disponíveis'],
            ] as const
          ).map(([key, label]) => {
            const ok = health.checks[key];
            return (
              <div key={key} className="flex items-center gap-2 text-sm">
                {ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span>{label}</span>
              </div>
            );
          })}
          {health.issues?.length ? (
            <ul className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs font-mono text-destructive">
              {health.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

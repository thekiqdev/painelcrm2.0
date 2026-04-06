import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/integrations/api/client';

interface PaymentGatewayConfig {
  id: string;
  scope: string;
  gateway_key: string;
  display_name: string | null;
  options: Record<string, unknown>;
  hasCredentials: boolean;
  credentialsMasked?: Record<string, string>;
}

interface GatewayListItem {
  key: string;
  name: string;
  is_enabled: boolean;
}

const MASK = '••••••••';

export default function SuperAdminPagamentos() {
  const [config, setConfig] = useState<PaymentGatewayConfig | null>(null);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    gateway_key: '',
    api_key: '',
    env: 'sandbox' as 'sandbox' | 'production',
  });

  const load = async () => {
    setLoading(true);
    const [configRes, gatewaysRes] = await Promise.all([
      apiClient.get<PaymentGatewayConfig | null>('/api/superadmin/payment-gateway'),
      apiClient.get<GatewayListItem[]>('/api/superadmin/payment-gateways'),
    ]);
    if (configRes.data !== undefined) setConfig(configRes.data ?? null);
    if (configRes.error) toast.error(configRes.error);
    if (gatewaysRes.data) setGateways(gatewaysRes.data);
    if (gatewaysRes.error) toast.error(gatewaysRes.error);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (config) {
      setForm((f) => ({
        ...f,
        gateway_key: config.gateway_key,
        api_key: '',
        env: (config.options?.env as string) === 'production' ? 'production' : 'sandbox',
      }));
    } else if (gateways.length > 0) {
      setForm((f) => (f.gateway_key ? f : { ...f, gateway_key: gateways[0].key }));
    }
  }, [config, gateways]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.gateway_key.trim()) {
      toast.error('Selecione o gateway.');
      return;
    }
    setSaving(true);
    const credentials: Record<string, string> = {
      env: form.env,
    };
    if (form.api_key.trim()) {
      credentials.api_key = form.api_key.trim();
    } else if (config?.hasCredentials) {
      credentials.api_key = MASK;
    }
    const res = await apiClient.put<{ id: string; gateway_key: string }>('/api/superadmin/payment-gateway', {
      gateway_key: form.gateway_key,
      credentials,
      options: { env: form.env },
    });
    if (res.error) {
      toast.error(res.error);
      setSaving(false);
      return;
    }
    toast.success('Configuração salva.');
    setSaving(false);
    load();
  };

  const enabledGateways = gateways.filter((g) => g.is_enabled);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-7 w-7" />
          Gateway de pagamento
        </h1>
        <p className="text-muted-foreground">
          Configure o gateway usado para cobrar os planos das empresas (cobrança SaaS).
        </p>
      </div>

      {config && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração atual</CardTitle>
            <CardDescription>Gateway ativo e ambiente. Credenciais nunca são exibidas em claro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Gateway:</span>{' '}
              <span className="font-medium">{config.gateway_key}</span>
              {config.display_name && ` (${config.display_name})`}
            </p>
            <p>
              <span className="text-muted-foreground">Ambiente:</span>{' '}
              {(config.options?.env as string) === 'production' ? 'Produção' : 'Sandbox'}
            </p>
            <p>
              <span className="text-muted-foreground">API Key:</span>{' '}
              {config.hasCredentials ? 'Configurada (' + (config.credentialsMasked?.api_key ?? MASK) + ')' : 'Não configurada'}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alterar configuração</CardTitle>
          <CardDescription>
            Selecione o gateway, ambiente e informe a API Key. Deixe a API Key em branco para manter a atual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
              <div className="grid gap-2">
                <Label>Gateway</Label>
                <Select
                  value={form.gateway_key}
                  onValueChange={(v) => setForm((f) => ({ ...f, gateway_key: v }))}
                  disabled={enabledGateways.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gateway" />
                  </SelectTrigger>
                  <SelectContent>
                    {enabledGateways.map((g) => (
                      <SelectItem key={g.key} value={g.key}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {enabledGateways.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum gateway habilitado no sistema.</p>
                )}
              </div>
              <div className="grid gap-2">
                <Label>Ambiente</Label>
                <Select
                  value={form.env}
                  onValueChange={(v: 'sandbox' | 'production') => setForm((f) => ({ ...f, env: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                    <SelectItem value="production">Produção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="api_key">API Key</Label>
                <Input
                  id="api_key"
                  type="password"
                  autoComplete="off"
                  placeholder={config?.hasCredentials ? 'Deixe em branco para manter a atual' : 'Informe a API Key'}
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                />
              </div>
              <Button type="submit" disabled={saving || enabledGateways.length === 0}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

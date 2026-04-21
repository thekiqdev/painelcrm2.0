import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle, XCircle, AlertCircle, Copy, Loader2, Ban, ExternalLink } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { SettingsSectionProps } from './types';

export interface PaymentGatewaySectionProps extends SettingsSectionProps {
  /** Quando definido (ex.: na página /settings/payments/:gatewayKey), fixa o gateway e oculta o seletor. */
  gatewayKey?: string;
}

type GatewayPaySlug = 'pix' | 'boleto' | 'credit_card';

interface PaymentGatewayConfig {
  id: string;
  scope: string;
  gateway_key: string;
  display_name: string | null;
  options: Record<string, unknown>;
  hasCredentials: boolean;
  credentialsMasked?: Record<string, string>;
  api_key_masked?: string | null;
  webhookUrl?: string;
  enabled_payment_methods?: GatewayPaySlug[];
  default_payment_method?: GatewayPaySlug | null;
}

interface GatewayListItem {
  key: string;
  name: string;
  is_enabled: boolean;
}

type ConnectionStatus = 'idle' | 'connected' | 'not_configured' | 'auth_error' | 'error';

const MASK = '••••••••';

const API_CONFIG = '/api/me/tenant/payment-gateway';
const API_GATEWAYS = '/api/me/tenant/payment-gateways';
const API_TEST = '/api/me/tenant/payment-gateway/test';
const API_DISABLE = '/api/me/tenant/payment-gateway/disable';

const WEBHOOK_PATH = '/webhooks/asaas';
const ASAAS_API_KEY_URL = 'https://www.asaas.com/customerApiAccessToken/index';
const ASAAS_WEBHOOKS_URL = 'https://www.asaas.com/customerConfigIntegrations/webhooks';
const ASAAS_WEBHOOK_DOCS_URL = 'https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint';

function getWebhookUrl(config: PaymentGatewayConfig | null): string {
  if (config?.webhookUrl) return config.webhookUrl;
  if (typeof window !== 'undefined') return `${window.location.origin}${WEBHOOK_PATH}`;
  return WEBHOOK_PATH;
}

function getDisplayStatus(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Conectado';
    case 'not_configured':
      return 'Não configurado';
    case 'auth_error':
      return 'Erro de autenticação';
    case 'error':
      return 'Erro de conexão';
    default:
      return '—';
  }
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'idle') return null;
  const isConnected = status === 'connected';
  const isAuthError = status === 'auth_error';
  const Icon = isConnected ? CheckCircle : isAuthError ? XCircle : AlertCircle;
  const colorClass = isConnected
    ? 'border-emerald-200 bg-emerald-500/10 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/35 dark:text-emerald-200'
    : isAuthError
      ? 'border-red-200 bg-red-500/10 text-red-800 dark:border-red-800/60 dark:bg-red-950/35 dark:text-red-200'
      : 'border-amber-200 bg-amber-500/10 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/35 dark:text-amber-100';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium ${colorClass}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {getDisplayStatus(status)}
    </span>
  );
}

export const PaymentGatewaySection: React.FC<PaymentGatewaySectionProps> = ({ gatewayKey: fixedGatewayKey }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<PaymentGatewayConfig | null>(null);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [form, setForm] = useState({
    gateway_key: '',
    api_key: '',
    webhook_auth_token: '',
    env: 'sandbox' as 'sandbox' | 'production',
  });
  const [payPix, setPayPix] = useState(true);
  const [payBoleto, setPayBoleto] = useState(true);
  const [payCard, setPayCard] = useState(true);
  const [defaultPaySlug, setDefaultPaySlug] = useState<GatewayPaySlug | null>(null);

  const load = async (opts?: { preserveConnectionStatus?: boolean }) => {
    setLoading(true);
    const [configRes, gatewaysRes] = await Promise.all([
      apiClient.get<PaymentGatewayConfig | null>(API_CONFIG),
      apiClient.get<GatewayListItem[]>(API_GATEWAYS),
    ]);
    let cfg = configRes.data ?? null;
    if (fixedGatewayKey && cfg && cfg.gateway_key !== fixedGatewayKey) cfg = null;
    if (configRes.data !== undefined) setConfig(cfg);
    if (configRes.error) toast.error(configRes.error);
    if (gatewaysRes.data) setGateways(gatewaysRes.data);
    if (gatewaysRes.error) toast.error(gatewaysRes.error);
    setLoading(false);
    if (configRes.data !== undefined && (!cfg || !cfg.hasCredentials)) {
      if (!opts?.preserveConnectionStatus) setConnectionStatus('not_configured');
    } else if (!opts?.preserveConnectionStatus) {
      setConnectionStatus('idle');
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const targetKey = fixedGatewayKey || config?.gateway_key || (gateways.length > 0 ? gateways[0].key : '');
    if (config && config.gateway_key === targetKey) {
      setForm((f) => ({
        ...f,
        gateway_key: config.gateway_key,
        api_key: '',
        webhook_auth_token: '',
        env: (config.options?.env as string) === 'production' ? 'production' : 'sandbox',
      }));
      if (!config.hasCredentials) setConnectionStatus('not_configured');
    } else if (gateways.length > 0 && targetKey) {
      setForm((f) => ({ ...f, gateway_key: targetKey }));
      setConnectionStatus('not_configured');
    }
  }, [config, gateways, fixedGatewayKey]);

  useEffect(() => {
    if (!config) return;
    const list = config.enabled_payment_methods;
    if (!list || list.length === 0) {
      setPayPix(true);
      setPayBoleto(true);
      setPayCard(true);
    } else {
      const s = new Set(list);
      setPayPix(s.has('pix'));
      setPayBoleto(s.has('boleto'));
      setPayCard(s.has('credit_card'));
    }
    setDefaultPaySlug(config.default_payment_method ?? null);
  }, [config?.id, config?.enabled_payment_methods, config?.default_payment_method]);

  const handleTestConnection = async () => {
    if (!config?.hasCredentials) {
      toast.error('Configure a API Key antes de testar.');
      return;
    }
    setTesting(true);
    setConnectionStatus('idle');
    const res = await apiClient.post<{ connected: boolean; error?: string }>(API_TEST, {});
    setTesting(false);
    if (res.data?.connected) {
      setConnectionStatus('connected');
      toast.success('Conexão com o gateway realizada com sucesso.');
    } else {
      const err = res.data?.error || res.error || 'Falha ao testar conexão.';
      setConnectionStatus(err.toLowerCase().includes('autenticação') ? 'auth_error' : 'error');
      toast.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const gatewayKey = fixedGatewayKey || form.gateway_key.trim();
    if (!gatewayKey) {
      toast.error('Selecione o gateway.');
      return;
    }
    const enabled: GatewayPaySlug[] = [];
    if (payPix) enabled.push('pix');
    if (payBoleto) enabled.push('boleto');
    if (payCard) enabled.push('credit_card');
    if (enabled.length === 0) {
      toast.error('Ative pelo menos um método de pagamento.');
      return;
    }
    if (defaultPaySlug != null && !enabled.includes(defaultPaySlug)) {
      toast.error('O método padrão deve estar entre os métodos ativos.');
      return;
    }
    setSaving(true);
    const credentials: Record<string, string> = {
      env: form.env,
    };
    if (form.api_key.trim()) {
      credentials.api_key = form.api_key.trim();
    } else if (config?.hasCredentials) {
      credentials.api_key = '••••••••';
    }
    if (form.webhook_auth_token.trim()) {
      credentials.webhook_auth_token = form.webhook_auth_token.trim();
    } else if (config?.credentialsMasked?.webhook_auth_token) {
      credentials.webhook_auth_token = '••••••••';
    }
    const res = await apiClient.put<{ id: string; gateway_key: string }>(API_CONFIG, {
      gateway_key: gatewayKey,
      credentials,
      options: { env: form.env },
      enabled_payment_methods: enabled,
      default_payment_method: defaultPaySlug,
    });
    if (res.error) {
      toast.error(res.error);
      setSaving(false);
      return;
    }
    toast.success('Configuração salva.');
    setSaving(false);

    // Testa automaticamente após salvar (evita necessidade de clique extra).
    // Critério: se foi informada uma API Key nova OR já havia credenciais na config anterior.
    const hasCredentialsAfterSave = !!form.api_key.trim() || !!config?.hasCredentials;
    if (hasCredentialsAfterSave) {
      setTesting(true);
      setConnectionStatus('idle');
      const testRes = await apiClient.post<{ connected: boolean; error?: string }>(API_TEST, {});
      setTesting(false);

      if (testRes.data?.connected) {
        setConnectionStatus('connected');
        toast.success('Conexão com o gateway realizada com sucesso.');
      } else {
        const err = testRes.data?.error || testRes.error || 'Falha ao testar conexão.';
        setConnectionStatus(err.toLowerCase().includes('autenticação') ? 'auth_error' : 'error');
        toast.error(err);
      }
    }

    // Recarrega apenas os dados do config; preserva o status visual do teste que acabamos de disparar.
    await load({ preserveConnectionStatus: true });
  };

  const copyWebhookUrl = () => {
    const url = getWebhookUrl(config);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success('URL copiada.');
    }
  };

  const handleDisableGateway = async () => {
    const gatewayKey = fixedGatewayKey || config?.gateway_key;
    if (!gatewayKey) return;
    if (!window.confirm('Desativar este gateway? Ele não será usado para cobranças até ser reativado.')) return;
    setDisabling(true);
    const res = await apiClient.post<{ ok?: boolean }>(API_DISABLE, { gateway_key: gatewayKey });
    setDisabling(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Gateway desativado.');
    if (fixedGatewayKey) navigate('/settings/payments', { replace: true });
    else load();
  };

  const enabledGateways = gateways.filter((g) => g.is_enabled);
  const showGatewaySelect = !fixedGatewayKey;
  const apiKeyDisplay = config?.api_key_masked ?? config?.credentialsMasked?.api_key ?? (config?.hasCredentials ? MASK : null);
  const webhookAuthTokenDisplay = config?.credentialsMasked?.webhook_auth_token ?? null;
  const webhookUrl = getWebhookUrl(config);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Gateway de pagamento
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure o gateway para cobrança de clientes (faturas do CRM). Será usado quando o fluxo de cobrança por invoice estiver ativo.
        </p>
      </div>

      {/* Status do gateway */}
      <Card>
        <CardHeader>
          <CardTitle>Status do gateway</CardTitle>
          <CardDescription>Estado atual da integração com o Asaas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {loading ? (
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando...
            </span>
          ) : (
            <>
              <StatusBadge status={connectionStatus} />
              {config?.hasCredentials && connectionStatus === 'idle' && (
                <span className="text-sm text-muted-foreground">
                  Clique em &quot;Testar conexão&quot; para verificar.
                </span>
              )}
              {config?.hasCredentials && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    'Testar conexão'
                  )}
                </Button>
              )}
              {fixedGatewayKey && config?.hasCredentials && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/50 hover:bg-destructive/10"
                  onClick={handleDisableGateway}
                  disabled={disabling}
                >
                  {disabling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Ban className="mr-2 h-4 w-4" />
                  )}
                  Desativar gateway
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {config && (
        <Card>
          <CardHeader>
            <CardTitle>Configuração atual</CardTitle>
            <CardDescription>Gateway ativo, ambiente e API Key (mascarada).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
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
              {apiKeyDisplay ? (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{apiKeyDisplay}</code>
              ) : (
                'Não configurada'
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Webhook URL */}
      <Card>
        <CardHeader>
          <CardTitle>URL do webhook</CardTitle>
          <CardDescription>
            Configure esta URL no painel do Asaas para receber notificações de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 rounded bg-muted px-2 py-1.5 text-xs break-all">
              {webhookUrl}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyWebhookUrl}>
              <Copy className="h-4 w-4 mr-1" />
              Copiar
            </Button>
          </div>
          <a
            href={ASAAS_WEBHOOKS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Configurar webhooks no Asaas
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <p className="text-xs text-muted-foreground">
            O Asaas envia este token no header <code>asaas-access-token</code> em cada evento de webhook.
          </p>
          <a
            href={ASAAS_WEBHOOK_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Ver documentação de autenticação do webhook
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Token de autenticação do webhook</CardTitle>
          <CardDescription>
            Defina o token usado no Asaas para autenticar chamadas no webhook deste sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            id="webhook_auth_token_tenant"
            type="password"
            autoComplete="off"
            placeholder={
              webhookAuthTokenDisplay
                ? 'Deixe em branco para manter o token atual'
                : 'Informe o token configurado no Asaas'
            }
            value={form.webhook_auth_token}
            onChange={(e) => setForm((f) => ({ ...f, webhook_auth_token: e.target.value }))}
          />
          {webhookAuthTokenDisplay ? (
            <p className="text-xs text-muted-foreground">
              Token atual: <code>{webhookAuthTokenDisplay}</code>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nenhum token configurado.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alterar configuração</CardTitle>
          <CardDescription>
            Selecione o gateway, ambiente e informe a API Key. Deixe a API Key em branco para manter a atual.
            Após salvar, o sistema testa automaticamente a conexão para ativar a emissão de faturas para clientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 w-full">
              {showGatewaySelect && (
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
              )}

              <div className="grid gap-3 rounded-lg border p-4">
                <div>
                  <Label className="text-base">Métodos no link de pagamento</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ative cada método abaixo para exibi-lo no link de pagamento. A criação de faturas usa o padrão abaixo quando o método não for informado.
                  </p>
                </div>
                <div className="flex flex-col divide-y divide-border rounded-md border border-border bg-muted/30">
                  <div className="flex items-center justify-between gap-4 px-3 py-3">
                    <span className="text-sm font-medium">PIX</span>
                    <Switch
                      checked={payPix}
                      onCheckedChange={(on) => {
                        setPayPix(on);
                        if (!on && defaultPaySlug === 'pix') setDefaultPaySlug(null);
                      }}
                      aria-label="Ativar PIX no link de pagamento"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 px-3 py-3">
                    <span className="text-sm font-medium">Boleto</span>
                    <Switch
                      checked={payBoleto}
                      onCheckedChange={(on) => {
                        setPayBoleto(on);
                        if (!on && defaultPaySlug === 'boleto') setDefaultPaySlug(null);
                      }}
                      aria-label="Ativar boleto no link de pagamento"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 px-3 py-3">
                    <span className="text-sm font-medium">Cartão de crédito</span>
                    <Switch
                      checked={payCard}
                      onCheckedChange={(on) => {
                        setPayCard(on);
                        if (!on && defaultPaySlug === 'credit_card') setDefaultPaySlug(null);
                      }}
                      aria-label="Ativar cartão de crédito no link de pagamento"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Método padrão (faturas automáticas)</Label>
                  <Select
                    value={defaultPaySlug ?? '__auto__'}
                    onValueChange={(v) =>
                      setDefaultPaySlug(v === '__auto__' ? null : (v as GatewayPaySlug))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Automático" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Automático (pix → boleto → cartão entre os ativos)</SelectItem>
                      {payPix ? <SelectItem value="pix">PIX</SelectItem> : null}
                      {payBoleto ? <SelectItem value="boleto">Boleto</SelectItem> : null}
                      {payCard ? <SelectItem value="credit_card">Cartão de crédito</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Ambiente</Label>
                <RadioGroup
                  value={form.env}
                  onValueChange={(v: 'sandbox' | 'production') => setForm((f) => ({ ...f, env: v }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sandbox" id="env-sandbox" />
                    <Label htmlFor="env-sandbox" className="font-normal cursor-pointer">
                      Sandbox
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="production" id="env-production" />
                    <Label htmlFor="env-production" className="font-normal cursor-pointer">
                      Produção
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="api_key_tenant">Nova API Key (opcional)</Label>
                <Input
                  id="api_key_tenant"
                  type="password"
                  autoComplete="off"
                  placeholder={config?.hasCredentials ? 'Deixe em branco para manter a atual' : 'Informe a API Key'}
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                />
                <a
                  href={ASAAS_API_KEY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Gerar API Key no Asaas
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving || enabledGateways.length === 0}>
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

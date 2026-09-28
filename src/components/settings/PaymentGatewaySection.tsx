import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Loader2,
  Ban,
  ExternalLink,
  Circle,
  RefreshCw,
  PlugZap,
  ShieldCheck,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import { SettingsSectionProps } from './types';
import { useAuth } from '@/contexts/AuthContext';

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
type UiOverallStatus = 'not_configured' | 'connecting' | 'connected' | 'attention' | 'error';
type StepState = 'pending' | 'active' | 'success' | 'error';

const MASK = '••••••••';

const API_CONFIG = '/api/me/tenant/payment-gateway';
const API_GATEWAYS = '/api/me/tenant/payment-gateways';
const API_TEST = '/api/me/tenant/payment-gateway/test';
const API_DISABLE = '/api/me/tenant/payment-gateway/disable';
const API_ASAAS_CONNECT = '/api/integrations/asaas/connect';
const API_ASAAS_TEST = '/api/integrations/asaas/test';
const API_ASAAS_RECREATE_WEBHOOK = '/api/integrations/asaas/recreate-webhook';
const API_ASAAS_STATUS = '/api/integrations/asaas/status';

const WEBHOOK_PATH = '/webhooks/asaas';
const ASAAS_API_KEY_URL = 'https://www.asaas.com/customerApiAccessToken/index';
const ASAAS_WEBHOOKS_URL = 'https://www.asaas.com/customerConfigIntegrations/webhooks';
const ASAAS_WEBHOOK_DOCS_URL = 'https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint';

type AsaasIntegrationStatus = {
  api: 'connected' | 'error' | 'not_configured';
  webhook: 'created' | 'pending' | 'error';
  environment: 'sandbox' | 'production' | null;
  webhook_url: string | null;
  webhook_id: string | null;
  last_test_at: string | null;
  last_webhook_received_at: string | null;
  last_webhook_error: string | null;
  friendly_message: string;
  webhook_email?: string | null;
  webhook_events?: string[];
  webhook_auth_token?: string | null;
  gateway_status?: string | null;
};

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
  const { user } = useAuth();
  const [config, setConfig] = useState<PaymentGatewayConfig | null>(null);
  const [gateways, setGateways] = useState<GatewayListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [recreatingWebhook, setRecreatingWebhook] = useState(false);
  const [savingManualToken, setSavingManualToken] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [asaasStatus, setAsaasStatus] = useState<AsaasIntegrationStatus | null>(null);
  const [form, setForm] = useState({
    gateway_key: '',
    api_key: '',
    webhook_auth_token: '',
    webhook_email: '',
    env: 'sandbox' as 'sandbox' | 'production',
  });
  const [manualTokenEnabled, setManualTokenEnabled] = useState(false);
  const [payPix, setPayPix] = useState(true);
  const [payBoleto, setPayBoleto] = useState(true);
  const [payCard, setPayCard] = useState(true);
  const [defaultPaySlug, setDefaultPaySlug] = useState<GatewayPaySlug | null>(null);
  /** Quando true, enviamos `notificationDisabled` aos clientes Asaas (padrão do produto). */
  const [asaasDisableCustomerNotifications, setAsaasDisableCustomerNotifications] = useState(true);

  const load = async (opts?: { preserveConnectionStatus?: boolean }) => {
    setLoading(true);
    const [configRes, gatewaysRes, asaasStatusRes] = await Promise.all([
      apiClient.get<PaymentGatewayConfig | null>(API_CONFIG),
      apiClient.get<GatewayListItem[]>(API_GATEWAYS),
      apiClient.get<AsaasIntegrationStatus>(API_ASAAS_STATUS),
    ]);
    let cfg = configRes.data ?? null;
    if (fixedGatewayKey && cfg && cfg.gateway_key !== fixedGatewayKey) cfg = null;
    if (configRes.data !== undefined) setConfig(cfg);
    if (configRes.error) toast.error(configRes.error);
    if (gatewaysRes.data) setGateways(gatewaysRes.data);
    if (gatewaysRes.error) toast.error(gatewaysRes.error);
    if (asaasStatusRes.data) setAsaasStatus(asaasStatusRes.data);
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
        webhook_email: asaasStatus?.webhook_email ?? user?.email ?? '',
        env: (config.options?.env as string) === 'production' ? 'production' : 'sandbox',
      }));
      if (!config.hasCredentials) setConnectionStatus('not_configured');
    } else if (gateways.length > 0 && targetKey) {
      setForm((f) => ({ ...f, gateway_key: targetKey }));
      setConnectionStatus('not_configured');
    }
  }, [config, gateways, fixedGatewayKey, asaasStatus?.webhook_email, user?.email]);

  const isAsaasGateway = (fixedGatewayKey || form.gateway_key || config?.gateway_key) === 'asaas';

  const handleConnectAsaas = async () => {
    if (!isAsaasGateway) return;
    if (!form.api_key.trim() && !config?.hasCredentials) {
      toast.error('Informe a API Key para conectar.');
      return;
    }
    setConnecting(true);
    const res = await apiClient.post<{ ok: boolean; status: AsaasIntegrationStatus }>(API_ASAAS_CONNECT, {
      environment: form.env,
      apiKey: form.api_key.trim(),
      webhookEmail: form.webhook_email.trim() || null,
      webhookAuthTokenManual: manualTokenEnabled ? form.webhook_auth_token.trim() : null,
    });
    setConnecting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setAsaasStatus(res.data?.status ?? null);
    toast.success('Integração Asaas conectada com sucesso.');
    setConnectionStatus('connected');
    setForm((f) => ({ ...f, api_key: '' }));
    await load({ preserveConnectionStatus: true });
  };

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

  useEffect(() => {
    if (!config) return;
    setAsaasDisableCustomerNotifications(config.options?.asaas_disable_customer_notifications !== false);
  }, [config?.id, config?.options?.asaas_disable_customer_notifications]);

  const handleTestConnection = async () => {
    if (!config?.hasCredentials && !form.api_key.trim()) {
      toast.error('Configure a API Key antes de testar.');
      return;
    }
    setTesting(true);
    setConnectionStatus('idle');
    const res = isAsaasGateway
      ? await apiClient.post<{ ok: boolean; connected: boolean; status: AsaasIntegrationStatus; error?: string }>(API_ASAAS_TEST, {
          environment: form.env,
          apiKey: form.api_key.trim() || undefined,
        })
      : await apiClient.post<{ connected: boolean; error?: string }>(API_TEST, {});
    setTesting(false);
    if (isAsaasGateway && (res.data as { status?: AsaasIntegrationStatus } | undefined)?.status) {
      setAsaasStatus((res.data as { status: AsaasIntegrationStatus }).status);
    }
    if (res.data?.connected) {
      setConnectionStatus('connected');
      toast.success('Conexão com o gateway realizada com sucesso.');
    } else {
      const err = res.data?.error || res.error || 'Falha ao testar conexão.';
      setConnectionStatus(err.toLowerCase().includes('autenticação') ? 'auth_error' : 'error');
      toast.error(err);
    }
  };

  const handleRecreateWebhook = async () => {
    if (!isAsaasGateway) return;
    setRecreatingWebhook(true);
    const res = await apiClient.post<{ ok: boolean; status: AsaasIntegrationStatus }>(API_ASAAS_RECREATE_WEBHOOK, {
      webhookEmail: form.webhook_email.trim() || null,
      webhookAuthTokenManual: manualTokenEnabled ? form.webhook_auth_token.trim() : null,
    });
    setRecreatingWebhook(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setAsaasStatus(res.data?.status ?? null);
    toast.success('Webhook recriado com sucesso.');
    await load({ preserveConnectionStatus: true });
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
      options: {
        env: form.env,
        asaas_disable_customer_notifications: asaasDisableCustomerNotifications,
      },
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

    if (isAsaasGateway) {
      await handleConnectAsaas();
      return;
    }

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
    const url = webhookUrl;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success('URL copiada.');
    }
  };

  const copyWebhookToken = () => {
    const token = activeWebhookAuthToken.trim();
    if (!token) {
      toast.error('Nenhum token ativo disponível para cópia.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(token);
      toast.success(manualTokenEnabled && form.webhook_auth_token.trim() ? 'Token manual copiado.' : 'Token automático copiado.');
    }
  };

  const handleSaveManualToken = async () => {
    const token = form.webhook_auth_token.trim();
    if (!manualTokenEnabled) {
      toast.error('Ative a opção de token manual.');
      return;
    }
    if (!token || token.length < 32 || token.length > 255 || /\s/.test(token)) {
      toast.error('Token inválido. Use entre 32 e 255 caracteres, sem espaços.');
      return;
    }
    setSavingManualToken(true);
    const res = await apiClient.post<{ ok: boolean; status: AsaasIntegrationStatus }>(API_ASAAS_CONNECT, {
      environment: form.env,
      apiKey: form.api_key.trim() || undefined,
      webhookEmail: form.webhook_email.trim() || null,
      webhookAuthTokenManual: token,
    });
    setSavingManualToken(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setAsaasStatus(res.data?.status ?? null);
    toast.success('Token manual salvo.');
    await load({ preserveConnectionStatus: true });
  };

  const handleGenerateManualToken = () => {
    const bytes = new Uint8Array(48);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
    setManualTokenEnabled(true);
    setForm((f) => ({ ...f, webhook_auth_token: token }));
    toast.success('Token manual gerado.');
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
  const activeWebhookAuthToken = form.webhook_auth_token.trim() || (asaasStatus?.webhook_auth_token ?? '');
  const webhookUrl = asaasStatus?.webhook_url || getWebhookUrl(config);
  const isBusy = connecting || saving || testing || recreatingWebhook;

  const overallStatus: UiOverallStatus = !asaasStatus || asaasStatus.api === 'not_configured'
    ? 'not_configured'
    : isBusy
      ? 'connecting'
      : asaasStatus.api === 'connected' && asaasStatus.webhook === 'created'
        ? 'connected'
        : asaasStatus.api === 'error' || asaasStatus.webhook === 'error'
          ? 'error'
          : 'attention';

  const step1: StepState = asaasStatus?.api === 'connected'
    ? 'success'
    : asaasStatus?.api === 'error'
      ? 'error'
      : isBusy
        ? 'active'
        : 'pending';
  const step2: StepState = asaasStatus?.webhook === 'created'
    ? 'success'
    : asaasStatus?.webhook === 'error'
      ? 'error'
      : step1 === 'success'
        ? 'active'
        : 'pending';
  const step3: StepState = asaasStatus?.api === 'connected' && asaasStatus?.webhook === 'created'
    ? 'success'
    : step2 === 'active'
      ? 'pending'
      : 'pending';

  const connectLabel = !config?.hasCredentials
    ? 'Conectar Asaas'
    : asaasStatus?.api === 'connected' && asaasStatus?.webhook !== 'created'
      ? 'Ativar integração'
      : 'Atualizar conexão';

  const checklist = [
    {
      label: 'Conta Asaas conectada',
      state: asaasStatus?.api === 'connected' ? 'success' : asaasStatus?.api === 'error' ? 'error' : isBusy ? 'active' : 'pending',
    },
    {
      label: 'Webhook automático configurado',
      state: asaasStatus?.webhook === 'created' ? 'success' : asaasStatus?.webhook === 'error' ? 'error' : step1 === 'success' ? 'active' : 'pending',
    },
    {
      label: 'Atualização automática de faturas ativa',
      state: asaasStatus?.api === 'connected' && asaasStatus?.webhook === 'created' ? 'success' : 'pending',
    },
  ] as const;

  const stepIcon = (state: StepState) => {
    if (state === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (state === 'error') return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (state === 'active') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  if (!isAsaasGateway) {
  return (
      <Card>
        <CardHeader>
          <CardTitle>Gateway de pagamento</CardTitle>
          <CardDescription>Selecione e configure um gateway.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                      <SelectItem key={g.key} value={g.key}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            <Button type="submit" disabled={saving || enabledGateways.length === 0}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PlugZap className="h-5 w-5 text-primary" />
                Conectar Asaas
              </CardTitle>
              <CardDescription className="mt-1">
                Configure sua conta Asaas para emitir cobranças, receber pagamentos e atualizar faturas automaticamente.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{form.env === 'production' ? 'Produção' : 'Sandbox'}</Badge>
              <Badge variant={overallStatus === 'connected' ? 'default' : 'secondary'}>
                {overallStatus === 'connected'
                  ? 'Conectado'
                  : overallStatus === 'connecting'
                    ? 'Conectando'
                    : overallStatus === 'attention'
                      ? 'Atenção necessária'
                      : overallStatus === 'error'
                        ? 'Erro'
                        : 'Não configurado'}
              </Badge>
            </div>
                </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progresso da integração</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-4/5" />
                  </div>
          ) : (
            <>
              <div className="hidden items-center gap-3 md:flex">
                <div className="flex items-center gap-2">{stepIcon(step1)} <span className="text-sm">1. Dados de acesso</span></div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2">{stepIcon(step2)} <span className="text-sm">2. Configuração automática</span></div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2">{stepIcon(step3)} <span className="text-sm">3. Integração pronta</span></div>
                  </div>
              <div className="space-y-2 md:hidden">
                <div className="flex items-center gap-2">{stepIcon(step1)} <span className="text-sm">Dados de acesso</span></div>
                <div className="flex items-center gap-2">{stepIcon(step2)} <span className="text-sm">Configuração automática</span></div>
                <div className="flex items-center gap-2">{stepIcon(step3)} <span className="text-sm">Integração pronta</span></div>
                  </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Status da integração</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 min-w-0">
            {loading ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : (
              <>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Resumo</AlertTitle>
                  <AlertDescription>
                    {asaasStatus?.friendly_message ||
                      'Conecte sua conta Asaas para começar a receber pagamentos pelo PainelCRM.'}
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm">
                      {stepIcon(item.state as StepState)}
                      <span>{item.label}</span>
                </div>
                  ))}
                </div>
                {asaasStatus?.api === 'connected' && asaasStatus.webhook !== 'created' ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {asaasStatus?.last_webhook_error?.toLowerCase().includes('url pública')
                      ? 'A conexão com o Asaas está ativa, mas o webhook não pôde ser criado porque a URL pública do sistema ainda não está configurada.'
                      : 'Falta só um passo para finalizar a integração. Clique em Ativar integração para configurar automaticamente o recebimento de atualizações do Asaas.'}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Dados da conexão</CardTitle>
            <CardDescription>Preencha os dados e conclua a integração guiada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 min-w-0 max-w-full overflow-hidden">
              <div className="grid gap-2">
                <Label>Ambiente</Label>
                <RadioGroup
                  value={form.env}
                  onValueChange={(v: 'sandbox' | 'production') => setForm((f) => ({ ...f, env: v }))}
                className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sandbox" id="env-sandbox" />
                  <Label htmlFor="env-sandbox">Sandbox</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="production" id="env-production" />
                  <Label htmlFor="env-production">Produção</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div className="min-w-0 space-y-1 pr-2">
                  <Label htmlFor="asaas-disable-customer-notif">Desligar notificações Asaas</Label>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, o PainelCRM envia notificationDisabled ao criar ou atualizar clientes no Asaas. Assim, o
                    cliente não recebe notificações automáticas do Asaas, mantendo apenas as notificações configuradas no
                    sistema.
                  </p>
                </div>
                <Switch
                  id="asaas-disable-customer-notif"
                  checked={asaasDisableCustomerNotifications}
                  onCheckedChange={setAsaasDisableCustomerNotifications}
                  className="shrink-0"
                />
              </div>

              <div className="grid gap-2">
              <Label htmlFor="api_key_tenant">Nova API Key</Label>
                <Input
                  id="api_key_tenant"
                  type="password"
                  autoComplete="off"
                placeholder="Cole aqui sua API Key do Asaas"
                  value={form.api_key}
                  onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                />
              {config?.hasCredentials ? (
                <p className="text-xs text-muted-foreground">
                  Uma API Key já está configurada. Preencha apenas se desejar substituir.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="webhook_email_tenant">E-mail para notificações do webhook</Label>
              <Input
                id="webhook_email_tenant"
                type="email"
                autoComplete="off"
                placeholder="financeiro@empresa.com"
                value={form.webhook_email}
                onChange={(e) => setForm((f) => ({ ...f, webhook_email: e.target.value }))}
              />
            </div>

            <div className="flex w-full min-w-0 flex-col flex-wrap gap-2 md:flex-row">
              <Button type="button" onClick={handleConnectAsaas} disabled={connecting} className="w-full md:w-auto">
                {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                {connecting ? 'Configurando integração...' : connectLabel}
              </Button>
              <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testing} className="w-full md:w-auto">
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Testar conexão
              </Button>
              <Button type="button" variant="outline" onClick={handleRecreateWebhook} disabled={recreatingWebhook} className="w-full md:w-auto">
                {recreatingWebhook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Reconfigurar webhook
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <a href={ASAAS_API_KEY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                Gerar API Key <ExternalLink className="h-3 w-3" />
              </a>
              <a href={ASAAS_WEBHOOKS_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                Webhooks no Asaas <ExternalLink className="h-3 w-3" />
                </a>
              </div>
          </CardContent>
        </Card>
      </div>

      {asaasStatus?.api === 'connected' && asaasStatus.webhook === 'created' ? (
        <Card>
          <CardHeader>
            <CardTitle>Integração pronta para uso</CardTitle>
            <CardDescription>
              Agora o PainelCRM pode emitir cobranças pelo Asaas e atualizar suas faturas automaticamente quando houver pagamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => navigate('/customer-invoices/new')}>Criar cobrança</Button>
            <Button type="button" variant="outline" onClick={() => navigate('/customer-invoices')}>Ver faturas</Button>
            <Button type="button" variant="outline" onClick={handleTestConnection} disabled={testing}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Testar integração
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Accordion type="single" collapsible>
        <AccordionItem value="advanced">
          <AccordionTrigger>Configurações avançadas</AccordionTrigger>
          <AccordionContent>
            <Card className="w-full min-w-0 overflow-hidden">
              <CardContent className="space-y-3 pt-6 text-sm min-w-0">
                <p><span className="text-muted-foreground">Gateway atual:</span> {config?.gateway_key || 'asaas'}</p>
                <p><span className="text-muted-foreground">Ambiente:</span> {form.env === 'production' ? 'Produção' : 'Sandbox'}</p>
                <p><span className="text-muted-foreground">API Key:</span> <code>{apiKeyDisplay || 'Não configurada'}</code></p>
                <p className="min-w-0"><span className="text-muted-foreground">URL do webhook:</span> <code className="block max-w-full overflow-hidden text-ellipsis text-xs">{webhookUrl}</code></p>
                <p><span className="text-muted-foreground">Token webhook:</span> <code>{webhookAuthTokenDisplay || 'Não configurado'}</code></p>
                <p><span className="text-muted-foreground">Webhook ID:</span> {asaasStatus?.webhook_id || '—'}</p>
                <p><span className="text-muted-foreground">Último teste:</span> {asaasStatus?.last_test_at ? new Date(asaasStatus.last_test_at).toLocaleString('pt-BR') : '—'}</p>
                <p><span className="text-muted-foreground">Último evento recebido:</span> {asaasStatus?.last_webhook_received_at ? new Date(asaasStatus.last_webhook_received_at).toLocaleString('pt-BR') : '—'}</p>
                <p><span className="text-muted-foreground">Último erro:</span> {asaasStatus?.last_webhook_error || '—'}</p>
                <Separator />
                <div className="space-y-3">
                  <h4 className="font-medium">Token de autenticação do webhook</h4>
                  <p className="text-xs text-muted-foreground">
                    Por segurança, o PainelCRM gera esse token automaticamente. Use um token manual apenas se você for configurar o webhook diretamente no painel do Asaas.
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <Input
                      type="password"
                      value={webhookAuthTokenDisplay || ''}
                      readOnly
                      className="min-w-0"
                      placeholder="Token mascarado"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={copyWebhookToken}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar token
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="manual-token"
                      checked={manualTokenEnabled}
                      onCheckedChange={(checked) => setManualTokenEnabled(Boolean(checked))}
                    />
                    <Label htmlFor="manual-token">Quero informar um token manualmente</Label>
                  </div>
                  {manualTokenEnabled ? (
                    <div className="flex min-w-0 flex-col gap-2 md:flex-row">
                      <Input
                        type="password"
                        autoComplete="off"
                        value={form.webhook_auth_token}
                        onChange={(e) => setForm((f) => ({ ...f, webhook_auth_token: e.target.value }))}
                        placeholder="Novo token manual (32 a 255 caracteres, sem espaços)"
                        className="min-w-0"
                      />
                      <Button type="button" variant="outline" onClick={handleGenerateManualToken} className="w-full md:w-auto">
                        Gerar token
                      </Button>
                      <Button type="button" onClick={handleSaveManualToken} disabled={savingManualToken} className="w-full md:w-auto">
                        {savingManualToken ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Salvar token
                </Button>
              </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={copyWebhookUrl}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar URL do webhook
                  </Button>
                  {fixedGatewayKey && config?.hasCredentials ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                      onClick={handleDisableGateway}
                      disabled={disabling}
                    >
                      {disabling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                      Desativar gateway
                    </Button>
                  ) : null}
                </div>
        </CardContent>
      </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

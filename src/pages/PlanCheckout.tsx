import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/integrations/api/client';
import { toast } from 'sonner';
import {
  Loader2,
  Copy,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Building2,
  FileCheck,
  CreditCard,
  Minus,
  Plus,
  Check,
  Users,
  MessageCircle,
  Mail,
  Headphones,
  Star,
  Zap,
  Shield,
  FileText,
  BarChart3,
  Settings,
  Smartphone,
  Globe,
  Lock,
  Gift,
  Calendar,
  QrCode,
  Banknote,
} from 'lucide-react';
import LandingLayout from '@/landingpage/components/LandingLayout';

const BILLING_INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

const PAYMENT_METHODS = [
  { value: 'PIX' as const, label: 'PIX', icon: QrCode, description: 'Pagamento instantâneo via PIX' },
  { value: 'CREDIT_CARD' as const, label: 'Cartão de crédito', icon: CreditCard, description: 'Pague com cartão de crédito' },
  { value: 'BOLETO' as const, label: 'Boleto', icon: Banknote, description: 'Pague via boleto bancário' },
];

interface IntervalPrice {
  billing_interval: string;
  price_per_user_cents: number;
}

export interface PlanCheckoutPlan {
  id: string;
  name: string;
  plan_type: 'standard' | 'custom';
  price_cents: number;
  interval_prices?: IntervalPrice[];
  description?: string | null;
  benefits?: { icon?: string; label: string }[];
}

interface CheckoutLocationState {
  plan: PlanCheckoutPlan;
  billingInterval: string;
  usersCount?: number;
}

interface CompanyData {
  company_name: string;
  cpf_cnpj: string;
  email: string;
  phone: string;
  responsible_name: string;
}

interface PurchaseResult {
  billing_id: string;
  invoice_number?: string;
  amount_cents: number;
  status: string;
  tenant_id: string;
  payment_method?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
}

interface BillingStatusResponse {
  billing_id: string;
  status: 'pending' | 'paid' | 'overdue';
  tenant_status: string | null;
}

function formatPrice(cents: number): string {
  if (cents === 0) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copiado!'),
    () => toast.error('Não foi possível copiar')
  );
}

const BENEFIT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Check,
  Users,
  MessageCircle,
  Mail,
  Headphones,
  Star,
  Zap,
  Shield,
  FileText,
  BarChart3,
  Settings,
  Smartphone,
  Globe,
  Lock,
  Gift,
  CreditCard,
  Building2,
  Calendar,
};

const STEPS = [
  { id: 1, title: 'Dados da empresa', icon: Building2 },
  { id: 2, title: 'Revisão', icon: FileCheck },
  { id: 3, title: 'Pagamento', icon: CreditCard },
];

export default function PlanCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as CheckoutLocationState | null;

  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<PlanCheckoutPlan | null>(state?.plan ?? null);
  const [billingInterval, setBillingInterval] = useState(state?.billingInterval ?? 'monthly');
  const [usersCount, setUsersCount] = useState(state?.usersCount ?? 1);

  const [company, setCompany] = useState<CompanyData>({
    company_name: '',
    cpf_cnpj: '',
    email: '',
    phone: '',
    responsible_name: '',
  });

  const [paymentMethod, setPaymentMethod] = useState<'BOLETO' | 'PIX' | 'CREDIT_CARD'>('PIX');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectParamsRef = useRef<{ isLoggedIn: boolean; tenantId?: string; prefill?: { name?: string; email?: string } } | null>(null);

  const isLoggedIn = !!apiClient.getToken();
  const isCustom = plan?.plan_type === 'custom';
  const prices = plan?.interval_prices ?? [];
  const priceRow = prices.find((p) => p.billing_interval === billingInterval);
  const amountCents =
    plan && isCustom && priceRow
      ? priceRow.price_per_user_cents * usersCount
      : plan?.price_cents ?? 0;

  const intervalLabel = BILLING_INTERVALS.find((i) => i.key === billingInterval)?.label ?? billingInterval;
  const periodLabel = isCustom ? (billingInterval === 'yearly' ? 'ano' : billingInterval === 'monthly' ? 'mês' : 'período') : 'mês';
  const hasIntervalSelector = isCustom && prices.length > 1;
  const intervalIdx = BILLING_INTERVALS.findIndex((i) => i.key === billingInterval);
  const canPrevInterval = hasIntervalSelector && intervalIdx > 0;
  const canNextInterval = hasIntervalSelector && intervalIdx >= 0 && intervalIdx < BILLING_INTERVALS.length - 1;

  useEffect(() => {
    if (state?.plan) {
      setPlan(state.plan);
      setBillingInterval(state.billingInterval ?? 'monthly');
      setUsersCount(state.usersCount ?? 1);
    }
  }, [state]);

  useEffect(() => {
    if (!plan && !state?.plan) {
      navigate('/landing', { replace: true });
    }
  }, [plan, state, navigate]);

  // Polling do status da cobrança (PIX/boleto): a cada 5s, timeout 10 min
  useEffect(() => {
    const billingId = result?.billing_id;
    if (!billingId) return;

    const POLL_INTERVAL_MS = 5_000;
    const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutos

    const onPaymentConfirmed = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pollingRef.current = null;
      timeoutRef.current = null;
      redirectParamsRef.current = {
        isLoggedIn,
        tenantId: result!.tenant_id,
        prefill: { name: company.responsible_name, email: company.email },
      };
      setPaymentConfirmed(true);
    };

    const checkStatus = async () => {
      const res = await apiClient.get<BillingStatusResponse>(`/api/billing/${billingId}/status`);
      if (res.error || !res.data) return;
      const { status, tenant_status } = res.data;
      if (status === 'paid' || tenant_status === 'active') {
        onPaymentConfirmed();
      }
    };

    pollingRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    checkStatus(); // primeira verificação imediata

    timeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      timeoutRef.current = null;
    }, POLL_TIMEOUT_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pollingRef.current = null;
      timeoutRef.current = null;
    };
  }, [result?.billing_id, result?.tenant_id, isLoggedIn, navigate, company.responsible_name, company.email]);

  // Após mostrar tela de sucesso (1,5s), redireciona para onboarding ou dashboard
  useEffect(() => {
    if (!paymentConfirmed) return;
    const t = setTimeout(() => {
      const params = redirectParamsRef.current;
      if (params?.isLoggedIn) {
        navigate('/dashboard', { replace: true });
      } else if (params?.tenantId) {
        navigate('/onboarding', {
          state: { tenantId: params.tenantId, prefill: params.prefill },
          replace: true,
        });
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [paymentConfirmed, navigate]);

  const validateStep1 = (): boolean => {
    if (isLoggedIn) return true;
    if (!company.company_name?.trim()) {
      toast.error('Informe o nome da empresa.');
      return false;
    }
    if (!company.email?.trim()) {
      toast.error('Informe o e-mail.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(company.email.trim())) {
      toast.error('E-mail inválido.');
      return false;
    }
    if (!company.responsible_name?.trim()) {
      toast.error('Informe o nome do responsável.');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handlePayment = async () => {
    if (!plan) return;
    setLoading(true);
    setResult(null);
    const body: Record<string, unknown> = {
      plan_id: plan.id,
      billing_interval: billingInterval,
      payment_method: paymentMethod,
    };
    if (isCustom) body.users_count = usersCount;
    if (!isLoggedIn) {
      body.company_name = company.company_name.trim();
      body.email = company.email.trim();
      body.responsible_name = company.responsible_name.trim();
      if (company.cpf_cnpj?.trim()) body.cpf_cnpj = company.cpf_cnpj.replace(/\D/g, '');
      if (company.phone?.trim()) body.phone = company.phone.trim();
    } else {
      if (company.company_name?.trim()) body.company_name = company.company_name.trim();
      if (company.email?.trim()) body.email = company.email.trim();
      if (company.responsible_name?.trim()) body.responsible_name = company.responsible_name.trim();
      if (company.cpf_cnpj?.trim()) body.cpf_cnpj = company.cpf_cnpj.replace(/\D/g, '');
      if (company.phone?.trim()) body.phone = company.phone.trim();
    }

    const res = await apiClient.post<PurchaseResult>('/api/plan-purchase', body);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.data) {
      setResult(res.data);
      toast.success('Cobrança gerada. Realize o pagamento para ativar seu plano.');
    }
  };

  if (!plan) {
    return (
      <LandingLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </LandingLayout>
    );
  }

  return (
    <LandingLayout>
      <div className="py-8 bg-muted/30">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-8">
            <h1 className="text-2xl font-bold">Checkout — {plan.name}</h1>
          </div>

          <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
            {/* Card do plano (esquerda) — igual à home */}
            <div className="relative flex flex-col rounded-xl border border-border/50 bg-card p-6 lg:sticky lg:top-6 lg:self-start">
              <h3 className="font-display text-xl font-bold text-foreground">{plan.name}</h3>
              {plan.description && (
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {hasIntervalSelector && (
                  <button
                    type="button"
                    aria-label="Intervalo anterior"
                    onClick={() => {
                      const prev = BILLING_INTERVALS[Math.max(0, intervalIdx - 1)];
                      if (prev) setBillingInterval(prev.key);
                    }}
                    disabled={!canPrevInterval}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold text-foreground">
                    {formatPrice(amountCents)}
                  </span>
                  <span className="text-muted-foreground">/{periodLabel}</span>
                </div>
                {hasIntervalSelector && (
                  <button
                    type="button"
                    aria-label="Próximo intervalo"
                    onClick={() => {
                      const next = BILLING_INTERVALS[Math.min(BILLING_INTERVALS.length - 1, intervalIdx + 1)];
                      if (next) setBillingInterval(next.key);
                    }}
                    disabled={!canNextInterval}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
              </div>
              {hasIntervalSelector && (
                <p className="mt-1 text-xs text-muted-foreground">{intervalLabel}</p>
              )}

              {isCustom && (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Usuários</span>
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
                    <button
                      type="button"
                      aria-label="Menos um usuário"
                      onClick={() => setUsersCount((c) => Math.max(1, c - 1))}
                      disabled={usersCount <= 1}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[2rem] text-center font-semibold text-foreground">
                      {usersCount}
                    </span>
                    <button
                      type="button"
                      aria-label="Mais um usuário"
                      onClick={() => setUsersCount((c) => c + 1)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Benefícios */}
              <ul className="mt-6 flex-1 space-y-3">
                {Array.isArray(plan.benefits) && plan.benefits.length > 0 ? (
                  plan.benefits.map((b, i) => {
                    const IconC = b.icon ? BENEFIT_ICON_MAP[b.icon] ?? Check : Check;
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
                        <IconC className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {b.label}
                      </li>
                    );
                  })
                ) : (
                  <li className="text-sm text-muted-foreground">—</li>
                )}
              </ul>
            </div>

            {/* Etapas (direita) */}
            <div>
              <div className="flex items-center gap-2 mb-6">
                {STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const active = step === s.id;
                  const done = step > s.id;
                  return (
                    <span key={s.id} className="inline-flex items-center gap-2">
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{s.title}</span>
                      </div>
                      {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </span>
                  );
                })}
              </div>

              <Card>
          <CardHeader>
            <CardTitle>{STEPS[step - 1].title}</CardTitle>
            <CardDescription>
              {step === 1 && 'Preencha os dados da empresa para faturamento e suporte.'}
              {step === 2 && 'Confira o resumo antes de gerar o pagamento.'}
              {step === 3 && !result && 'Escolha a forma de pagamento e confirme.'}
              {step === 3 && result && 'Aguardando pagamento. Use um dos links ou o PIX abaixo.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1 — Dados da empresa */}
            {step === 1 && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleNext();
                }}
                className="space-y-4"
              >
                <div>
                  <Label htmlFor="company_name">Nome da empresa *</Label>
                  <Input
                    id="company_name"
                    value={company.company_name}
                    onChange={(e) => setCompany((c) => ({ ...c, company_name: e.target.value }))}
                    placeholder="Razão social ou nome fantasia"
                    required={!isLoggedIn}
                  />
                </div>
                <div>
                  <Label htmlFor="cpf_cnpj">CPF ou CNPJ</Label>
                  <Input
                    id="cpf_cnpj"
                    value={company.cpf_cnpj}
                    onChange={(e) => setCompany((c) => ({ ...c, cpf_cnpj: e.target.value }))}
                    placeholder="Somente números"
                  />
                </div>
                <div>
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany((c) => ({ ...c, email: e.target.value }))}
                    placeholder="email@empresa.com"
                    required={!isLoggedIn}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={company.phone}
                    onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                  />
                </div>
                <div>
                  <Label htmlFor="responsible_name">Nome do responsável *</Label>
                  <Input
                    id="responsible_name"
                    value={company.responsible_name}
                    onChange={(e) => setCompany((c) => ({ ...c, responsible_name: e.target.value }))}
                    placeholder="Nome completo"
                    required={!isLoggedIn}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Continuar</Button>
                </div>
              </form>
            )}

            {/* Step 2 — Revisão */}
            {step === 2 && (
              <div className="space-y-4">
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Plano</dt>
                    <dd className="font-medium">{plan.name}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Intervalo</dt>
                    <dd className="font-medium">
                      {BILLING_INTERVALS.find((i) => i.key === billingInterval)?.label ?? billingInterval}
                    </dd>
                  </div>
                  {isCustom && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Usuários</dt>
                      <dd className="font-medium">{usersCount}</dd>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold pt-2 border-t">
                    <dt>Valor total</dt>
                    <dd>{formatPrice(amountCents)}</dd>
                  </div>
                </dl>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleBack}>
                    Voltar
                  </Button>
                  <Button onClick={handleNext}>Confirmar e ir ao pagamento</Button>
                </div>
              </div>
            )}

            {/* Step 3 — Pagamento */}
            {step === 3 && !result && (
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-medium">Forma de pagamento</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Escolha como deseja pagar.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {PAYMENT_METHODS.map((pm) => {
                      const Icon = pm.icon;
                      const isSelected = paymentMethod === pm.value;
                      return (
                        <button
                          key={pm.value}
                          type="button"
                          onClick={() => setPaymentMethod(pm.value)}
                          className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
                          }`}
                        >
                          <div className={`rounded-full p-3 ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                            <Icon className="h-8 w-8" />
                          </div>
                          <span className="font-semibold">{pm.label}</span>
                          <span className="text-center text-xs text-muted-foreground">
                            {pm.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-lg font-semibold">{formatPrice(amountCents)}</p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleBack}>
                    Voltar
                  </Button>
                  <Button onClick={handlePayment} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      'Gerar cobrança'
                    )}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && result && (
              <div className="space-y-4">
                {paymentConfirmed ? (
                  <div className="py-8 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="rounded-full bg-green-500/20 p-4">
                      <Check className="h-12 w-12 text-green-600" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">Pagamento confirmado!</p>
                      <p className="text-sm text-muted-foreground mt-1">Redirecionando para configurar sua conta...</p>
                    </div>
                  </div>
                ) : (result.pix_qr_code || result.pix_copy_paste) ? (
                  /* Área de pagamento PIX */
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Finalizar pagamento</h3>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-medium text-foreground">{plan?.name}</span>
                        <span className="text-muted-foreground">
                          {formatPrice(result.amount_cents)} / {periodLabel}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 rounded-lg border bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                        <span className="text-lg" aria-hidden>🟡</span>
                        <span className="font-medium">Aguardando pagamento</span>
                      </div>
                    </div>

                    {result.pix_qr_code && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Escaneie o QR Code</p>
                        <div className="flex justify-center rounded-xl border bg-white p-4 dark:bg-muted/30">
                          <img
                            src={result.pix_qr_code}
                            alt="QR Code PIX"
                            className="h-56 w-56 min-h-[224px] min-w-[224px] object-contain"
                          />
                        </div>
                      </div>
                    )}

                    {result.pix_copy_paste && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={result.pix_copy_paste}
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="shrink-0"
                            onClick={() => copyToClipboard(result.pix_copy_paste!)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    <p className="text-center text-sm text-muted-foreground">
                      Após o pagamento o acesso será liberado automaticamente
                    </p>

                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => (isLoggedIn ? navigate('/meu-plano') : navigate('/landing'))}
                    >
                      Concluir depois
                    </Button>
                  </div>
                ) : (
                  /* Boleto / link de pagamento */
                  <>
                    <p className="text-sm text-muted-foreground">
                      Fatura <strong>{result.invoice_number ?? result.billing_id}</strong> —{' '}
                      {formatPrice(result.amount_cents)}
                    </p>
                    <p className="text-sm font-medium">Aguardando pagamento</p>
                    {result.invoice_url && (
                      <Button variant="outline" className="w-full gap-2" asChild>
                        <a href={result.invoice_url} target="_blank" rel="noopener noreferrer">
                          Abrir página de pagamento
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {result.bank_slip_url && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Boleto</Label>
                        <Button variant="outline" size="sm" className="w-full mt-1 gap-2" asChild>
                          <a href={result.bank_slip_url} target="_blank" rel="noopener noreferrer">
                            Ver boleto
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    )}
                    <Button
                      className="w-full"
                      onClick={() => (isLoggedIn ? navigate('/meu-plano') : navigate('/landing'))}
                    >
                      Concluir
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
            </div>
          </div>
        </div>
      </div>
    </LandingLayout>
  );
}

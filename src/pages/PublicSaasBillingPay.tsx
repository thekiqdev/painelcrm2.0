/**
 * Página pública: pagar a mesma tenant_billing via /saas-pay/:token (sem checkout comercial).
 * UI alinhada ao branding PainelCRM — lógica de API e pagamento inalterada.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApiGet, publicApiPost } from '@/integrations/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/sonner';
import { formatMoneyBRL } from '@/lib/planCheckoutDisplay';
import { formatInvoiceDueDatePtBr } from '@/lib/formatInvoiceDates';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Copy,
  ExternalLink,
  CreditCard,
  QrCode,
  Banknote,
  Check,
  Shield,
  Building2,
  CalendarRange,
  Receipt,
  ChevronDown,
  LifeBuoy,
  Lock,
} from 'lucide-react';
import {
  type SaasBillingPurchaseResult,
  type PlanPurchasePm,
  normalizePlanPurchasePaymentMethod,
  hasRenderablePayloadForMethod,
  buildSaasBillingDisplayResult,
} from '@/lib/saasBillingPayHelpers';
import {
  InlineCreditCardPaymentForm,
  createEmptyInlineCreditCardForm,
  type InlineCreditCardFormState,
} from '@/components/payments/InlineCreditCardPaymentForm';
import { PixAutomaticConsentSwitch, isPixAutomaticDefaultOnBillingReason } from '@/components/billing/PixAutomaticConsentSwitch';
import {
  resolvePixAutomaticSwitchOn,
  usePixAutomaticAutoEnable,
} from '@/lib/pixAutomaticCheckoutUx';

const PAY_METHODS = [
  { value: 'PIX' as const, label: 'PIX', icon: QrCode },
  { value: 'BOLETO' as const, label: 'Boleto', icon: Banknote },
  { value: 'CREDIT_CARD' as const, label: 'Cartão', icon: CreditCard },
];

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copiado!'),
    () => toast.error('Não foi possível copiar')
  );
}

function isPublicToken(s: string | undefined): boolean {
  if (!s) return false;
  return /^[a-f0-9]{64}$/i.test(s.trim());
}

interface SummaryResponse {
  ok: boolean;
  platform_name: string;
  platform_invoice_url: string;
  platform_support_url?: string | null;
  gateway_fallback_url: string | null;
  invoice_number: string | null;
  status: string;
  amount_cents: number;
  due_date: string;
  plan_label: string;
  billing_reason?: string;
  billing_reason_label: string;
  billing_interval: string | null;
  billing_interval_label: string | null;
  period_start: string | null;
  period_end: string | null;
  users_count: number | null;
  tenant_display_name: string | null;
  can_pay: boolean;
  tenant_has_valid_cpf: boolean;
  payment_method: string | null;
  invoice_url?: string | null;
  bank_slip_url?: string | null;
  bank_slip_digitable_line?: string | null;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
  /** Sprint 9 — cartão salvo (máscara apenas) */
  saved_card?: { brand: string | null; last4: string | null; gateway: string | null } | null;
  /** Sprint 10 — Pix Automático */
  pix_automatic?: {
    available: boolean;
    status: string | null;
    has_active: boolean;
    switch_on?: boolean;
    user_opted_off?: boolean;
    qr_payload: string | null;
    qr_image: string | null;
  } | null;
}

interface StatusResponse {
  ok: boolean;
  billing_id: string;
  status: string;
  tenant_status: string | null;
}

function statusBadgeProps(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string } {
  switch (status) {
    case 'paid':
      return { label: 'Pago', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent' };
    case 'pending':
    case 'waiting_payment':
      return { label: 'Aguardando pagamento', variant: 'secondary' };
    case 'processing':
      return { label: 'Processando', variant: 'secondary' };
    case 'overdue':
      return { label: 'Vencido', variant: 'destructive' };
    case 'cancelled':
      return { label: 'Cancelado', variant: 'outline' };
    default:
      return { label: status.replace(/_/g, ' '), variant: 'outline' };
  }
}

function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-screen bg-gradient-to-b from-muted/50 via-background to-muted/30', className)}>
      {children}
    </div>
  );
}

function BrandedHero({ platformName }: { platformName: string }) {
  return (
    <header className="border-b border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left sm:gap-6">
          <div className="flex shrink-0 justify-center sm:pt-0.5">
            <Logo size="lg" variant="crm" className="shadow-md ring-1 ring-border/50" />
          </div>
          <div className="mt-4 space-y-2 sm:mt-0 sm:flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pagamento seguro</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{platformName}</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Cobrança da sua contratação na plataforma</p>
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground sm:justify-start">
              <Shield className="h-3.5 w-3.5 shrink-0 text-crm-primary" aria-hidden />
              Ambiente protegido para pagamento da sua assinatura
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function PublicSaasBillingPay() {
  const { token: tokenParam } = useParams<{ token: string }>();
  const token = tokenParam?.trim() ?? '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [result, setResult] = useState<SaasBillingPurchaseResult | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PlanPurchasePm>('PIX');
  const [cpfError, setCpfError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [paid, setPaid] = useState(false);
  const [planCardForm, setPlanCardForm] = useState<InlineCreditCardFormState>(() => createEmptyInlineCreditCardForm());
  const [payingCard, setPayingCard] = useState(false);
  const [startingPixAuto, setStartingPixAuto] = useState(false);
  const [pixAutoUserOptedOff, setPixAutoUserOptedOff] = useState(false);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSummary = useCallback(async () => {
    if (!isPublicToken(token)) {
      setError('Link inválido.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await publicApiGet<SummaryResponse>(`/api/public/saas-billing/${encodeURIComponent(token)}`);
    if (res.error || !res.data?.ok) {
      setError(res.error || 'Cobrança não encontrada.');
      setSummary(null);
      setLoading(false);
      return;
    }
    setSummary(res.data);
    const pa = res.data.pix_automatic;
    if (
      pa?.user_opted_off === true ||
      pa?.status === 'cleared' ||
      pa?.status === 'cancelled' ||
      pa?.status === 'refused' ||
      pa?.status === 'expired'
    ) {
      setPixAutoUserOptedOff(true);
    } else if (pa?.switch_on || pa?.has_active || pa?.status === 'pending') {
      setPixAutoUserOptedOff(false);
    }
    const r: SaasBillingPurchaseResult = {
      billing_id: '',
      invoice_number: res.data.invoice_number ?? undefined,
      amount_cents: res.data.amount_cents,
      status: res.data.status,
      tenant_id: '',
      payment_method: res.data.payment_method ?? undefined,
      invoice_url: res.data.invoice_url ?? undefined,
      bank_slip_url: res.data.bank_slip_url ?? undefined,
      bank_slip_digitable_line: res.data.bank_slip_digitable_line ?? undefined,
      pix_qr_code: res.data.pix_qr_code ?? undefined,
      pix_copy_paste: res.data.pix_copy_paste ?? undefined,
    };
    setResult(buildSaasBillingDisplayResult(r));
    const pm = normalizePlanPurchasePaymentMethod(res.data.payment_method);
    if (pm) {
      if (pm === 'PIX' && !res.data.tenant_has_valid_cpf) {
        setPaymentMethod('BOLETO');
      } else {
        setPaymentMethod(pm);
      }
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const stopPoll = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = null;
  };

  useEffect(() => {
    if (paid || !summary?.can_pay) return;
    const poll = async () => {
      const st = await publicApiGet<StatusResponse>(`/api/public/saas-billing/${encodeURIComponent(token)}/status`);
      if (st.data?.ok && st.data.status === 'paid') {
        setPaid(true);
        stopPoll();
        toast.success('Pagamento confirmado!');
      }
    };
    pollingRef.current = setInterval(() => void poll(), 2500);
    void poll();
    return () => stopPoll();
  }, [paid, summary?.can_pay, token]);

  const runPrepare = async (method: PlanPurchasePm) => {
    if (!isPublicToken(token) || !summary?.can_pay) return;
    setCpfError('');
    if (method === 'PIX' && !summary.tenant_has_valid_cpf) {
      setCpfError(
        'Cadastre CPF/CNPJ válido da empresa no painel (Meu plano / dados da conta) para pagar com PIX, ou use boleto/cartão.'
      );
      toast.error('CPF/CNPJ da empresa obrigatório para PIX.');
      return;
    }
    setPreparing(true);
    setPaymentMethod(method);
    try {
      const prep = await publicApiPost<SaasBillingPurchaseResult>(
        `/api/public/saas-billing/${encodeURIComponent(token)}/prepare-payment`,
        {
          payment_method: method,
        }
      );
      if (prep.error || !prep.data) {
        toast.error(prep.error || 'Não foi possível preparar o pagamento.');
        if (prep.code === 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD') {
          toast.error('Cadastre CPF/CNPJ da empresa ou informe abaixo.');
        }
        return;
      }
      const p = prep.data;
      setResult(
        buildSaasBillingDisplayResult({
          ...p,
          tenant_id: p.tenant_id || '',
        })
      );
      toast.success('Instruções atualizadas.');
    } finally {
      setPreparing(false);
    }
  };

  const handlePayWithCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result?.billing_id || payingCard || !result.inline_pay_token) {
      toast.error('Prepare o pagamento com cartão primeiro.');
      return;
    }
    setPayingCard(true);
    try {
      const idempotency_key = crypto.randomUUID();
      const body: Record<string, unknown> = {
        inline_pay_token: result.inline_pay_token,
        idempotency_key,
        credit_card: {
          holder_name: planCardForm.holder_name.trim(),
          number: planCardForm.number.replace(/\D/g, ''),
          expiry_month: planCardForm.expiry_month.replace(/\D/g, '').slice(0, 2).padStart(2, '0'),
          expiry_year: planCardForm.expiry_year.replace(/\D/g, '').slice(0, 4),
          cvv: planCardForm.cvv.trim(),
        },
        cardholder: {
          name: planCardForm.ch_name.trim(),
          email: planCardForm.ch_email.trim(),
          cpf_cnpj: planCardForm.ch_cpf_cnpj.replace(/\D/g, ''),
          postal_code: planCardForm.ch_postal_code.replace(/\D/g, ''),
          address_number: planCardForm.ch_address_number.trim(),
          phone: planCardForm.ch_phone.replace(/\D/g, ''),
          address_complement: planCardForm.ch_complement.trim() || null,
          mobile_phone: planCardForm.ch_mobile.replace(/\D/g, '') || null,
        },
      };
      const res = await publicApiPost<Record<string, unknown>>(
        `/api/public/saas-billing/${encodeURIComponent(token)}/pay-with-card`,
        body
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data?.ok && res.data?.billing_status === 'paid') {
        setPaid(true);
        toast.success('Pagamento confirmado!');
        return;
      }
      toast.success('Pagamento enviado. Aguardando confirmação…');
    } finally {
      setPayingCard(false);
    }
  };

  const handlePayWithSavedCard = async () => {
    if (!result?.billing_id || payingCard || !result.inline_pay_token) {
      toast.error('Prepare o pagamento com cartão primeiro.');
      return;
    }
    if (!summary?.saved_card?.last4) {
      toast.error('Não há cartão salvo.');
      return;
    }
    setPayingCard(true);
    try {
      const res = await publicApiPost<Record<string, unknown>>(
        `/api/public/saas-billing/${encodeURIComponent(token)}/pay-with-card`,
        {
          inline_pay_token: result.inline_pay_token,
          idempotency_key: crypto.randomUUID(),
          use_saved_card: true,
        }
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (res.data?.ok && res.data?.billing_status === 'paid') {
        setPaid(true);
        toast.success('Pagamento confirmado com cartão salvo!');
        return;
      }
      toast.success('Pagamento enviado. Aguardando confirmação…');
    } finally {
      setPayingCard(false);
    }
  };

  const handlePixAutomaticToggle = async (nextOn: boolean) => {
    if (!token || startingPixAuto) return;
    setStartingPixAuto(true);
    try {
      if (nextOn) {
        setPixAutoUserOptedOff(false);
        const res = await publicApiPost<{
          ok?: boolean;
          pix_copy_paste?: string | null;
          pix_qr_code?: string | null;
          status?: string;
        }>(`/api/public/saas-billing/${encodeURIComponent(token)}/start-pix-automatic`, {});
        if (res.error) {
          toast.error(
            res.error.includes('404')
              ? 'Não foi possível ativar o Pix Automático agora. Você pode pagar esta fatura normalmente.'
              : res.error
          );
          return;
        }
        toast.success('Pix Automático preparado — pague o PIX para autorizar.');
        await loadSummary();
        if (res.data?.pix_copy_paste || res.data?.pix_qr_code) {
          setPaymentMethod('PIX');
          setResult((prev) =>
            prev
              ? {
                  ...prev,
                  payment_method: 'PIX',
                  pix_qr_code: res.data?.pix_qr_code ?? prev.pix_qr_code,
                  pix_copy_paste: res.data?.pix_copy_paste ?? prev.pix_copy_paste,
                }
              : prev
          );
        }
      } else {
        setPixAutoUserOptedOff(true);
        const res = await publicApiPost<{
          ok?: boolean;
          pix_copy_paste?: string | null;
          pix_qr_code?: string | null;
        }>(`/api/public/saas-billing/${encodeURIComponent(token)}/cancel-pix-automatic`, {});
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success('Pix Automático desligado para as próximas cobranças.');
        await loadSummary();
        if (res.data?.pix_copy_paste || res.data?.pix_qr_code) {
          setPaymentMethod('PIX');
          setResult((prev) =>
            prev
              ? {
                  ...prev,
                  payment_method: 'PIX',
                  pix_qr_code: res.data?.pix_qr_code ?? prev.pix_qr_code,
                  pix_copy_paste: res.data?.pix_copy_paste ?? prev.pix_copy_paste,
                }
              : prev
          );
        }
      }
    } finally {
      setStartingPixAuto(false);
    }
  };

  const pixAutoPref = summary?.pix_automatic
    ? {
        available: summary.pix_automatic.available,
        switch_on:
          summary.pix_automatic.switch_on ??
          (summary.pix_automatic.has_active || summary.pix_automatic.status === 'pending'),
        status: summary.pix_automatic.status,
        has_active: summary.pix_automatic.has_active,
        user_opted_off: summary.pix_automatic.user_opted_off === true,
      }
    : null;
  const pixAutoDefaultOn = isPixAutomaticDefaultOnBillingReason(summary?.billing_reason);
  const pixSwitchOn = resolvePixAutomaticSwitchOn({
    pref: pixAutoPref,
    userOptedOff: pixAutoUserOptedOff,
    defaultOn: pixAutoDefaultOn,
  });

  const enablePixAutoOnce = useCallback(async (): Promise<boolean> => {
    if (!token || !summary?.can_pay || !summary.tenant_has_valid_cpf) return false;
    const res = await publicApiPost<{
      ok?: boolean;
      pix_copy_paste?: string | null;
      pix_qr_code?: string | null;
    }>(`/api/public/saas-billing/${encodeURIComponent(token)}/start-pix-automatic`, {});
    if (res.error) {
      console.warn('[PublicSaasBillingPay] auto-enable Pix Automático', res.error);
      return false;
    }
    await loadSummary();
    if (res.data?.pix_copy_paste || res.data?.pix_qr_code) {
      setPaymentMethod('PIX');
      setResult((prev) =>
        prev
          ? {
              ...prev,
              payment_method: 'PIX',
              pix_qr_code: res.data?.pix_qr_code ?? prev.pix_qr_code,
              pix_copy_paste: res.data?.pix_copy_paste ?? prev.pix_copy_paste,
            }
          : prev
      );
    }
    return true;
  }, [token, summary?.can_pay, summary?.tenant_has_valid_cpf, loadSummary]);

  const { enabling: pixAutoEnabling } = usePixAutomaticAutoEnable({
    enabled: Boolean(summary && pixAutoDefaultOn && summary.can_pay && !paid),
    pref: pixAutoPref,
    userOptedOff: pixAutoUserOptedOff,
    canEnable: Boolean(summary?.pix_automatic?.available && summary.tenant_has_valid_cpf),
    enableFn: enablePixAutoOnce,
  });

  const onPaymentTabChange = (v: string) => {
    const pm = v as PlanPurchasePm;
    if (pm === 'PIX' || pm === 'BOLETO' || pm === 'CREDIT_CARD') {
      void runPrepare(pm);
    }
  };

  if (!isPublicToken(token)) {
    return (
      <PageShell>
        <BrandedHero platformName="PainelCRM" />
        <div className="mx-auto max-w-lg px-4 py-12">
          <Card className="border-destructive/20 shadow-lg">
            <CardHeader>
              <CardTitle>Link inválido</CardTitle>
              <CardDescription>O endereço desta cobrança não é válido.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <BrandedHero platformName="PainelCRM" />
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 py-16">
          <Loader2 className="h-10 w-10 animate-spin text-crm-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Carregando cobrança…</p>
        </div>
      </PageShell>
    );
  }

  if (error || !summary) {
    return (
      <PageShell>
        <BrandedHero platformName="PainelCRM" />
        <div className="mx-auto max-w-lg px-4 py-12">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Cobrança indisponível</CardTitle>
              <CardDescription>{error || 'Não foi possível carregar.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Se o problema continuar, contacte o suporte da plataforma com o link que recebeu.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  if (paid || summary.status === 'paid' || result?.status === 'paid') {
    return (
      <PageShell>
        <BrandedHero platformName={summary.platform_name} />
        <div className="mx-auto max-w-lg px-4 py-16">
          <Card className="overflow-hidden border-emerald-500/20 shadow-lg">
            <CardHeader className="bg-emerald-500/5 text-center pb-2">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="h-8 w-8 text-emerald-600" aria-hidden />
              </div>
              <CardTitle className="text-xl">Pagamento confirmado</CardTitle>
              <CardDescription>Obrigado. Pode fechar esta página com segurança.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PageShell>
    );
  }

  const hasCharge = Boolean(result?.billing_id);
  const badge = statusBadgeProps(summary.status);
  const periodLine =
    summary.period_start && summary.period_end
      ? `${formatInvoiceDueDatePtBr(summary.period_start)} — ${formatInvoiceDueDatePtBr(summary.period_end)}`
      : null;

  return (
    <PageShell>
      <BrandedHero platformName={summary.platform_name} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          {/* Coluna esquerda: resumo + contexto */}
          <div className="space-y-6 lg:col-span-7">
            <Card className="shadow-md ring-1 ring-border/40">
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Receipt className="h-5 w-5 text-crm-primary shrink-0" aria-hidden />
                  Resumo da cobrança
                </CardTitle>
                <CardDescription>Revise o valor e o status antes de pagar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Valor a pagar</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                      {formatMoneyBRL(summary.amount_cents)}
                    </p>
                  </div>
                  <Badge variant={badge.variant} className={cn('w-fit shrink-0', badge.className)}>
                    {badge.label}
                  </Badge>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Vencimento</p>
                    <p className="mt-1 text-sm font-semibold">{formatInvoiceDueDatePtBr(summary.due_date)}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Fatura</p>
                    <p className="mt-1 font-mono text-sm font-semibold">{summary.invoice_number ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">Plano</p>
                    <p className="mt-1 text-sm font-semibold">{summary.plan_label || '—'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-md border border-dashed bg-background/80 p-3 text-xs text-muted-foreground">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-crm-primary" aria-hidden />
                  <span>Esta cobrança está vinculada à sua contratação na plataforma. Os dados de pagamento são tratados pelo provedor certificado (ex.: Asaas).</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-md ring-1 ring-border/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">O que você está pagando</CardTitle>
                <CardDescription>Contexto da cobrança na sua assinatura</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 text-sm">
                  {summary.tenant_display_name ? (
                    <div className="flex gap-3">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-xs text-muted-foreground">Empresa</dt>
                        <dd className="font-medium text-foreground">{summary.tenant_display_name}</dd>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex gap-3">
                    <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div>
                      <dt className="text-xs text-muted-foreground">Tipo de cobrança</dt>
                      <dd className="font-medium text-foreground">{summary.billing_reason_label}</dd>
                    </div>
                  </div>
                  {summary.billing_interval_label ? (
                    <div className="flex gap-3">
                      <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-xs text-muted-foreground">Contratação</dt>
                        <dd className="font-medium text-foreground">{summary.billing_interval_label}</dd>
                      </div>
                    </div>
                  ) : null}
                  {periodLine ? (
                    <div className="flex gap-3">
                      <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-xs text-muted-foreground">Período da cobrança</dt>
                        <dd className="font-medium text-foreground">{periodLine}</dd>
                      </div>
                    </div>
                  ) : null}
                  {summary.users_count != null && summary.users_count > 0 ? (
                    <div className="flex gap-3">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div>
                        <dt className="text-xs text-muted-foreground">Utilizadores incluídos</dt>
                        <dd className="font-medium text-foreground">{summary.users_count}</dd>
                      </div>
                    </div>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Coluna direita: pagamento */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-6 space-y-6">
              {!summary.can_pay ? (
                <Card className="shadow-md">
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    Esta cobrança não está aberta para pagamento online. Em caso de dúvida, contacte o suporte da plataforma.
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-md ring-1 ring-border/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Forma de pagamento</CardTitle>
                    <CardDescription>Escolha como deseja quitar esta fatura</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!summary.tenant_has_valid_cpf ? (
                      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                        PIX exige CPF/CNPJ da empresa cadastrado na conta. Utilize boleto ou cartão, ou complete os dados no painel.
                      </p>
                    ) : null}
                    {summary.pix_automatic?.available && summary.tenant_has_valid_cpf ? (
                      <PixAutomaticConsentSwitch
                        state={{
                          available: true,
                          switch_on: pixSwitchOn,
                          status: summary.pix_automatic.status,
                          has_active: summary.pix_automatic.has_active,
                        }}
                        disabled={startingPixAuto || pixAutoEnabling || !summary.can_pay}
                        onToggle={handlePixAutomaticToggle}
                      />
                    ) : null}
                    {cpfError ? <p className="text-sm text-destructive">{cpfError}</p> : null}

                    <Tabs value={paymentMethod} onValueChange={onPaymentTabChange} className="w-full">
                      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/80 p-1">
                        {PAY_METHODS.map((m) => (
                          <TabsTrigger
                            key={m.value}
                            value={m.value}
                            disabled={preparing || (m.value === 'PIX' && !summary.tenant_has_valid_cpf)}
                            className="gap-1.5 text-xs sm:text-sm data-[state=active]:shadow-sm"
                          >
                            <m.icon className="h-4 w-4 shrink-0 opacity-80" />
                            <span className="truncate">{m.label}</span>
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {!preparing && !hasCharge ? (
                        <div className="mt-4 space-y-2">
                          <Button
                            type="button"
                            className="w-full"
                            variant="default"
                            disabled={paymentMethod === 'PIX' && !summary.tenant_has_valid_cpf}
                            onClick={() => void runPrepare(paymentMethod)}
                          >
                            Gerar instruções de pagamento
                          </Button>
                          <p className="text-center text-xs text-muted-foreground">
                            Ou escolha outro método acima. As instruções aparecem aqui em seguida.
                          </p>
                        </div>
                      ) : null}

                      {preparing ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin text-crm-primary" />
                          A preparar…
                        </div>
                      ) : (
                        <>
                          <TabsContent value="PIX" className="mt-4 space-y-4 outline-none">
                            {hasCharge && result && hasRenderablePayloadForMethod(result, 'PIX') ? (
                              <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                                <p className="text-sm font-medium text-foreground">Pague com PIX</p>
                                {result.pix_qr_code ? (
                                  <div className="flex justify-center">
                                    <div className="rounded-xl border-2 border-dashed border-border bg-white p-4 shadow-inner">
                                      <img
                                        src={result.pix_qr_code}
                                        alt="QR Code PIX"
                                        className="mx-auto max-h-[220px] max-w-[220px] w-full object-contain"
                                      />
                                    </div>
                                  </div>
                                ) : null}
                                {result.pix_copy_paste ? (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">PIX copia e cola</p>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                      <div className="min-h-[2.75rem] flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-all text-foreground">
                                        {result.pix_copy_paste}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="default"
                                        className="shrink-0 sm:w-auto"
                                        onClick={() => copyToClipboard(result.pix_copy_paste!)}
                                      >
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copiar código
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                                <p className="text-xs text-muted-foreground">
                                  Após pagar, a confirmação pode levar alguns instantes. Esta página atualiza automaticamente.
                                </p>
                              </div>
                            ) : (
                              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                                Selecione PIX acima para gerar o QR Code e o código.
                              </p>
                            )}
                          </TabsContent>

                          <TabsContent value="BOLETO" className="mt-4 space-y-4 outline-none">
                            {hasCharge && result && hasRenderablePayloadForMethod(result, 'BOLETO') ? (
                              <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                                <p className="text-sm font-medium text-foreground">Boleto bancário</p>
                                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                  {result.bank_slip_url ? (
                                    <Button className="w-full sm:w-auto" asChild>
                                      <a href={result.bank_slip_url} target="_blank" rel="noreferrer">
                                        <Banknote className="mr-2 h-4 w-4" />
                                        Abrir boleto (PDF)
                                      </a>
                                    </Button>
                                  ) : null}
                                </div>
                                {result.bank_slip_digitable_line ? (
                                  <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">Linha digitável</p>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                      <div className="min-h-[2.75rem] flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs break-all">
                                        {result.bank_slip_digitable_line}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => copyToClipboard(result.bank_slip_digitable_line!)}
                                      >
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copiar
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}
                                {!result.bank_slip_url && !result.bank_slip_digitable_line ? (
                                  <p className="text-sm text-muted-foreground">Selecione Boleto para gerar o documento.</p>
                                ) : null}
                              </div>
                            ) : (
                              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                                Selecione Boleto para emitir o boleto desta fatura.
                              </p>
                            )}
                          </TabsContent>

                          <TabsContent value="CREDIT_CARD" className="mt-4 outline-none">
                            {hasCharge && paymentMethod === 'CREDIT_CARD' && result?.inline_pay_token ? (
                              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-4">
                                <p className="text-sm font-medium text-foreground">Cartão de crédito</p>
                                {summary.saved_card?.last4 ? (
                                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                                    <p className="text-sm text-foreground">
                                      Cartão salvo
                                      {summary.saved_card.brand ? ` · ${summary.saved_card.brand}` : ''}
                                      {` ·•••• ${summary.saved_card.last4}`}
                                    </p>
                                    <Button
                                      type="button"
                                      className="w-full sm:w-auto"
                                      disabled={payingCard}
                                      onClick={() => void handlePayWithSavedCard()}
                                    >
                                      {payingCard ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <CreditCard className="mr-2 h-4 w-4" />
                                      )}
                                      Pagar com cartão salvo
                                    </Button>
                                    <p className="text-xs text-muted-foreground">
                                      Para trocar o cartão, preencha o formulário abaixo (substitui o token salvo).
                                    </p>
                                  </div>
                                ) : null}
                                <InlineCreditCardPaymentForm
                                  form={planCardForm}
                                  setForm={setPlanCardForm}
                                  onSubmit={handlePayWithCard}
                                  paying={payingCard}
                                  hostedCheckoutUrl={result.invoice_url ?? null}
                                  fieldIdPrefix="saas-pay-"
                                />
                              </div>
                            ) : (
                              <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                                Selecione Cartão para carregar o formulário seguro.
                              </p>
                            )}
                          </TabsContent>
                        </>
                      )}
                    </Tabs>

                    {summary.gateway_fallback_url ? (
                      <Collapsible className="rounded-lg border bg-muted/20">
                        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40 [&[data-state=open]_svg]:rotate-180">
                          <span>Outra opção: página do provedor de pagamento</span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="border-t px-3 py-3">
                          <p className="mb-2 text-xs text-muted-foreground">
                            Use apenas se precisar do link direto do gateway. A experiência principal é esta página.
                          </p>
                          <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                            <a href={summary.gateway_fallback_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="mr-2 h-3 w-3" />
                              Abrir link do provedor
                            </a>
                          </Button>
                        </CollapsibleContent>
                      </Collapsible>
                    ) : null}
                  </CardContent>
                </Card>
              )}

              <Card className="border-dashed bg-muted/10 shadow-none">
                <CardContent className="flex gap-3 pt-6">
                  <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-foreground">Precisa de ajuda?</p>
                    <p className="text-muted-foreground">
                      Em caso de dúvidas sobre esta cobrança, contacte o suporte da plataforma.
                    </p>
                    {summary.platform_support_url ? (
                      <a
                        href={summary.platform_support_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Abrir central de suporte
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </PageShell>
  );
}

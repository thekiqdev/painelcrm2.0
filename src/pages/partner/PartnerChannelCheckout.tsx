/**
 * M5 S7.1 + S7.2 — Checkout/cadastro exclusivo do canal Partner.
 * Independente do gate `exclusive_signup`. Signup/trial/pagamento via /api/public/partner-channel/*.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Building2,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  Loader2,
  ChevronLeft,
  Check,
  QrCode,
  Banknote,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { CheckoutAppShell } from '@/components/checkout/CheckoutAppShell';
import { CheckoutCompactStepper, type CheckoutStepperItem } from '@/components/checkout/CheckoutCompactStepper';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { usePartnerBrand } from '@/contexts/PartnerBrandContext';
import { apiClient, publicApiGet, publicApiPost } from '@/integrations/api/client';
import {
  effectiveCheckoutTrialDays,
  formatMoneyBRL,
  formatVitrinePriceLabel,
  freeAccessDaysBadge,
  planHasCheckoutTrial,
} from '@/lib/planCheckoutDisplay';
import { formatPhoneBrDigits, formatCpfCnpjDigits } from '@/lib/brazilInputMasks';
import { isValidCpfOrCnpj } from '@/utils/cpfCnpj';
import { navigateToSignupSuccess } from '@/lib/signupSuccessNavigation';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/sonner';
import {
  InlineCreditCardPaymentForm,
  createEmptyInlineCreditCardForm,
  type InlineCreditCardFormState,
} from '@/components/payments/InlineCreditCardPaymentForm';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTERVAL_SUFFIX: Record<string, string> = {
  monthly: 'mês',
  weekly: 'semana',
  quarterly: 'trimestre',
  semi_annual: 'semestre',
  semiannual: 'semestre',
  yearly: 'ano',
};

type PaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

type ChannelPlan = {
  id: string;
  partner_sell_plan_id?: string;
  name: string;
  slug: string;
  description?: string | null;
  price_cents: number;
  billing_interval: string;
  trial_days?: number;
  is_free?: boolean;
  free_access_days?: number | null;
  benefits?: Array<{ label: string }>;
  channel?: string;
};

type ChannelBrand = {
  partner_tenant_id: string;
  public_name: string;
  product_name: string;
  logo_url: string | null;
  theme_json: Record<string, unknown>;
  tagline: string | null;
  custom_domain: string | null;
  domain_status: string;
  slug?: string | null;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'empty_plans'; brand: ChannelBrand }
  | {
      status: 'ready';
      brand: ChannelBrand;
      plans: ChannelPlan[];
      gatewayReady: boolean;
    };

type PurchaseResult = {
  billing_id: string;
  tenant_id: string;
  amount_cents: number;
  payment_method?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  bank_slip_url?: string;
  bank_slip_digitable_line?: string;
  invoice_url?: string;
  inline_pay_token?: string;
  partner_sell_plan_id?: string;
};

type BillingStatusResponse = {
  billing_id: string;
  status: 'pending' | 'paid' | 'overdue';
  tenant_status: string | null;
};

/** Fallback ao webhook Asaas — consulta status a cada 10s. */
const PARTNER_CHECKOUT_POLL_INTERVAL_MS = 10_000;
const PARTNER_CHECKOUT_POLL_TIMEOUT_MS = 10 * 60 * 1000;

function applyPartnerTheme(theme: Record<string, unknown> | null | undefined) {
  const root = document.documentElement;
  if (!theme) {
    root.style.removeProperty('--partner-primary');
    root.style.removeProperty('--partner-accent');
    return;
  }
  if (typeof theme.primary === 'string' && theme.primary.trim()) {
    root.style.setProperty('--partner-primary', theme.primary.trim());
  }
  if (typeof theme.accent === 'string' && theme.accent.trim()) {
    root.style.setProperty('--partner-accent', theme.accent.trim());
  }
}

function PartnerCheckoutHeader({
  title,
  displayName,
  logoUrl,
  isLoggedIn,
}: {
  title: string;
  displayName: string;
  logoUrl: string | null;
  isLoggedIn: boolean;
}) {
  return (
    <div className="mx-auto flex h-12 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:h-14 sm:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link to="/login" className="flex shrink-0 items-center gap-2" aria-label={`${displayName} — login`}>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
          ) : (
            <Logo size="sm" />
          )}
          <span className="font-display hidden text-base font-bold text-foreground sm:inline">{displayName}</span>
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
        <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h1>
      </div>
      {isLoggedIn ? (
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
          <Link to="/dashboard">Painel</Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
          <Link to="/login">Já tenho conta</Link>
        </Button>
      )}
    </div>
  );
}

const STEPPER: CheckoutStepperItem[] = [
  { id: 1, title: 'Plano', icon: LayoutGrid },
  { id: 2, title: 'Empresa', icon: Building2 },
  { id: 3, title: 'Admin', icon: ClipboardList },
  { id: 4, title: 'Resumo', icon: ClipboardList },
  { id: 5, title: 'Pagamento', icon: CreditCard },
];

const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
  icon: typeof QrCode;
  description: string;
}> = [
  { value: 'PIX', label: 'PIX', icon: QrCode, description: 'Pagamento instantâneo' },
  { value: 'CREDIT_CARD', label: 'Cartão', icon: CreditCard, description: 'Cartão de crédito' },
  { value: 'BOLETO', label: 'Boleto', icon: Banknote, description: 'Boleto bancário' },
];

function toastPartnerCheckoutCode(code: string | undefined, fallback: string) {
  switch (code) {
    case 'EMAIL_ALREADY_REGISTERED_USE_LOGIN':
      toast.error('Este e-mail já possui cadastro. Faça login ou use outro e-mail.');
      return;
    case 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN':
      toast.error('Este WhatsApp já possui cadastro. Faça login ou use outro número.');
      return;
    case 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD':
      toast.error('CPF ou CNPJ válido é obrigatório para gerar a cobrança.');
      return;
    default:
      toast.error(fallback);
  }
}

function hasPaymentPayloadForMethod(result: PurchaseResult | null, method: PaymentMethod): boolean {
  if (!result?.billing_id) return false;
  if (method === 'PIX') return Boolean(result.pix_copy_paste || result.pix_qr_code);
  if (method === 'BOLETO') return Boolean(result.bank_slip_url || result.invoice_url || result.bank_slip_digitable_line);
  if (method === 'CREDIT_CARD') return Boolean(result.inline_pay_token);
  return false;
}

export default function PartnerChannelCheckout() {
  const { user, setTokenAndUser, refreshUser, signIn } = useAuth();
  const hostBrand = usePartnerBrand();
  const navigate = useNavigate();
  const routeParams = useParams<{ partnerSlug?: string; sellerId?: string }>();

  const pathFirst = routeParams.partnerSlug?.trim() || '';
  const pathSecond = routeParams.sellerId?.trim() || '';

  const resolvedChannel = useMemo(() => {
    const onWlHost = hostBrand.isPartnerHost && Boolean(hostBrand.brand);
    if (onWlHost && pathFirst && UUID_RE.test(pathFirst) && !pathSecond) {
      return {
        slug: hostBrand.brand?.slug || null,
        sellerUserId: pathFirst,
        resolveBy: 'host' as const,
      };
    }
    if (pathFirst && pathSecond) {
      return { slug: pathFirst, sellerUserId: pathSecond, resolveBy: 'slug' as const };
    }
    if (pathFirst && !UUID_RE.test(pathFirst)) {
      return { slug: pathFirst, sellerUserId: null as string | null, resolveBy: 'slug' as const };
    }
    if (onWlHost) {
      return {
        slug: hostBrand.brand?.slug || null,
        sellerUserId: null as string | null,
        resolveBy: 'host' as const,
      };
    }
    if (pathFirst) {
      return { slug: pathFirst, sellerUserId: null as string | null, resolveBy: 'slug' as const };
    }
    return { slug: null as string | null, sellerUserId: null as string | null, resolveBy: 'host' as const };
  }, [hostBrand.isPartnerHost, hostBrand.brand, pathFirst, pathSecond]);

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<ChannelPlan | null>(null);
  const [company, setCompany] = useState({
    company_name: '',
    contact_email: '',
    phone: '',
  });
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [adminEmailError, setAdminEmailError] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [identityCheckLoading, setIdentityCheckLoading] = useState(false);
  const [billingCpf, setBillingCpf] = useState('');
  const [cpfCnpjError, setCpfCnpjError] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [cardForm, setCardForm] = useState<InlineCreditCardFormState>(createEmptyInlineCreditCardForm);
  const [payingCard, setPayingCard] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentFinalizeStartedRef = useRef(false);
  const lastPolledBillingIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (resolvedChannel.slug) sessionStorage.setItem('partner_channel_slug', resolvedChannel.slug);
      if (resolvedChannel.sellerUserId) {
        sessionStorage.setItem('partner_seller_user_id', resolvedChannel.sellerUserId);
      } else {
        sessionStorage.removeItem('partner_seller_user_id');
      }
    } catch {
      /* ignore */
    }
  }, [resolvedChannel.slug, resolvedChannel.sellerUserId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoad({ status: 'loading' });
      const qs =
        resolvedChannel.resolveBy === 'slug' && resolvedChannel.slug
          ? `slug=${encodeURIComponent(resolvedChannel.slug)}`
          : `domain=${encodeURIComponent(window.location.hostname)}`;
      const res = await publicApiGet<{
        brand: ChannelBrand | null;
        platform?: boolean;
        plans?: ChannelPlan[] | null;
        suspended?: boolean;
        gateway_ready?: boolean;
      }>(`/api/public/partner-brand?${qs}`);
      if (cancelled) return;
      if (res.error || !res.data?.brand || res.data.platform || res.data.suspended) {
        setLoad({ status: 'invalid' });
        applyPartnerTheme(null);
        return;
      }
      const brand = res.data.brand;
      applyPartnerTheme(brand.theme_json);
      const name = brand.product_name || brand.public_name;
      if (name) document.title = `${name} — Cadastro`;
      const plans = Array.isArray(res.data.plans) ? res.data.plans : [];
      if (plans.length === 0) {
        setLoad({ status: 'empty_plans', brand });
        return;
      }
      setLoad({
        status: 'ready',
        brand,
        plans,
        gatewayReady: res.data.gateway_ready !== false,
      });
      setPlan((prev) => prev ?? plans[0] ?? null);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [resolvedChannel.slug, resolvedChannel.resolveBy]);

  useEffect(() => {
    const billingId = result?.billing_id;
    if (!billingId || paymentConfirmed) return;

    if (lastPolledBillingIdRef.current !== billingId) {
      lastPolledBillingIdRef.current = billingId;
      paymentFinalizeStartedRef.current = false;
    }

    const onPaymentConfirmed = async () => {
      if (paymentFinalizeStartedRef.current) return;
      paymentFinalizeStartedRef.current = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollingRef.current = null;
      pollTimeoutRef.current = null;

      const email = adminEmail.trim();
      const pwd = password;
      if (email && pwd) {
        const path = await signIn(email, pwd);
        if (path !== '/login') {
          toast.success('Pagamento confirmado! Bem-vindo.');
          navigateToSignupSuccess(navigate, '/dashboard');
          return;
        }
        toast.error('Pagamento confirmado, mas o login automático falhou. Acesse com seu e-mail e senha.');
        navigate('/login', { replace: true });
        return;
      }

      setPaymentConfirmed(true);
      toast.success('Pagamento confirmado!');
    };

    const checkStatus = async () => {
      const res = await apiClient.get<BillingStatusResponse>(`/api/billing/${billingId}/status`);
      if (res.error || !res.data) return;
      if (res.data.status === 'paid') {
        await onPaymentConfirmed();
      }
    };

    pollingRef.current = setInterval(checkStatus, PARTNER_CHECKOUT_POLL_INTERVAL_MS);
    void checkStatus();

    pollTimeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      pollTimeoutRef.current = null;
    }, PARTNER_CHECKOUT_POLL_TIMEOUT_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollingRef.current = null;
      pollTimeoutRef.current = null;
    };
  }, [result?.billing_id, paymentConfirmed, adminEmail, password, signIn, navigate]);

  useEffect(() => {
    if (!paymentConfirmed) return;
    const t = setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 1500);
    return () => clearTimeout(t);
  }, [paymentConfirmed, navigate]);

  const displayName =
    load.status === 'ready' || load.status === 'empty_plans'
      ? load.brand.product_name || load.brand.public_name
      : hostBrand.displayName;
  const logoUrl =
    load.status === 'ready' || load.status === 'empty_plans'
      ? load.brand.logo_url
      : hostBrand.logoUrl;

  const partnerSlug =
    resolvedChannel.slug ||
    (load.status === 'ready' || load.status === 'empty_plans' ? load.brand.slug : null) ||
    '';

  const periodSuffix = plan ? INTERVAL_SUFFIX[plan.billing_interval] || 'mês' : 'mês';

  const buildSignupBody = useCallback(
    (extra?: Record<string, unknown>) => ({
      partner_slug: partnerSlug,
      partner_sell_plan_id: plan?.partner_sell_plan_id || plan?.id,
      ...(resolvedChannel.sellerUserId ? { seller_user_id: resolvedChannel.sellerUserId } : {}),
      company_name: company.company_name.trim(),
      billing_email: company.contact_email.trim(),
      email: adminEmail.trim(),
      responsible_name: adminName.trim(),
      password,
      whatsapp: whatsapp.replace(/\D/g, ''),
      ...(company.phone?.trim() ? { phone: company.phone.replace(/\D/g, '') } : {}),
      ...(billingCpf.replace(/\D/g, '')
        ? { cpf_cnpj: billingCpf.replace(/\D/g, '') }
        : {}),
      ...(result?.tenant_id ? { tenant_id: result.tenant_id } : {}),
      website: honeypot,
      ...extra,
    }),
    [
      partnerSlug,
      plan,
      resolvedChannel.sellerUserId,
      company,
      adminEmail,
      adminName,
      password,
      whatsapp,
      result?.tenant_id,
      honeypot,
      billingCpf,
    ]
  );

  const goNextFromPlan = () => {
    if (!plan) {
      toast.error('Selecione um plano para continuar.');
      return;
    }
    setStep(2);
  };

  const submitCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.company_name.trim()) {
      toast.error('Informe o nome da empresa.');
      return;
    }
    const contactEmail = company.contact_email.trim();
    if (!contactEmail || !contactEmail.includes('@')) {
      toast.error('Informe o e-mail de contato da empresa.');
      return;
    }
    setStep(3);
  };

  const submitAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminEmailError('');
    setWhatsappError('');
    if (!adminName.trim()) {
      toast.error('Informe o nome do administrador.');
      return;
    }
    const email = adminEmail.trim();
    if (!email || !email.includes('@')) {
      toast.error('Informe o e-mail de acesso do administrador.');
      return;
    }
    if (password.length < 8) {
      toast.error('Senha mínima de 8 caracteres.');
      return;
    }
    if (password !== passwordConfirm) {
      toast.error('As senhas não coincidem.');
      return;
    }
    const waDigits = whatsapp.replace(/\D/g, '');
    if (waDigits.length < 8) {
      toast.error('Informe um WhatsApp válido.');
      return;
    }

    setIdentityCheckLoading(true);
    try {
      const res = await publicApiPost<{ ok?: boolean }>(
        '/api/public/partner-channel/validate-admin',
        { email, whatsapp: waDigits, website: honeypot }
      );
      if (res.error) {
        if (res.field === 'whatsapp' || res.code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN') {
          setWhatsappError(res.error);
        } else if (res.field === 'email' || res.code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN') {
          setAdminEmailError(res.error);
        }
        toastPartnerCheckoutCode(res.code, res.error);
        return;
      }
      setStep(4);
    } finally {
      setIdentityCheckLoading(false);
    }
  };

  const handleTrialActivate = async () => {
    if (!plan || !partnerSlug) {
      toast.error('Canal ou plano inválido.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await publicApiPost<{
        token: string;
        tenant_id: string;
        user: { id: string; email: string; tenant_id: string; registration_complete: boolean };
      }>('/api/public/partner-channel/signup-trial', buildSignupBody());
      if (res.error || !res.data?.token) {
        toast.error(res.error || 'Não foi possível ativar o trial.');
        return;
      }
      await setTokenAndUser(res.data.token, {
        ...res.data.user,
        registration_complete: true,
      });
      await refreshUser();
      toast.success('Trial ativado! Bem-vindo.');
      navigateToSignupSuccess(navigate, '/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateCharge = async () => {
    if (!plan || !partnerSlug) {
      toast.error('Canal ou plano inválido.');
      return;
    }
    setCpfCnpjError('');
    const docDigits = billingCpf.replace(/\D/g, '');
    if (!isValidCpfOrCnpj(docDigits)) {
      const msg = 'Informe um CPF ou CNPJ válido para gerar a cobrança no Asaas.';
      setCpfCnpjError(msg);
      toast.error(msg);
      return;
    }
    setSubmitting(true);
    setPaymentMethod('PIX');
    try {
      const res = await publicApiPost<PurchaseResult>(
        '/api/public/partner-channel/signup',
        buildSignupBody({ cpf_cnpj: docDigits, payment_method: 'PIX' })
      );
      if (res.error || !res.data?.billing_id) {
        if (res.field === 'cpf_cnpj' || res.code === 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD') {
          setCpfCnpjError(res.error || 'CPF/CNPJ inválido ou ausente.');
        }
        toastPartnerCheckoutCode(res.code, res.error || 'Não foi possível gerar a cobrança.');
        return;
      }
      setResult(res.data);
      setCardForm((f) => ({
        ...f,
        ch_name: f.ch_name || adminName,
        ch_email: f.ch_email || adminEmail,
        ch_cpf_cnpj: f.ch_cpf_cnpj || docDigits,
        ch_phone: f.ch_phone || whatsapp.replace(/\D/g, ''),
        ch_mobile: f.ch_mobile || whatsapp.replace(/\D/g, ''),
      }));
      toast.success('PIX gerado. Escaneie o QR Code ou copie o código.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePreparePayment = async (method: PaymentMethod) => {
    if (!plan || !partnerSlug || !result?.billing_id) {
      toast.error('Gere a cobrança antes de escolher o pagamento.');
      return;
    }
    if (hasPaymentPayloadForMethod(result, method) && paymentMethod === method) {
      return;
    }
    setCpfCnpjError('');
    const docDigits = billingCpf.replace(/\D/g, '');
    if (!isValidCpfOrCnpj(docDigits)) {
      const msg = 'Informe um CPF ou CNPJ válido para gerar a cobrança no Asaas.';
      setCpfCnpjError(msg);
      toast.error(msg);
      return;
    }
    setSubmitting(true);
    setPaymentMethod(method);
    try {
      const res = await publicApiPost<PurchaseResult>(
        '/api/public/partner-channel/signup',
        buildSignupBody({ payment_method: method, cpf_cnpj: docDigits })
      );
      if (res.error || !res.data?.billing_id) {
        if (res.field === 'cpf_cnpj' || res.code === 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD') {
          setCpfCnpjError(res.error || 'CPF/CNPJ inválido ou ausente.');
        }
        toastPartnerCheckoutCode(res.code, res.error || 'Não foi possível preparar o pagamento.');
        return;
      }
      setResult(res.data);
      setCardForm((f) => ({
        ...f,
        ch_name: f.ch_name || adminName,
        ch_email: f.ch_email || adminEmail,
        ch_cpf_cnpj: f.ch_cpf_cnpj || docDigits,
        ch_phone: f.ch_phone || whatsapp.replace(/\D/g, ''),
        ch_mobile: f.ch_mobile || whatsapp.replace(/\D/g, ''),
      }));
      toast.success('Pagamento preparado. Siga as instruções abaixo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayWithCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result?.billing_id || payingCard) return;
    if (!result.inline_pay_token) {
      toast.error('Atualize a página e gere a cobrança novamente para pagar com cartão.');
      return;
    }
    setPayingCard(true);
    try {
      const body: Record<string, unknown> = {
        idempotency_key: crypto.randomUUID(),
        inline_pay_token: result.inline_pay_token,
        credit_card: {
          holder_name: cardForm.holder_name.trim(),
          number: cardForm.number.replace(/\D/g, ''),
          expiry_month: cardForm.expiry_month.trim(),
          expiry_year: cardForm.expiry_year.trim(),
          cvv: cardForm.cvv.trim(),
        },
        credit_card_holder_info: {
          name: cardForm.ch_name.trim() || adminName.trim(),
          email: cardForm.ch_email.trim() || adminEmail.trim(),
          cpf_cnpj: cardForm.ch_cpf_cnpj.replace(/\D/g, ''),
          postal_code: cardForm.ch_postal_code.replace(/\D/g, ''),
          address_number: cardForm.ch_address_number.trim(),
          phone: cardForm.ch_phone.replace(/\D/g, '') || whatsapp.replace(/\D/g, ''),
          mobile_phone: cardForm.ch_mobile.replace(/\D/g, '') || whatsapp.replace(/\D/g, ''),
          ...(cardForm.ch_complement.trim() ? { address_complement: cardForm.ch_complement.trim() } : {}),
        },
      };
      const res = await apiClient.post<{ ok?: boolean; status?: string }>(
        `/api/billing/${result.billing_id}/pay-with-card`,
        body
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Pagamento enviado. Aguardando confirmação…');
    } finally {
      setPayingCard(false);
    }
  };

  if (load.status === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (load.status === 'invalid') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">Canal não encontrado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Este link de cadastro é inválido ou o Partner não está disponível.
        </p>
        <Button asChild variant="outline">
          <Link to="/login">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  if (load.status === 'empty_plans') {
    return (
      <CheckoutAppShell
        header={
          <PartnerCheckoutHeader
            title="Cadastro"
            displayName={displayName}
            logoUrl={logoUrl}
            isLoggedIn={Boolean(user)}
          />
        }
        hideFooter
      >
        <div className="mx-auto max-w-lg space-y-3 py-10 text-center">
          <h2 className="text-lg font-semibold text-foreground">Nenhum plano publicado</h2>
          <p className="text-sm text-muted-foreground">
            {displayName} ainda não publicou planos de venda. Tente novamente mais tarde.
          </p>
        </div>
      </CheckoutAppShell>
    );
  }

  const { plans, gatewayReady } = load;
  const trialDays = plan ? effectiveCheckoutTrialDays(plan) : 0;
  const trialBadge = plan
    ? freeAccessDaysBadge(plan.is_free, plan.free_access_days) ||
      (trialDays > 0 ? `${trialDays} ${trialDays === 1 ? 'dia grátis' : 'dias grátis'}` : null)
    : null;
  const showTrialCta = Boolean(plan && planHasCheckoutTrial(plan));
  const hasChargeReady = Boolean(result?.billing_id);

  const renderPlanPicker = () => (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground sm:text-lg">Escolha seu plano</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Planos de {displayName}
          {resolvedChannel.sellerUserId ? ' · link de vendedor' : ''}.
        </p>
      </div>
      <div
        className={cn(
          'flex w-full flex-col gap-2',
          plans.length > 1 && 'lg:flex-row lg:items-stretch lg:gap-2'
        )}
      >
        {plans.map((p) => {
          const selected = plan?.id === p.id;
          const cents = Math.max(0, p.price_cents);
          const period = INTERVAL_SUFFIX[p.billing_interval] || 'mês';
          const badge =
            freeAccessDaysBadge(p.is_free, p.free_access_days) ||
            (effectiveCheckoutTrialDays(p) > 0
              ? `${effectiveCheckoutTrialDays(p)} dias grátis`
              : null);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlan(p)}
              className={cn(
                'min-w-0 rounded-lg border-2 p-3 text-left transition-all sm:p-4',
                selected
                  ? 'border-primary bg-primary/[0.07] shadow-sm ring-1 ring-primary/20'
                  : 'cursor-pointer border-border bg-card hover:border-primary/45',
                plans.length === 1 && 'mx-auto w-full max-w-xl',
                plans.length > 1 && 'w-full lg:flex-1'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground">{p.name}</h3>
                  {badge ? (
                    <span className="mt-1 inline-block rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {badge}
                    </span>
                  ) : null}
                </div>
                {selected ? <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden /> : null}
              </div>
              <p className="mt-2 text-lg font-bold tabular-nums text-primary">
                {formatVitrinePriceLabel(cents)}
                <span className="text-sm font-normal text-muted-foreground">/{period}</span>
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCompany = () => (
    <form
      id="partner-checkout-company"
      className="relative mx-auto max-w-lg space-y-4"
      onSubmit={submitCompany}
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">Dados da empresa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Contato principal da organização — diferente do usuário administrador.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pc_company_name">Nome da empresa *</Label>
        <Input
          id="pc_company_name"
          value={company.company_name}
          onChange={(e) => setCompany((c) => ({ ...c, company_name: e.target.value }))}
          autoComplete="organization"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pc_contact_email">E-mail de contato *</Label>
        <Input
          id="pc_contact_email"
          type="email"
          value={company.contact_email}
          onChange={(e) => setCompany((c) => ({ ...c, contact_email: e.target.value }))}
          placeholder="contato@empresa.com"
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pc_phone">Telefone de contato (opcional)</Label>
        <Input
          id="pc_phone"
          value={company.phone}
          onChange={(e) => setCompany((c) => ({ ...c, phone: formatPhoneBrDigits(e.target.value) }))}
          placeholder="(11) 99999-9999"
          inputMode="tel"
        />
      </div>
      {/* Honeypot anti-bot — oculto; não preencher */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden>
        <Label htmlFor="pc_website">Website</Label>
        <Input
          id="pc_website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
    </form>
  );

  const renderAdmin = () => (
    <form id="partner-checkout-admin" className="mx-auto max-w-lg space-y-5" onSubmit={(e) => void submitAdmin(e)}>
      <div>
        <h2 className="text-base font-semibold text-foreground">Administrador</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Usuário que fará login e gerenciará a conta no painel.
        </p>
      </div>
      <section className="space-y-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Perfil</p>
          <p className="text-xs text-muted-foreground">Dados de acesso do administrador.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pc_responsible">Nome completo *</Label>
          <Input
            id="pc_responsible"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pc_admin_email">E-mail de acesso *</Label>
          <Input
            id="pc_admin_email"
            type="email"
            value={adminEmail}
            onChange={(e) => {
              setAdminEmailError('');
              setAdminEmail(e.target.value);
            }}
            placeholder="admin@empresa.com"
            autoComplete="username"
            aria-invalid={!!adminEmailError}
            className={adminEmailError ? 'border-destructive' : undefined}
            required
          />
          {adminEmailError ? (
            <p className="text-sm text-destructive" role="alert">
              {adminEmailError}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="pc_whatsapp">WhatsApp *</Label>
          <Input
            id="pc_whatsapp"
            value={whatsapp}
            onChange={(e) => {
              setWhatsappError('');
              setWhatsapp(formatPhoneBrDigits(e.target.value));
            }}
            placeholder="(11) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!whatsappError}
            className={whatsappError ? 'border-destructive' : undefined}
            required
          />
          {whatsappError ? (
            <p className="text-sm text-destructive" role="alert">
              {whatsappError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Usado para login e comunicações da conta.</p>
          )}
        </div>
      </section>
      <section className="space-y-3 border-t border-border/60 pt-4">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Segurança</p>
          <p className="text-xs text-muted-foreground">Senha de acesso ao painel.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pc_password">Senha *</Label>
          <Input
            id="pc_password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pc_password2">Confirmar senha *</Label>
          <Input
            id="pc_password2"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
      </section>
    </form>
  );

  const renderSummary = () => (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Resumo</h2>
        <p className="mt-1 text-sm text-muted-foreground">Confira antes de continuar.</p>
      </div>
      <dl className="space-y-2 rounded-lg border bg-card/50 p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Plano</dt>
          <dd className="font-medium text-foreground">{plan?.name ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {plan ? formatVitrinePriceLabel(plan.price_cents) : '—'}
            {plan ? <span className="font-normal text-muted-foreground">/{periodSuffix}</span> : null}
          </dd>
        </div>
        {trialBadge ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Trial</dt>
            <dd className="font-medium text-primary">{trialBadge}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Empresa</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">{company.company_name}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Contato</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">{company.contact_email}</dd>
        </div>
        {company.phone ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Telefone</dt>
            <dd className="max-w-[60%] truncate text-right font-medium tabular-nums">{company.phone}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Administrador</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">{adminName}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">E-mail de acesso</dt>
          <dd className="max-w-[60%] truncate text-right font-medium">{adminEmail}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">WhatsApp</dt>
          <dd className="max-w-[60%] truncate text-right font-medium tabular-nums">{whatsapp}</dd>
        </div>
      </dl>
    </div>
  );

  const renderPayment = () => (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">
          {showTrialCta && !hasChargeReady ? 'Ativar ou pagar' : 'Pagamento'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Plano <strong className="text-foreground">{plan?.name}</strong>
          {plan ? ` · ${formatMoneyBRL(plan.price_cents)}/${periodSuffix}` : ''}
        </p>
      </div>

      {!gatewayReady && plan && plan.price_cents > 0 ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          O gateway de pagamento deste canal ainda não está pronto. Trial/planos grátis funcionam; cobrança
          PIX/boleto/cartão fica indisponível até o Partner configurar o Asaas.
        </p>
      ) : null}

      {showTrialCta && !hasChargeReady ? (
        <Button
          type="button"
          className="w-full"
          disabled={submitting || identityCheckLoading}
          onClick={() => void handleTrialActivate()}
        >
          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Ativar trial grátis ({trialDays} {trialDays === 1 ? 'dia' : 'dias'})
        </Button>
      ) : null}

      {showTrialCta && !hasChargeReady && plan && plan.price_cents > 0 && gatewayReady ? (
        <p className="text-center text-xs text-muted-foreground">ou pague agora</p>
      ) : null}

      {plan && plan.price_cents > 0 && gatewayReady ? (
        <>
          {!hasChargeReady ? (
            <div className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-3 sm:p-4">
              <Label htmlFor="pc_billing_cpf">CPF ou CNPJ *</Label>
              <Input
                id="pc_billing_cpf"
                value={billingCpf}
                onChange={(e) => {
                  setCpfCnpjError('');
                  setBillingCpf(formatCpfCnpjDigits(e.target.value));
                }}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={!!cpfCnpjError}
                className={cpfCnpjError ? 'border-destructive' : undefined}
              />
              {cpfCnpjError ? (
                <p className="text-sm text-destructive" role="alert">
                  {cpfCnpjError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  O PIX será gerado automaticamente. Depois você pode trocar para boleto ou cartão.
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={submitting}
                onClick={() => void handleGenerateCharge()}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Gerar cobrança
              </Button>
            </div>
          ) : !paymentConfirmed ? (
            <>
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoneyBRL(result?.amount_cents ?? plan.price_cents)}
                  </span>
                </div>
              </div>

              {result && hasPaymentPayloadForMethod(result, 'PIX') && paymentMethod === 'PIX' ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    <span className="font-medium">Aguardando confirmação do PIX…</span>
                  </div>
                  <p className="text-sm font-medium">Valor: {formatMoneyBRL(result.amount_cents)}</p>
                  {result.pix_qr_code ? (
                    <img
                      src={
                        result.pix_qr_code.startsWith('data:')
                          ? result.pix_qr_code
                          : `data:image/png;base64,${result.pix_qr_code}`
                      }
                      alt="QR Code PIX"
                      className="mx-auto h-48 w-48 rounded-md border bg-white p-2"
                    />
                  ) : null}
                  {result.pix_copy_paste ? (
                    <div className="flex gap-2">
                      <Input readOnly value={result.pix_copy_paste} className="font-mono text-xs" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          void navigator.clipboard.writeText(result.pix_copy_paste!);
                          toast.success('PIX copiado');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aguarde o QR Code ou troque o método de pagamento abaixo.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Confirmamos o pagamento automaticamente (atualização a cada 10s).
                  </p>
                </div>
              ) : null}

              <div>
                <Label className="text-sm font-medium">Outras formas de pagamento</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {PAYMENT_METHODS.map((m) => {
                    const Icon = m.icon;
                    const active = paymentMethod === m.value;
                    const busy = submitting && active;
                    return (
                      <button
                        key={m.value}
                        type="button"
                        disabled={submitting}
                        onClick={() => void handlePreparePayment(m.value)}
                        className={cn(
                          'rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60',
                          active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                        )}
                      >
                        {busy ? (
                          <Loader2 className="mb-1 h-4 w-4 animate-spin text-primary" />
                        ) : (
                          <Icon className="mb-1 h-4 w-4 text-primary" aria-hidden />
                        )}
                        <div className="text-sm font-medium">{m.label}</div>
                        <div className="text-[11px] text-muted-foreground">{m.description}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Troque o método se preferir boleto ou cartão.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="rounded-full bg-green-500/20 p-3">
                <Check className="h-10 w-10 text-green-600" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">Pagamento confirmado!</p>
                <p className="mt-0.5 text-sm text-muted-foreground">Abrindo o painel…</p>
              </div>
            </div>
          )}

          {submitting && hasChargeReady && !hasPaymentPayloadForMethod(result, paymentMethod) ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : null}

          {result &&
          !paymentConfirmed &&
          hasPaymentPayloadForMethod(result, 'BOLETO') &&
          paymentMethod === 'BOLETO' ? (
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">
                Valor: {formatMoneyBRL(result.amount_cents)}
              </p>
              {result.bank_slip_digitable_line ? (
                <p className="break-all font-mono text-xs">{result.bank_slip_digitable_line}</p>
              ) : null}
              {result.bank_slip_url || result.invoice_url ? (
                <Button asChild variant="outline">
                  <a
                    href={result.bank_slip_url || result.invoice_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir boleto
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Boleto ainda não disponível.</p>
              )}
            </div>
          ) : null}

          {result &&
          !paymentConfirmed &&
          hasPaymentPayloadForMethod(result, 'CREDIT_CARD') &&
          paymentMethod === 'CREDIT_CARD' ? (
            <InlineCreditCardPaymentForm
              form={cardForm}
              setForm={setCardForm}
              onSubmit={handlePayWithCard}
              paying={payingCard}
              showHostedCheckoutFallback={false}
              emphasizeSubmit
              fieldIdPrefix="pc_"
            />
          ) : null}
        </>
      ) : null}
    </div>
  );

  const footer =
    step === 1 ? (
      <div className="flex w-full justify-end">
        <Button type="button" onClick={goNextFromPlan} disabled={!plan}>
          Continuar
        </Button>
      </div>
    ) : step === 2 ? (
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        <Button type="submit" form="partner-checkout-company">
          Continuar
        </Button>
      </div>
    ) : step === 3 ? (
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(2)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        <Button type="submit" form="partner-checkout-admin" disabled={identityCheckLoading}>
          {identityCheckLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Continuar
        </Button>
      </div>
    ) : step === 4 ? (
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep(3)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
        <Button type="button" onClick={() => setStep(5)}>
          {showTrialCta ? 'Ir para ativação' : 'Ir para pagamento'}
        </Button>
      </div>
    ) : (
      <div className="flex w-full justify-start">
        <Button type="button" variant="outline" onClick={() => setStep(4)} disabled={submitting || payingCard || paymentConfirmed}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );

  return (
    <CheckoutAppShell
      header={
        <PartnerCheckoutHeader
          title="Cadastro"
          displayName={displayName}
          logoUrl={logoUrl}
          isLoggedIn={Boolean(user)}
        />
      }
      stepper={<CheckoutCompactStepper steps={STEPPER} activeIndex={step - 1} />}
      footerActions={footer}
    >
      {step === 1 && renderPlanPicker()}
      {step === 2 && renderCompany()}
      {step === 3 && renderAdmin()}
      {step === 4 && renderSummary()}
      {step === 5 && renderPayment()}
    </CheckoutAppShell>
  );
}

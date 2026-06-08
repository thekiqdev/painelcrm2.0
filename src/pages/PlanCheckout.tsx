import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { withMarketingAttribution } from '@/lib/marketingAttribution';
import { navigateToSignupSuccess } from '@/lib/signupSuccessNavigation';
import {
  Loader2,
  Copy,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Building2,
  CreditCard,
  Minus,
  Plus,
  Check,
  QrCode,
  Banknote,
  LayoutGrid,
  ClipboardList,
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
} from 'lucide-react';
import LandingLayout from '@/landingpage/components/LandingLayout';
import { LANDING_CHECKOUT_PREFILL_KEY } from '@/lib/landingCheckoutPrefill';
import {
  formatMoneyBRL,
  formatVitrinePriceLabel,
  freeAccessDaysBadge,
  getCheckoutListPriceCents,
  effectiveCheckoutTrialDays,
  planHasCheckoutTrial,
} from '@/lib/planCheckoutDisplay';
import { formatCpfCnpjDigits, formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import { isValidCpfOrCnpj } from '@/utils/cpfCnpj';
import { cn } from '@/lib/utils';
import {
  InlineCreditCardPaymentForm,
  createEmptyInlineCreditCardForm,
  type InlineCreditCardFormState,
} from '@/components/payments/InlineCreditCardPaymentForm';

const checkoutResumeEnabled = import.meta.env.VITE_CHECKOUT_RESUME_V1 === 'true';
/** Só desliga o CTA de trial no checkout se explicitamente false (padrão: trial por plano ativo). */
const trialCheckoutUiDisabled = import.meta.env.VITE_CHECKOUT_TRIAL_V1 === 'false';

const BILLING_INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

/** Sufixo após o preço (ex.: R$ 10/mês, /trimestre) — alinhado às chaves de `billing_interval`. */
const BILLING_INTERVAL_PERIOD_SUFFIX: Record<string, string> = {
  monthly: 'mês',
  quarterly: 'trimestre',
  semi_annual: 'semestre',
  yearly: 'ano',
};

const PAYMENT_METHODS = [
  { value: 'PIX' as const, label: 'PIX', icon: QrCode, description: 'Pagamento instantâneo via PIX' },
  { value: 'CREDIT_CARD' as const, label: 'Cartão de crédito', icon: CreditCard, description: 'Pague com cartão de crédito' },
  { value: 'BOLETO' as const, label: 'Boleto', icon: Banknote, description: 'Pague via boleto bancário' },
];

const CHECKOUT_STORAGE_KEY = 'painelcrm_checkout_context_v1';

const MIN_WHATSAPP_DIGITS = 8;

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
  /** Período promocional cadastrado no plano (tag visual; Fase 1 não altera cobrança). */
  is_free?: boolean;
  free_access_days?: number | null;
  /** Fase 2: dias de trial no checkout (0 = sem trial). */
  trial_days?: number;
}

/** Snapshot do pré-cálculo de assentos (Meu plano → checkout seat_addon). */
export interface SeatAddonCheckoutQuote {
  current_contracted: number;
  new_total: number;
  additional_seats: number;
  price_per_user_full_period_cents: number;
  remaining_period_days: number;
  amount_cents_now: number;
  new_recurring_period_cents: number;
  period_start: string;
  period_end: string;
  billing_interval: string;
}

/** Resposta de POST /api/me/tenant/seat-addon/preview (campos usados no mapeamento para quote). */
interface SeatAddonPreviewResponse {
  current_contracted: number;
  new_total: number;
  billing_interval: string;
  breakdown: {
    period_start: string;
    period_end: string;
    remaining_period_days: number;
    price_per_user_full_period_cents: number;
    additional_seats: number;
    amount_cents: number;
  };
}

function seatAddonPreviewToQuote(fresh: SeatAddonPreviewResponse): SeatAddonCheckoutQuote {
  return {
    current_contracted: fresh.current_contracted,
    new_total: fresh.new_total,
    additional_seats: fresh.breakdown.additional_seats,
    price_per_user_full_period_cents: fresh.breakdown.price_per_user_full_period_cents,
    remaining_period_days: fresh.breakdown.remaining_period_days,
    amount_cents_now: fresh.breakdown.amount_cents,
    new_recurring_period_cents: fresh.new_total * fresh.breakdown.price_per_user_full_period_cents,
    period_start: fresh.breakdown.period_start,
    period_end: fresh.breakdown.period_end,
    billing_interval: fresh.billing_interval,
  };
}

interface CheckoutLocationState {
  plan: PlanCheckoutPlan;
  billingInterval: string;
  usersCount?: number;
  /** Hub /meu-plano: abrir diretamente uma cobrança pai (tenant_billing) no passo de pagamento. */
  focusBillingId?: string;
  /** Fluxo dedicado: sem etapas Empresa/Admin; só resumo + pagamento. */
  checkoutMode?: 'seat_addon';
  seatAddonQuote?: SeatAddonCheckoutQuote;
}

interface CompanyData {
  company_name: string;
  email: string;
  phone: string;
  responsible_name: string;
}

interface TrialSignupResponse {
  token: string;
  tenant_id: string;
  user: { id: string; email: string; tenant_id: string; registration_complete?: boolean };
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
  /** Linha digitável do boleto (quando o gateway envia). */
  bank_slip_digitable_line?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  /** Segredo para POST /api/billing/:id/pay-with-card quando o checkout ainda não tem JWT. */
  inline_pay_token?: string;
  /** Metadata da fatura seat_addon (GET plan-checkout-pending) para recalcular preview sem state da navegação. */
  seat_addon_additional_seats?: number;
  /** Motivo da cobrança no gateway (ex.: seat_addon). */
  billing_reason?: string;
}

interface PlanCheckoutPendingApi {
  pending: PurchaseResult | null;
}

interface BillingStatusResponse {
  billing_id: string;
  status: 'pending' | 'paid' | 'overdue';
  tenant_status: string | null;
}

interface PublicPlanRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  billing_interval: string;
  plan_type: 'standard' | 'custom';
  is_default: boolean;
  is_free?: boolean;
  free_access_days?: number | null;
  trial_days?: number;
  benefits?: { icon?: string; label: string }[];
  interval_prices?: IntervalPrice[];
}

function mapPublicPlanRowToCheckout(p: PublicPlanRow): PlanCheckoutPlan {
  return {
    id: p.id,
    name: p.name,
    plan_type: p.plan_type,
    price_cents: p.price_cents,
    interval_prices: p.interval_prices,
    description: p.description,
    benefits: p.benefits,
    is_free: p.is_free,
    free_access_days: p.free_access_days,
    trial_days: p.trial_days ?? 0,
  };
}

interface CheckoutContextResponse {
  company_name: string;
  email: string;
  whatsapp: string;
  responsible_name: string;
  cpf_cnpj: string;
  users_count: number;
  billing_interval?: string;
  plan: {
    id: string;
    name: string;
    plan_type: 'standard' | 'custom';
    price_cents: number;
    trial_days: number;
    description: string | null;
    benefits: { icon?: string; label: string }[];
    interval_prices: IntervalPrice[];
  };
}

/** Valor monetário (checkout); não usa o rótulo "Grátis" para evitar confusão com dias grátis/trial. */
function formatPrice(cents: number): string {
  return formatMoneyBRL(cents);
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

const BENEFITS_PER_COLUMN = 3;

/** Agrupa benefícios em colunas de no máximo 3 itens (1–3 → 1 coluna, 4–6 → 2, 7–9 → 3…). */
function chunkPlanBenefits<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

type PersistedCheckout = CheckoutLocationState & {
  wizard_step?: number;
  /** Timestamp de gravação (ms). Usado para invalidar contexto velho via TTL. */
  _saved_at?: number;
};

/** Contexto de checkout no sessionStorage expira em 30 minutos para evitar quote/billingId obsoletos. */
const CHECKOUT_STORAGE_TTL_MS = 30 * 60 * 1000;

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copiado!'),
    () => toast.error('Não foi possível copiar')
  );
}

type PlanPurchasePm = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

/** Normaliza o método vindo da API (POST/GET pending). */
function normalizePlanPurchasePaymentMethod(m: string | undefined | null): PlanPurchasePm | null {
  const u = String(m ?? '').toUpperCase();
  if (u === 'PIX' || u === 'BOLETO' || u === 'CREDIT_CARD') return u;
  return null;
}

/**
 * Cobrança já exibível para o método escolhido (evita POST duplicado ao re-clicar no mesmo método).
 * Coerente com reuso no backend: linha `pending` | `waiting_payment` | `processing` com payload do método.
 */
function hasRenderablePayloadForMethod(result: PurchaseResult, method: PlanPurchasePm): boolean {
  const pm = normalizePlanPurchasePaymentMethod(result.payment_method);
  if (pm && pm !== method) return false;
  if (method === 'PIX') return !!(result.pix_qr_code || result.pix_copy_paste);
  if (method === 'BOLETO') {
    if (result.pix_qr_code || result.pix_copy_paste) return false;
    return !!(
      result.bank_slip_url?.trim() ||
      result.invoice_url?.trim() ||
      result.bank_slip_digitable_line?.trim()
    );
  }
  if (method === 'CREDIT_CARD') {
    if (result.pix_qr_code || result.pix_copy_paste) return false;
    return pm === 'CREDIT_CARD' && !!result.billing_id;
  }
  return false;
}

/** Método efetivo da cobrança exibida (não confundir com o cartão só selecionado na UI). */
function inferPaymentMethodFromResult(result: PurchaseResult | null): PlanPurchasePm | null {
  if (!result) return null;
  const pm = normalizePlanPurchasePaymentMethod(result.payment_method);
  if (pm) return pm;
  if (result.pix_qr_code || result.pix_copy_paste) return 'PIX';
  if (result.bank_slip_url || result.bank_slip_digitable_line?.trim()) return 'BOLETO';
  if (result.invoice_url?.trim()) return 'CREDIT_CARD';
  return null;
}

/** Cobrança ativa na tela: prioriza API/payload, não só o método selecionado na grade. */
function effectivePaymentDisplayMethod(
  result: PurchaseResult | null,
  uiPaymentMethod: PlanPurchasePm
): PlanPurchasePm {
  if (!result) return uiPaymentMethod;
  return inferPaymentMethodFromResult(result) ?? uiPaymentMethod;
}

const STEP_DEFS = [
  { id: 1, title: 'Plano', icon: LayoutGrid },
  { id: 2, title: 'Empresa e admin', icon: Building2 },
  { id: 3, title: 'Resumo', icon: ClipboardList },
  { id: 4, title: 'Pagamento', icon: CreditCard },
];

/** Stepper dedicado ao modo assentos adicionais (sem Plano / Empresa). */
const SEAT_ADDON_STEP_DEFS = [
  { id: 3, title: 'Resumo de assentos', icon: Users },
  { id: 4, title: 'Pagamento', icon: CreditCard },
];

function persistCheckout(ctx: PersistedCheckout | null) {
  try {
    if (!ctx?.plan?.id) {
      sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({ ...ctx, _saved_at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/**
 * Lê o contexto persistido validando o TTL.
 * Retorna null se ausente, corrompido ou mais antigo que CHECKOUT_STORAGE_TTL_MS.
 * Garante que quotes de seat_addon e focusBillingId obsoletos nunca sejam reutilizados.
 */
function loadPersistedCheckout(): PersistedCheckout | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as PersistedCheckout;
    if (!ctx?._saved_at || Date.now() - ctx._saved_at > CHECKOUT_STORAGE_TTL_MS) {
      sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
      return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

function toastFromPlanPurchaseCode(code: string | undefined, fallback: string) {
  switch (code) {
    case 'EMAIL_ALREADY_REGISTERED_USE_LOGIN':
      toast.error('Este e-mail já possui cadastro. Faça login ou use outro e-mail.');
      return;
    case 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN':
      toast.error('Este WhatsApp já possui cadastro. Faça login ou use outro número.');
      return;
    case 'PLAN_REQUIRED':
      toast.error('Selecione um plano válido.');
      return;
    case 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD':
      toast.error('CPF ou CNPJ válido é obrigatório para este método de pagamento.');
      return;
    case 'INVALID_CHECKOUT_CONTEXT':
      toast.error('Dados insuficientes ou inválidos. Verifique as informações e tente novamente.');
      return;
    case 'TRIAL_ALREADY_CONSUMED':
      toast.error('Trial já utilizado para estes dados. Faça login ou conclua o pagamento na retomada.');
      return;
    case 'PLAN_HAS_NO_TRIAL':
      toast.error('Este plano não oferece período de trial.');
      return;
    case 'ALREADY_AUTHENTICATED':
      toast.error('Você já está logado. Use o fluxo de pagamento no painel.');
      return;
    case 'CHECKOUT_TENANT_IDENTITY_MISMATCH':
      toast.error(
        'Os dados informados não correspondem a esta conta. Confirme o e-mail e o documento ou faça login.'
      );
      return;
    case 'CHECKOUT_PREPARE_PAYMENT_FAILED':
      toast.error('Não foi possível preparar este pagamento. Atualize a página ou tente outro método.');
      return;
    default:
      toast.error(fallback);
  }
}

export default function PlanCheckout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, user, loading: authLoading, setTokenAndUser, refreshUser } = useAuth();
  const state = location.state as CheckoutLocationState | null;
  const isResumeMode = checkoutResumeEnabled && searchParams.get('mode') === 'resume';
  /** Tenant já existe (ex.: Meu plano → Renovar): pular cadastro e ir ao pagamento com plano/intervalo do state. */
  const isRenewMode = searchParams.get('mode') === 'renew';
  const isSeatAddonMode = searchParams.get('mode') === 'seat_addon';
  const seatAddonBillingIdQuery = searchParams.get('billing_id');

  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<PlanCheckoutPlan | null>(null);
  const [billingInterval, setBillingInterval] = useState('monthly');
  const [usersCount, setUsersCount] = useState(1);
  const [plansCatalog, setPlansCatalog] = useState<PublicPlanRow[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);

  const [company, setCompany] = useState<CompanyData>({
    company_name: '',
    email: '',
    phone: '',
    responsible_name: '',
  });
  const [adminWhatsapp, setAdminWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [billingCpf, setBillingCpf] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<'BOLETO' | 'PIX' | 'CREDIT_CARD'>('PIX');
  const [cpfCnpjError, setCpfCnpjError] = useState('');
  const [loading, setLoading] = useState(false);
  const [identityCheckLoading, setIdentityCheckLoading] = useState(false);
  /** Plano veio da landing/session inicial — etapa 1 do stepper é ocultada e começamos na 2. */
  const [enteredWithPlanFromContext, setEnteredWithPlanFromContext] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);
  const [planCardForm, setPlanCardForm] = useState<InlineCreditCardFormState>(() => createEmptyInlineCreditCardForm());
  const [payingPlanCard, setPayingPlanCard] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkoutPasswordRef = useRef<string>('');
  const paymentFinalizeStartedRef = useRef(false);
  const lastPolledBillingIdRef = useRef<string | null>(null);
  /** Evita re-hidratar na mesma visita após o usuário trocar método no passo de pagamento. */
  const skipNextPlanHydrateRef = useRef(false);
  /** Impede GET plan-checkout-pending de sobrescrever o estado até o usuário escolher método de novo. */
  const blockAutoHydrateRef = useRef(false);
  const [resumePaymentOnly, setResumePaymentOnly] = useState(false);
  /** Retomada: documento já válido no contexto fica somente leitura até o usuário optar por alterar. */
  const [resumeBillingDocUnlocked, setResumeBillingDocUnlocked] = useState(false);
  /** Em modo resume/renew, começa true para não exibir passos iniciais antes do checkout-context. */
  const [resumeContextLoading, setResumeContextLoading] = useState(
    () => isResumeMode || isRenewMode
  );
  /** Falha explícita em GET /api/me/tenant/checkout-context — não voltar silenciosamente ao fluxo normal. */
  const [resumeContextError, setResumeContextError] = useState<string | null>(null);
  const meuPlanoBillingFocusHandledRef = useRef(false);

  const [seatAddonQuote, setSeatAddonQuote] = useState<SeatAddonCheckoutQuote | null>(
    () => state?.seatAddonQuote ?? null
  );
  const [seatAddonPayPrimingLoading, setSeatAddonPayPrimingLoading] = useState(false);

  /** Upgrade logado: usuário autenticado no CRM. Evita usar só token (resíduo) sem user carregado. */
  const isCheckoutUpgrade = !authLoading && !!user?.id;

  /**
   * Contexto de cobrança de assentos (URL ou pending carregado). Independe de `authLoading`, para não exibir
   * `amountCents` do plano cheio nem deixar o hydrate genérico sobrescrever a fatura de assentos.
   */
  const seatAddonBillingContextActive =
    !!(state?.focusBillingId?.trim() || seatAddonBillingIdQuery?.trim()) &&
    (isSeatAddonMode || result?.billing_reason === 'seat_addon');

  /** Fluxo assentos com sessão pronta: preparar pagamento, preview e ações do hub. */
  const seatAddonFlowActive = isCheckoutUpgrade && seatAddonBillingContextActive;

  /**
   * Valor a pagar agora no seat_addon: pró-rata do incremental — nunca o preço cheio do plano (`amountCents`).
   */
  const seatAddonPayNowCents = useMemo(() => {
    if (!seatAddonBillingContextActive) return null;
    return seatAddonQuote?.amount_cents_now ?? result?.amount_cents ?? null;
  }, [seatAddonBillingContextActive, seatAddonQuote?.amount_cents_now, result?.amount_cents]);

  /** Após pagamento confirmado: /auth/me precisa refletir tenant ativo (evita requires_checkout_resume preso no cliente). */
  const flushCheckoutSessionAfterPaid = useCallback(async () => {
    if (apiClient.getToken()) {
      await refreshUser().catch(() => {});
    }
  }, [refreshUser]);

  const isCustom = plan?.plan_type === 'custom';
  const prices = plan?.interval_prices ?? [];
  const priceRow = prices.find((p) => p.billing_interval === billingInterval);
  const amountCents =
    plan && isCustom && priceRow
      ? priceRow.price_per_user_cents * usersCount
      : plan?.price_cents ?? 0;

  const intervalLabel = BILLING_INTERVALS.find((i) => i.key === billingInterval)?.label ?? billingInterval;
  const periodLabel = BILLING_INTERVAL_PERIOD_SUFFIX[billingInterval] ?? 'mês';
  const hasIntervalSelector = isCustom && prices.length > 1;
  const intervalIdx = BILLING_INTERVALS.findIndex((i) => i.key === billingInterval);
  const canPrevInterval = hasIntervalSelector && intervalIdx > 0;
  const canNextInterval = hasIntervalSelector && intervalIdx >= 0 && intervalIdx < BILLING_INTERVALS.length - 1;

  const skipPlanStep = enteredWithPlanFromContext;

  /** Plano veio da home/landing via `navigate(..., { state })` — pula etapa 1 no stepper. */
  const applyPlanFromLanding = useCallback((ctx: CheckoutLocationState) => {
    setPlan(ctx.plan);
    setBillingInterval(ctx.billingInterval ?? 'monthly');
    setUsersCount(ctx.usersCount ?? 1);
    setStep(2);
    setEnteredWithPlanFromContext(true);
  }, []);

  /** Sair de `?mode=resume|renew` reseta flags; ao entrar, reabre loading (resume limpa sessão antiga). */
  useEffect(() => {
    if (!isResumeMode && !isRenewMode) {
      setResumePaymentOnly(false);
      setResumeBillingDocUnlocked(false);
      setResumeContextLoading(false);
      setResumeContextError(null);
      return;
    }
    setResumeContextLoading(true);
    setResumeContextError(null);
    if (isResumeMode) {
      persistCheckout(null);
    }
  }, [isResumeMode, isRenewMode]);

  /**
   * Guard de isolamento do modo seat_addon:
   * 1. Exige autenticação — sem login, redireciona para /login.
   * 2. Exige billing_id explícito na URL — sem ele, o fluxo não tem objeto de pagamento
   *    e cairia silenciosamente no checkout de plano completo (comportamento errado).
   *    Neste caso redireciona para /meu-plano onde o usuário pode iniciar o fluxo correto.
   */
  useEffect(() => {
    if (!isSeatAddonMode) return;
    if (authLoading) return;
    if (!user?.id) {
      navigate('/login', { replace: true });
      return;
    }
    if (!seatAddonBillingIdQuery?.trim() && !state?.focusBillingId?.trim()) {
      toast.error('Acesse a contratação de assentos pela central Meu plano.');
      navigate('/meu-plano', { replace: true });
    }
  }, [isSeatAddonMode, authLoading, user?.id, seatAddonBillingIdQuery, state?.focusBillingId, navigate]);

  useEffect(() => {
    if (!isResumeMode) return;
    if (authLoading) return;
    if (!user?.id) {
      navigate('/login', { replace: true });
      return;
    }
    let cancelled = false;
    setResumeContextError(null);
    setResumeContextLoading(true);
    void (async () => {
      const res = await apiClient.get<CheckoutContextResponse>('/api/me/tenant/checkout-context');
      if (cancelled) return;
      setResumeContextLoading(false);
      if (res.error || !res.data) {
        const msg = res.error || 'Não foi possível carregar a retomada do checkout.';
        toast.error(msg);
        setResumeContextError(msg);
        return;
      }
      const d = res.data;
      const resolvedInterval = BILLING_INTERVALS.some((i) => i.key === d.billing_interval)
        ? d.billing_interval!
        : 'monthly';
      const mappedPlan: PlanCheckoutPlan = {
        id: d.plan.id,
        name: d.plan.name,
        plan_type: d.plan.plan_type,
        price_cents: d.plan.price_cents,
        interval_prices: d.plan.interval_prices,
        description: d.plan.description,
        benefits: d.plan.benefits,
        trial_days: d.plan.trial_days,
      };
      setPlan(mappedPlan);
      setBillingInterval(resolvedInterval);
      setCompany({
        company_name: d.company_name,
        email: d.email,
        phone: '',
        responsible_name: d.responsible_name,
      });
      setAdminWhatsapp(d.whatsapp || '');
      const cpfDigits = String(d.cpf_cnpj ?? '').replace(/\D/g, '');
      setBillingCpf(cpfDigits ? formatCpfCnpjDigits(cpfDigits) : '');
      setResumeBillingDocUnlocked(!cpfDigits || !isValidCpfOrCnpj(cpfDigits));
      setUsersCount(Math.max(1, d.users_count || 1));
      setResumePaymentOnly(true);
      setEnteredWithPlanFromContext(true);
      setResumeContextError(null);
      setStep(4);
      persistCheckout({
        plan: mappedPlan,
        billingInterval: resolvedInterval,
        usersCount: Math.max(1, d.users_count || 1),
        wizard_step: 4,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isResumeMode, user?.id, authLoading, navigate]);

  /**
   * Renovação / upgrade a partir do hub (Meu plano): plano e intervalo vêm do `location.state`;
   * empresa/CPF/WhatsApp do GET checkout-context. Vai direto ao passo de pagamento (como retomada trial).
   */
  useEffect(() => {
    if (!isRenewMode) return;
    if (authLoading) return;
    if (!user?.id) {
      navigate('/login', { replace: true });
      return;
    }
    const st = location.state as CheckoutLocationState | null;
    if (!st?.plan?.id) {
      toast.error('Volte a Meu plano para iniciar a renovação com o plano selecionado.');
      navigate('/meu-plano', { replace: true });
      return;
    }
    let cancelled = false;
    setResumeContextError(null);
    setResumeContextLoading(true);
    void (async () => {
      const res = await apiClient.get<CheckoutContextResponse>('/api/me/tenant/checkout-context?purpose=renew');
      if (cancelled) return;
      setResumeContextLoading(false);
      if (res.error || !res.data) {
        const msg = res.error || 'Não foi possível carregar os dados da conta.';
        toast.error(msg);
        setResumeContextError(msg);
        return;
      }
      const d = res.data;
      setPlan(st.plan);
      setBillingInterval(st.billingInterval ?? 'monthly');
      setUsersCount(Math.max(1, st.usersCount ?? 1));
      setCompany({
        company_name: d.company_name,
        email: d.email,
        phone: '',
        responsible_name: d.responsible_name,
      });
      setAdminWhatsapp(d.whatsapp || '');
      const cpfDigits = String(d.cpf_cnpj ?? '').replace(/\D/g, '');
      setBillingCpf(cpfDigits ? formatCpfCnpjDigits(cpfDigits) : '');
      setResumeBillingDocUnlocked(!cpfDigits || !isValidCpfOrCnpj(cpfDigits));
      setResumePaymentOnly(true);
      setEnteredWithPlanFromContext(true);
      setResumeContextError(null);
      setStep(4);
      persistCheckout({
        plan: st.plan,
        billingInterval: st.billingInterval ?? 'monthly',
        usersCount: Math.max(1, st.usersCount ?? 1),
        wizard_step: 4,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [isRenewMode, user?.id, authLoading, navigate, location.key]);

  const resolvedFocusBillingId = state?.focusBillingId?.trim() || seatAddonBillingIdQuery?.trim() || null;

  useEffect(() => {
    if (!resolvedFocusBillingId) {
      meuPlanoBillingFocusHandledRef.current = false;
    }
  }, [resolvedFocusBillingId]);

  /** Hub /meu-plano: cobrança pai (tenant_billing) — seat_addon pula Empresa/Admin e começa no resumo. */
  useEffect(() => {
    if (isResumeMode || isRenewMode || authLoading || !user?.id || !isCheckoutUpgrade) return;
    const fid = resolvedFocusBillingId;
    if (!fid) return;
    if (meuPlanoBillingFocusHandledRef.current) return;

    let cancelled = false;
    const quoteFromNav = state?.seatAddonQuote;
    if (quoteFromNav) setSeatAddonQuote(quoteFromNav);

    void (async () => {
      let planLocal = state?.plan ?? null;
      let bi = state?.billingInterval ?? 'monthly';
      let uc = state?.usersCount ?? 1;

      const pendingRes = await apiClient.get<PlanCheckoutPendingApi>(
        `/api/me/tenant/plan-checkout-pending?billing_id=${encodeURIComponent(fid)}`
      );
      if (cancelled) return;
      if (pendingRes.error || !pendingRes.data?.pending) {
        toast.error(
          pendingRes.error ||
            'Não foi possível abrir esta cobrança no checkout. Use o fluxo principal ou o pagamento na central Meu plano.'
        );
        meuPlanoBillingFocusHandledRef.current = false;
        return;
      }
      const p = pendingRes.data.pending;
      const isSeatBilling = p.billing_reason === 'seat_addon';
      const seatLikeFlow = isSeatAddonMode || isSeatBilling;

      /**
       * Assentos: sempre busca checkout-context com purpose=seat_addon (empresa/CPF). Demais focos: contexto genérico
       * só se ainda não há plano (ex.: refresh). Ordem: pending antes de setStep — evita um frame com valor “plano cheio”.
       */
      if (fid && (seatLikeFlow || !planLocal)) {
        const ctxRes = await apiClient.get<CheckoutContextResponse>(
          seatLikeFlow
            ? '/api/me/tenant/checkout-context?purpose=seat_addon'
            : '/api/me/tenant/checkout-context?purpose=renew'
        );
        if (cancelled) return;
        if (ctxRes.error || !ctxRes.data) {
          toast.error(ctxRes.error || 'Não foi possível carregar os dados da conta.');
          meuPlanoBillingFocusHandledRef.current = false;
          return;
        }
        const d = ctxRes.data;
        const resolvedInterval = BILLING_INTERVALS.some((i) => i.key === d.billing_interval)
          ? d.billing_interval!
          : 'monthly';
        setCompany({
          company_name: d.company_name,
          email: d.email,
          phone: '',
          responsible_name: d.responsible_name,
        });
        setAdminWhatsapp(d.whatsapp || '');
        const cpfDigits = String(d.cpf_cnpj ?? '').replace(/\D/g, '');
        setBillingCpf(cpfDigits ? formatCpfCnpjDigits(cpfDigits) : '');
        setResumeBillingDocUnlocked(!cpfDigits || !isValidCpfOrCnpj(cpfDigits));

        if (!planLocal) {
          planLocal = {
            id: d.plan.id,
            name: d.plan.name,
            plan_type: d.plan.plan_type,
            price_cents: d.plan.price_cents,
            interval_prices: d.plan.interval_prices,
            description: d.plan.description,
            benefits: d.plan.benefits,
            trial_days: d.plan.trial_days,
          };
          bi = resolvedInterval;
          uc = Math.max(1, d.users_count || 1);
          setPlan(planLocal);
          setBillingInterval(bi);
          setUsersCount(uc);
        }
      }

      if (!planLocal || cancelled) return;
      meuPlanoBillingFocusHandledRef.current = true;

      blockAutoHydrateRef.current = true;
      setPlan(planLocal);
      setBillingInterval(bi);
      setUsersCount(Math.max(1, uc));
      setEnteredWithPlanFromContext(!seatLikeFlow);
      setStep(seatLikeFlow ? 3 : 4);
      if (isSeatBilling && !isSeatAddonMode) {
        navigate(`/checkout?mode=seat_addon&billing_id=${encodeURIComponent(fid)}`, { replace: true, state: {} });
      } else {
        navigate('.', { replace: true, state: {} });
      }

      setResult({
        ...p,
        tenant_id: p.tenant_id || user.tenant_id || '',
      });
      const pm = p.payment_method;
      if (pm === 'PIX' || pm === 'BOLETO' || pm === 'CREDIT_CARD') {
        setPaymentMethod(pm);
      }
      persistCheckout({
        plan: planLocal,
        billingInterval: bi,
        usersCount: Math.max(1, uc),
        focusBillingId: fid,
        checkoutMode: seatLikeFlow ? 'seat_addon' : undefined,
        seatAddonQuote: quoteFromNav ?? undefined,
        wizard_step: seatLikeFlow ? 3 : 4,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isResumeMode,
    isRenewMode,
    authLoading,
    user?.id,
    user?.tenant_id,
    isCheckoutUpgrade,
    resolvedFocusBillingId,
    state?.plan,
    state?.billingInterval,
    state?.usersCount,
    state?.seatAddonQuote,
    isSeatAddonMode,
    navigate,
  ]);

  /** Logado: reapresenta cobrança já gerada (GET) sem novo POST — alinhado ao fluxo maduro de faturas. */
  useEffect(() => {
    if (step !== 4) return;
    /** seat_addon: nunca hidratar pelo pending genérico (intervalo/usuários) — sobrescreveria a fatura correta. */
    if (seatAddonBillingContextActive) return;
    if (!plan?.id || !user?.tenant_id) return;
    if (result) return;
    if (loading) return;
    if (authLoading) return;
    if ((isResumeMode || isRenewMode) && (resumeContextLoading || !resumePaymentOnly)) return;
    if (skipNextPlanHydrateRef.current) {
      skipNextPlanHydrateRef.current = false;
      return;
    }
    if (blockAutoHydrateRef.current) return;
    let cancelled = false;
    void (async () => {
      const params = new URLSearchParams({ billing_interval: billingInterval });
      if (isCustom) params.set('users_count', String(usersCount));
      const res = await apiClient.get<PlanCheckoutPendingApi>(`/api/me/tenant/plan-checkout-pending?${params.toString()}`);
      if (cancelled || res.error || !res.data?.pending) return;
      const p = res.data.pending;
      setResult({
        ...p,
        tenant_id: p.tenant_id || user.tenant_id || '',
      });
      const pm = p.payment_method;
      if (pm === 'PIX' || pm === 'BOLETO' || pm === 'CREDIT_CARD') {
        setPaymentMethod(pm);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    plan?.id,
    billingInterval,
    usersCount,
    user?.tenant_id,
    result,
    loading,
    authLoading,
    isCustom,
    isResumeMode,
    isRenewMode,
    resumeContextLoading,
    resumePaymentOnly,
    seatAddonBillingContextActive,
  ]);

  useEffect(() => {
    if (step !== 4 || !plan) return;
    const docDigits = billingCpf.replace(/\D/g, '');
    setPlanCardForm((f) => ({
      ...f,
      ch_name: f.ch_name || company.responsible_name?.trim() || '',
      ch_email: f.ch_email || company.email?.trim() || '',
      ch_cpf_cnpj: f.ch_cpf_cnpj || docDigits || f.ch_cpf_cnpj,
      ch_phone: f.ch_phone || adminWhatsapp.replace(/\D/g, '').slice(0, 11) || f.ch_phone,
    }));
  }, [step, plan?.id, company.responsible_name, company.email, billingCpf, adminWhatsapp]);

  useEffect(() => {
    if (isResumeMode || isRenewMode) return;
    /** Evita corrida com o efeito de focusBillingId / seat_addon (que pularia Empresa e admin). */
    if (state?.focusBillingId?.trim() || isSeatAddonMode || seatAddonBillingIdQuery?.trim()) return;
    if (state?.plan) {
      try {
        sessionStorage.removeItem(LANDING_CHECKOUT_PREFILL_KEY);
      } catch {
        /* ignore */
      }
      applyPlanFromLanding({
        plan: state.plan,
        billingInterval: state.billingInterval ?? 'monthly',
        usersCount: state.usersCount ?? 1,
      });
      persistCheckout({
        plan: state.plan,
        billingInterval: state.billingInterval ?? 'monthly',
        usersCount: state.usersCount ?? 1,
        wizard_step: 2,
      });
      return;
    }
    /** Landing estática grava o plano em sessionStorage antes de `window.location` para /checkout. */
    try {
      const raw = sessionStorage.getItem(LANDING_CHECKOUT_PREFILL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CheckoutLocationState;
        if (parsed?.plan) {
          navigate(`${location.pathname}${location.search}`, { replace: true, state: parsed });
          return;
        }
        sessionStorage.removeItem(LANDING_CHECKOUT_PREFILL_KEY);
      }
    } catch {
      try {
        sessionStorage.removeItem(LANDING_CHECKOUT_PREFILL_KEY);
      } catch {
        /* ignore */
      }
    }
    /**
     * Sem contexto explícito (URL/state), não reaproveitar sessionStorage: evita seat_addon / focusBillingId /
     * wizard_step antigos após "Começar" ou Link /checkout. Fluxos especiais hidratam pelos efeitos dedicados.
     */
    persistCheckout(null);
  }, [
    state,
    applyPlanFromLanding,
    isResumeMode,
    isRenewMode,
    isSeatAddonMode,
    seatAddonBillingIdQuery,
    navigate,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    if ((isResumeMode || isRenewMode) && !resumePaymentOnly) return;
    if (plan) {
      const bid = seatAddonBillingIdQuery?.trim() || undefined;
      persistCheckout({
        plan,
        billingInterval,
        usersCount,
        wizard_step: step,
        ...(seatAddonFlowActive && bid
          ? {
              focusBillingId: bid,
              checkoutMode: 'seat_addon' as const,
              seatAddonQuote: seatAddonQuote ?? undefined,
            }
          : {}),
      });
    }
  }, [
    plan,
    billingInterval,
    usersCount,
    step,
    isResumeMode,
    isRenewMode,
    resumePaymentOnly,
    seatAddonFlowActive,
    seatAddonBillingIdQuery,
    seatAddonQuote,
  ]);

  useEffect(() => {
    if (isResumeMode || isRenewMode) return;
    if (step === 1 && !plansLoading && plansCatalog.length === 0) {
      setPlansLoading(true);
      apiClient.get<PublicPlanRow[]>('/api/plans').then((res) => {
        setPlansLoading(false);
        if (res.data && Array.isArray(res.data)) setPlansCatalog(res.data);
      });
    }
  }, [step, plansLoading, plansCatalog.length, isResumeMode, isRenewMode]);

  /**
   * Um único plano no catálogo: pré-seleciona no passo 1 (ex. «Começar grátis» → /checkout sem state).
   * Não pula a etapa Plano — diferente de `applyPlanFromLanding` quando vem `state.plan` da vitrine.
   */
  useEffect(() => {
    if (isResumeMode || isRenewMode) return;
    if (state?.plan) return;
    if (state?.focusBillingId?.trim() || isSeatAddonMode || seatAddonBillingIdQuery?.trim()) return;
    if (plansLoading || plansCatalog.length !== 1) return;
    if (step !== 1) return;
    const only = plansCatalog[0];
    if (plan?.id === only.id) return;
    setPlan(mapPublicPlanRowToCheckout(only));
    setBillingInterval('monthly');
    setUsersCount(1);
  }, [
    isResumeMode,
    isRenewMode,
    state?.plan,
    state?.focusBillingId,
    isSeatAddonMode,
    seatAddonBillingIdQuery,
    plansLoading,
    plansCatalog,
    step,
    plan?.id,
  ]);

  useEffect(() => {
    const billingId = result?.billing_id;
    if (!billingId) return;
    if (lastPolledBillingIdRef.current !== billingId) {
      lastPolledBillingIdRef.current = billingId;
      paymentFinalizeStartedRef.current = false;
    }

    /** ~4 ciclos em 10s para alinhar detecção rápida sem tempestade de requests */
    const POLL_INTERVAL_MS = 2_500;
    const POLL_TIMEOUT_MS = 10 * 60 * 1000;

    const onPaymentConfirmed = async () => {
      if (paymentFinalizeStartedRef.current) return;
      paymentFinalizeStartedRef.current = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pollingRef.current = null;
      timeoutRef.current = null;

      await flushCheckoutSessionAfterPaid();
      persistCheckout(null);

      if (checkoutPasswordRef.current) {
        const email = company.email.trim();
        const pwd = checkoutPasswordRef.current;
        const path = await signIn(email, pwd);
        if (path !== '/login') {
          navigateToSignupSuccess(navigate, '/dashboard');
          return;
        }
        toast.error('Pagamento confirmado, mas o login automático falhou. Acesse com seu e-mail e senha.');
        navigate('/login', { replace: true });
        return;
      }

      setPaymentConfirmed(true);
    };

    const checkStatus = async () => {
      const res = await apiClient.get<BillingStatusResponse>(`/api/billing/${billingId}/status`);
      if (res.error || !res.data) return;
      const { status } = res.data;
      /**
       * NÃO usar `tenant_status === 'active'`: em `seat_addon` o tenant já está ativo com a cobrança ainda em aberto.
       * O backend envia `tenants.status` no JOIN; isso disparava confirmação falsa e redirect (dashboard/meu-plano).
       */
      if (status === 'paid') {
        await onPaymentConfirmed();
      }
    };

    pollingRef.current = setInterval(checkStatus, POLL_INTERVAL_MS);
    checkStatus();

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
  }, [result?.billing_id, signIn, navigate, flushCheckoutSessionAfterPaid]);

  useEffect(() => {
    if (!paymentConfirmed) return;
    const paidSeatAddonContext =
      result?.billing_reason === 'seat_addon' ||
      (isSeatAddonMode && !!seatAddonBillingIdQuery?.trim());
    const target = seatAddonFlowActive || paidSeatAddonContext ? '/meu-plano' : '/dashboard';
    const t = setTimeout(() => {
      navigate(target, { replace: true });
    }, 1500);
    return () => clearTimeout(t);
  }, [
    paymentConfirmed,
    navigate,
    seatAddonFlowActive,
    result?.billing_reason,
    isSeatAddonMode,
    seatAddonBillingIdQuery,
  ]);

  const validateStep2 = (): boolean => {
    if (isCheckoutUpgrade) return true;
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
      toast.error('Informe o nome do administrador.');
      return false;
    }
    const wa = adminWhatsapp.replace(/\D/g, '');
    if (wa.length < MIN_WHATSAPP_DIGITS) {
      toast.error(`Informe o WhatsApp com DDD (mínimo ${MIN_WHATSAPP_DIGITS} dígitos).`);
      return false;
    }
    if (!password || password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return false;
    }
    if (password !== passwordConfirm) {
      toast.error('As senhas não coincidem.');
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!plan) {
        toast.error('Selecione um plano para continuar.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (isCheckoutUpgrade) {
        if (!validateStep2()) return;
        setStep(3);
        return;
      }
      if (!validateStep2()) return;
      setIdentityCheckLoading(true);
      try {
        const res = await apiClient.post<{ ok?: boolean }>('/api/plan-purchase/validate-admin', {
          email: company.email.trim(),
          whatsapp: adminWhatsapp.trim(),
        });
        if (res.error) {
          toastFromPlanPurchaseCode(res.code, res.error);
          return;
        }
        setStep(3);
      } finally {
        setIdentityCheckLoading(false);
      }
      return;
    }
    if (step < 4) {
      if (step === 3) {
        blockAutoHydrateRef.current = false;
      }
      setStep(step + 1);
    }
  };

  const showTrialOnSummary =
    !trialCheckoutUiDisabled &&
    !isCheckoutUpgrade &&
    !resumePaymentOnly &&
    !isResumeMode &&
    !isRenewMode &&
    !seatAddonBillingContextActive &&
    plan != null &&
    planHasCheckoutTrial(plan);

  const handleStartTrial = async () => {
    if (!plan) return;
    if (!validateStep2()) return;
    setLoading(true);
    try {
      const docDigits = billingCpf.replace(/\D/g, '');
      const body = withMarketingAttribution({
        plan_id: plan.id,
        billing_interval: billingInterval,
        company_name: company.company_name.trim(),
        email: company.email.trim(),
        responsible_name: company.responsible_name.trim(),
        password,
        whatsapp: adminWhatsapp.trim(),
        ...(isCustom ? { users_count: usersCount } : {}),
        ...(docDigits ? { cpf_cnpj: docDigits } : {}),
        ...(company.phone?.trim() ? { phone: company.phone.trim() } : {}),
      });

      const res = await apiClient.post<TrialSignupResponse>('/api/plan-purchase/complete-signup-trial', body);
      if (res.error) {
        toastFromPlanPurchaseCode(res.code, res.error);
        return;
      }
      if (res.data?.token && res.data.user) {
        await setTokenAndUser(res.data.token, {
          ...res.data.user,
          registration_complete: true,
        });
        await refreshUser();
        persistCheckout(null);
        toast.success(`Bem-vindo! Seu trial de ${effectiveCheckoutTrialDays(plan)} dias começou.`);
        navigateToSignupSuccess(navigate, '/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 4 && resumePaymentOnly) {
      navigate(isRenewMode ? '/meu-plano' : '/dashboard', { replace: true });
      return;
    }
    if (seatAddonFlowActive && step === 4 && !paymentConfirmed) {
      navigate('/meu-plano', { replace: true });
      return;
    }
    if (seatAddonFlowActive && step === 3) {
      navigate('/meu-plano', { replace: true });
      return;
    }
    if (step === 1) {
      navigate('/landing');
      return;
    }
    if (step === 2 && enteredWithPlanFromContext) {
      setPlan(null);
      setStep(1);
      setEnteredWithPlanFromContext(false);
      persistCheckout(null);
      navigate('/checkout', { replace: true, state: undefined });
      return;
    }
    if (step === 2 && !enteredWithPlanFromContext) {
      setStep(1);
      return;
    }
    if (step > 1) setStep(step - 1);
  };

  const hasChargeReady = Boolean(result?.billing_id);

  /**
   * seat_addon: preview fresco como fonte de verdade antes de qualquer ação que conclui/concretiza pagamento
   * (troca de método via plan-purchase, cartão). Cobrança existente deve bater com o pró-rata atual (±2 centavos).
   */
  const ensureFreshSeatAddonPreviewBeforePay = useCallback(async (): Promise<boolean> => {
    const additional =
      seatAddonQuote?.additional_seats ?? result?.seat_addon_additional_seats ?? null;
    if (additional == null || additional < 1) {
      toast.error(
        'Não foi possível identificar a quantidade de assentos desta cobrança. Volte ao Meu plano e inicie o fluxo novamente.'
      );
      return false;
    }
    const res = await apiClient.post<SeatAddonPreviewResponse>('/api/me/tenant/seat-addon/preview', {
      additional_seats: additional,
    });
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível recalcular o valor proporcional. Tente novamente.');
      return false;
    }
    const quote = seatAddonPreviewToQuote(res.data);
    setSeatAddonQuote(quote);
    if (result?.billing_id && Math.abs(quote.amount_cents_now - result.amount_cents) > 2) {
      toast.error(
        'O valor proporcional mudou em relação a esta cobrança. Volte ao Meu plano e gere novamente a cobrança de assentos.'
      );
      return false;
    }
    return true;
  }, [seatAddonQuote?.additional_seats, result?.seat_addon_additional_seats, result?.amount_cents, result?.billing_id]);

  const handleSeatAddonGoToPayment = useCallback(async () => {
    blockAutoHydrateRef.current = false;
    setSeatAddonPayPrimingLoading(true);
    try {
      const ok = await ensureFreshSeatAddonPreviewBeforePay();
      if (!ok) return;
      setStep(4);
    } finally {
      setSeatAddonPayPrimingLoading(false);
    }
  }, [ensureFreshSeatAddonPreviewBeforePay]);

  /**
   * Prepara cobrança (reuso ou POST). Antes da primeira cobrança, o usuário escolhe o método e confirma em
   * "Gerar cobrança"; depois que existe `billing_id`, trocar o método dispara nova preparação aqui.
   */
  const runPlanPayment = async (method: PlanPurchasePm) => {
    if (!plan || loading) return;
    if (seatAddonFlowActive && !hasChargeReady) {
      toast.error('Aguarde a cobrança de assentos carregar ou volte ao Meu plano e tente novamente.');
      return;
    }
    setCpfCnpjError('');
    const docDigits = billingCpf.replace(/\D/g, '');
    if (method === 'PIX' && !isValidCpfOrCnpj(docDigits)) {
      setCpfCnpjError('Informe um CPF ou CNPJ válido para pagamento PIX.');
      toastFromPlanPurchaseCode('CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD', 'CPF/CNPJ inválido.');
      return;
    }

    const pmOnResult = normalizePlanPurchasePaymentMethod(result?.payment_method);
    if (
      hasChargeReady &&
      method === paymentMethod &&
      result &&
      (!pmOnResult || pmOnResult === method) &&
      hasRenderablePayloadForMethod(result, method)
    ) {
      return;
    }

    /**
     * seat_addon: nunca chama POST /api/plan-purchase ao trocar método — isso recalculava valor cheio do plano.
     * Usa prepare na fatura existente (valor pró-rata já na linha).
     */
    if (seatAddonFlowActive) {
      const ok = await ensureFreshSeatAddonPreviewBeforePay();
      if (!ok) return;
      blockAutoHydrateRef.current = false;
      setPaymentMethod(method);
      setLoading(true);
      try {
        const prep = await apiClient.post<PurchaseResult>('/api/me/tenant/plan-checkout-prepare-payment', {
          billing_id: result!.billing_id,
          payment_method: method,
        });
        if (prep.error) {
          toastFromPlanPurchaseCode(prep.code, prep.error);
          if (prep.field === 'cpf_cnpj') {
            setCpfCnpjError(prep.error);
            setStep(4);
          }
          return;
        }
        if (prep.data) {
          setResult((prev) => ({
            ...prep.data,
            tenant_id: prep.data.tenant_id || user?.tenant_id || '',
            billing_reason: prep.data.billing_reason ?? prev?.billing_reason,
            seat_addon_additional_seats:
              prep.data.seat_addon_additional_seats ?? prev?.seat_addon_additional_seats,
          }));
          toast.success('Pagamento preparado. Siga as instruções abaixo.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    blockAutoHydrateRef.current = false;
    setPaymentMethod(method);

    if (!isCheckoutUpgrade) {
      checkoutPasswordRef.current = password;
    }

    setLoading(true);
    const body = withMarketingAttribution({
      plan_id: plan.id,
      billing_interval: billingInterval,
      payment_method: method,
      ...(isCustom ? { users_count: usersCount } : {}),
      ...(!isCheckoutUpgrade
        ? {
            company_name: company.company_name.trim(),
            email: company.email.trim(),
            responsible_name: company.responsible_name.trim(),
            cpf_cnpj: docDigits,
            password,
            whatsapp: adminWhatsapp.trim(),
            ...(company.phone?.trim() ? { phone: company.phone.trim() } : {}),
          }
        : {
            ...(company.company_name?.trim() ? { company_name: company.company_name.trim() } : {}),
            ...(company.email?.trim() ? { email: company.email.trim() } : {}),
            ...(company.responsible_name?.trim() ? { responsible_name: company.responsible_name.trim() } : {}),
            ...(docDigits ? { cpf_cnpj: docDigits } : {}),
            ...(company.phone?.trim() ? { phone: company.phone.trim() } : {}),
          }),
    });

    const res = await apiClient.post<PurchaseResult>('/api/plan-purchase', body);
    setLoading(false);
    if (res.error) {
      toastFromPlanPurchaseCode(res.code, res.error);
      if (res.field === 'cpf_cnpj') {
        setCpfCnpjError(res.error);
        setStep(4);
      }
      if (res.code === 'EMAIL_ALREADY_REGISTERED_USE_LOGIN' || res.code === 'WHATSAPP_ALREADY_REGISTERED_USE_LOGIN') {
        setStep(2);
      }
      return;
    }
    if (res.data) {
      setResult(res.data);
      toast.success('Pagamento preparado. Siga as instruções abaixo.');
    }
  };

  const handlePlanPayWithCard = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!result?.billing_id || payingPlanCard) return;
      if (!result.inline_pay_token && !user?.tenant_id) {
        toast.error('Atualize a página e gere a cobrança novamente para liberar o pagamento com cartão.');
        return;
      }
      if (seatAddonFlowActive) {
        const ok = await ensureFreshSeatAddonPreviewBeforePay();
        if (!ok) return;
      }
      setPayingPlanCard(true);
      try {
        const idempotency_key = crypto.randomUUID();
        const body: Record<string, unknown> = {
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
        if (result.inline_pay_token) {
          body.inline_pay_token = result.inline_pay_token;
        }
        const runFinalizeAfterPaid = async () => {
          if (paymentFinalizeStartedRef.current) return;
          paymentFinalizeStartedRef.current = true;
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          pollingRef.current = null;
          timeoutRef.current = null;
          await flushCheckoutSessionAfterPaid();
          persistCheckout(null);
          if (checkoutPasswordRef.current) {
            const email = company.email.trim();
            const pwd = checkoutPasswordRef.current;
            const path = await signIn(email, pwd);
            if (path !== '/login') {
              navigateToSignupSuccess(navigate, '/dashboard');
              return;
            }
            toast.error('Pagamento confirmado, mas o login automático falhou. Acesse com seu e-mail e senha.');
            navigate('/login', { replace: true });
            return;
          }
          setPaymentConfirmed(true);
        };

        const res = await apiClient.post<{
          ok?: boolean;
          billing_status?: string;
          error?: string;
          code?: string;
        }>(`/api/billing/${result.billing_id}/pay-with-card`, body);

        if (res.error) {
          for (let i = 0; i < 4; i++) {
            if (i > 0) await new Promise((r) => setTimeout(r, 1200));
            const st = await apiClient.get<BillingStatusResponse>(
              `/api/billing/${result.billing_id}/status`
            );
            if (st.data?.status === 'paid') {
              toast.success('Pagamento confirmado!');
              await runFinalizeAfterPaid();
              return;
            }
          }
          toast.error(res.error);
          return;
        }

        if (res.data?.ok && res.data.billing_status === 'paid') {
          toast.success('Pagamento confirmado!');
          await runFinalizeAfterPaid();
          return;
        }
        if (res.data?.ok) {
          toast.success('Pagamento enviado. Aguardando confirmação…');
          const st = await apiClient.get<BillingStatusResponse>(`/api/billing/${result.billing_id}/status`);
          if (st.data?.status === 'paid') {
            toast.success('Pagamento confirmado!');
            await runFinalizeAfterPaid();
          }
        }
      } finally {
        setPayingPlanCard(false);
      }
    },
    [
      result,
      payingPlanCard,
      user?.tenant_id,
      planCardForm,
      signIn,
      navigate,
      company.email,
      flushCheckoutSessionAfterPaid,
      seatAddonFlowActive,
      ensureFreshSeatAddonPreviewBeforePay,
    ]
  );

  const visibleSteps = useMemo(() => {
    if (seatAddonBillingContextActive) {
      return SEAT_ADDON_STEP_DEFS;
    }
    return STEP_DEFS.filter((s) => {
      if ((isResumeMode || (isRenewMode && resumePaymentOnly)) && s.id < 4) return false;
      if (s.id === 1 && skipPlanStep) return false;
      return true;
    });
  }, [seatAddonBillingContextActive, isResumeMode, isRenewMode, resumePaymentOnly, skipPlanStep]);

  const displayStepIndex = (s: number) => {
    if (seatAddonBillingContextActive) {
      if (s === 3) return 0;
      if (s === 4) return 1;
      return 0;
    }
    if (isResumeMode || isRenewMode || resumePaymentOnly) {
      if (s <= 3) return 0;
      return s - 1;
    }
    if (!skipPlanStep) return s;
    return s <= 1 ? 1 : s - 1;
  };

  const renderPlanPicker = () => {
    const hasSelection = !!plan;
    const planCount = plansCatalog.length;

    const selectPlanFromRow = (p: PublicPlanRow) => {
      setPlan(mapPublicPlanRowToCheckout(p));
      setBillingInterval('monthly');
      setUsersCount(1);
    };

    return (
    <div className="space-y-6">
      {/* Linha de cards: selecionado expande (~77–80%); demais recolhem no desktop */}
      <div>
        {plansLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : plansCatalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum plano disponível no momento.</p>
        ) : (
          <div
            className={cn(
              'flex w-full flex-col gap-3',
              planCount > 1 && 'lg:flex-row lg:items-stretch lg:gap-2'
            )}
          >
            {plansCatalog.map((p) => {
              const selected = plan?.id === p.id;
              const collapsed = hasSelection && !selected;
              const trialBadge = freeAccessDaysBadge(p.is_free, p.free_access_days);
              const previewCents = getCheckoutListPriceCents(p, { usersCount: 1, billingInterval: 'monthly' });
              const periodShort = p.plan_type === 'custom' ? 'mês' : p.billing_interval === 'yearly' ? 'ano' : 'mês';
              const selectable = !selected;

              const rowTrial = selected && plan ? freeAccessDaysBadge(plan.is_free, plan.free_access_days) : null;

              return (
                <div
                  key={p.id}
                  role={selectable ? 'button' : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (!selectable) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectPlanFromRow(p);
                    }
                  }}
                  onClick={() => {
                    if (!selected) selectPlanFromRow(p);
                  }}
                  className={cn(
                    'min-w-0 rounded-xl border-2 text-left transition-all duration-300 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    selected
                      ? 'border-primary bg-primary/[0.07] shadow-md ring-2 ring-primary/20 lg:z-[1]'
                      : 'cursor-pointer border-border bg-card hover:border-primary/45',
                    collapsed &&
                      'lg:max-w-[min(24%,13.5rem)] lg:shrink-0 lg:basis-[min(24%,13.5rem)] lg:opacity-[0.88] hover:opacity-100',
                    !hasSelection && planCount === 1 && 'mx-auto w-full max-w-xl',
                    !hasSelection && planCount === 2 && 'w-full lg:flex-1',
                    !hasSelection && planCount >= 3 && 'w-full lg:min-w-[12rem] lg:flex-1',
                    hasSelection && selected && 'w-full lg:min-w-0 lg:max-w-[80%] lg:flex-[1_1_77%]',
                    hasSelection && selected && planCount > 1 && 'order-first lg:order-none'
                  )}
                >
                  {collapsed ? (
                    <div className="flex flex-col gap-1.5 p-4 sm:p-4 lg:px-3 lg:py-3">
                      <div className="font-semibold text-foreground lg:text-sm lg:leading-snug">{p.name}</div>
                      {trialBadge && (
                        <span className="w-fit rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary lg:hidden">
                          {trialBadge}
                        </span>
                      )}
                      <div className="text-base font-bold tabular-nums text-primary lg:text-sm">
                        {formatVitrinePriceLabel(previewCents)}
                        <span className="font-normal text-muted-foreground">/{periodShort}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground lg:hidden">Toque para selecionar</p>
                    </div>
                  ) : selected && plan ? (
                    <div className="space-y-4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold leading-tight text-foreground">{plan.name}</h3>
                          {plan.description && (
                            <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
                          )}
                        </div>
                        {rowTrial ? (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                            {rowTrial}
                          </span>
                        ) : null}
                      </div>

                      <div>
                        <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">Preço</p>
                        <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-3xl">
                          {formatVitrinePriceLabel(getCheckoutListPriceCents(plan, { usersCount, billingInterval }))}
                          <span className="text-lg font-semibold text-muted-foreground sm:text-xl"> /{periodLabel}</span>
                        </p>
                      </div>

                      <div className="grid gap-4 border-t border-border/60 pt-4 sm:grid-cols-2 sm:gap-6">
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">Período de cobrança</p>
                          {hasIntervalSelector ? (
                            <div className="flex max-w-[17rem] items-center gap-1">
                              <button
                                type="button"
                                aria-label="Intervalo anterior"
                                onClick={() => {
                                  const prev = BILLING_INTERVALS[Math.max(0, intervalIdx - 1)];
                                  if (prev) setBillingInterval(prev.key);
                                }}
                                disabled={!canPrevInterval}
                                className="rounded-md border border-border bg-muted/40 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <span className="min-w-[7rem] flex-1 text-center text-sm font-semibold">{intervalLabel}</span>
                              <button
                                type="button"
                                aria-label="Próximo intervalo"
                                onClick={() => {
                                  const next = BILLING_INTERVALS[Math.min(BILLING_INTERVALS.length - 1, intervalIdx + 1)];
                                  if (next) setBillingInterval(next.key);
                                }}
                                disabled={!canNextInterval}
                                className="rounded-md border border-border bg-muted/40 p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm font-medium text-foreground">{intervalLabel}</p>
                          )}
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">Quantidade de usuários</p>
                          {isCustom ? (
                            <div className="flex w-fit items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
                              <button
                                type="button"
                                aria-label="Menos um usuário"
                                onClick={() => setUsersCount((c) => Math.max(1, c - 1))}
                                disabled={usersCount <= 1}
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-[2.25rem] text-center text-sm font-semibold tabular-nums">{usersCount}</span>
                              <button
                                type="button"
                                aria-label="Mais um usuário"
                                onClick={() => setUsersCount((c) => c + 1)}
                                className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm font-medium text-muted-foreground">Definido pelo plano</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="min-h-[8.5rem] p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="font-semibold text-foreground">{p.name}</div>
                        {trialBadge && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {trialBadge}
                          </span>
                        )}
                      </div>
                      {p.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{p.description}</p>}
                      <p className="mt-3 font-display text-xl font-bold text-primary">
                        {formatVitrinePriceLabel(previewCents)}
                        <span className="text-sm font-normal text-muted-foreground"> /{periodShort}</span>
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Abaixo da linha: somente benefícios */}
      {plan && (
        <div className="rounded-lg border border-border bg-muted/15 px-4 py-4 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">O que este plano inclui</p>
          {Array.isArray(plan.benefits) && plan.benefits.length > 0 ? (
            (() => {
              const columns = chunkPlanBenefits(plan.benefits, BENEFITS_PER_COLUMN);
              return (
                <div
                  className={cn(
                    'grid gap-x-8 gap-y-4',
                    'grid-cols-1',
                    columns.length >= 2 && 'md:grid-cols-2',
                    columns.length === 2 && 'lg:grid-cols-2',
                    columns.length >= 3 && 'lg:grid-cols-3'
                  )}
                >
                  {columns.map((col, colIdx) => (
                    <ul key={colIdx} className="m-0 list-none space-y-2.5 p-0">
                      {col.map((b, i) => {
                        const IconC = b.icon ? BENEFIT_ICON_MAP[b.icon] ?? Check : Check;
                        return (
                          <li key={`${colIdx}-${i}`} className="flex items-start gap-2.5 text-sm text-foreground">
                            <IconC className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span className="leading-snug">{b.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ))}
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum benefício listado para este plano. Os detalhes seguem no contrato e no pós-contratação.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border/50 pt-4">
        <Button type="button" variant="outline" onClick={handleBack} disabled={plansLoading}>
          Voltar
        </Button>
        <Button type="button" onClick={() => void handleNext()} disabled={!plan || plansLoading}>
          Continuar
        </Button>
      </div>
    </div>
    );
  };

  const renderCompanyStep = () => {
    if (authLoading) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground text-sm">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span>Verificando sessão…</span>
        </div>
      );
    }

    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await handleNext();
        }}
        className="space-y-6"
      >
        {isCheckoutUpgrade ? (
          <div>
            <Label htmlFor="phone">Telefone (opcional)</Label>
            <Input
              id="phone"
              value={company.phone}
              onChange={(e) => setCompany((c) => ({ ...c, phone: formatPhoneBrDigits(e.target.value) }))}
              placeholder="(11) 99999-9999"
              inputMode="tel"
            />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="space-y-4 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empresa</p>
              <div>
                <Label htmlFor="company_name">Nome da empresa *</Label>
                <Input
                  id="company_name"
                  value={company.company_name}
                  onChange={(e) => setCompany((c) => ({ ...c, company_name: e.target.value }))}
                  placeholder="Razão social ou nome fantasia"
                  required
                  autoComplete="organization"
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
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <Label htmlFor="admin_whatsapp">WhatsApp *</Label>
                <Input
                  id="admin_whatsapp"
                  value={adminWhatsapp}
                  onChange={(e) => setAdminWhatsapp(formatPhoneBrDigits(e.target.value))}
                  placeholder="(11) 99999-9999"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  DDD + número; unicidade na plataforma (normalizado no envio).
                </p>
              </div>
            </div>
            <div className="space-y-4 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Administrador</p>
              <div>
                <Label htmlFor="responsible_name">Nome do administrador *</Label>
                <Input
                  id="responsible_name"
                  value={company.responsible_name}
                  onChange={(e) => setCompany((c) => ({ ...c, responsible_name: e.target.value }))}
                  placeholder="Nome completo"
                  required
                  autoComplete="name"
                />
              </div>
              <p className="text-xs font-medium text-muted-foreground pt-1">Senha de acesso ao painel</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <Label htmlFor="password">Senha *</Label>
                  <Input
                    id="password"
                    type="password"
                    name="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="border-input"
                  />
                </div>
                <div>
                  <Label htmlFor="password_confirm">Confirmar senha *</Label>
                  <Input
                    id="password_confirm"
                    type="password"
                    name="confirm-new-password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="border-input"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={handleBack} disabled={identityCheckLoading}>
              Voltar
            </Button>
          )}
          <Button type="submit" disabled={identityCheckLoading}>
            {identityCheckLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando…
              </>
            ) : (
              'Continuar'
            )}
          </Button>
        </div>
      </form>
    );
  };

  const seatAddonIntervalLabel =
    seatAddonQuote &&
    (BILLING_INTERVALS.find((i) => i.key === seatAddonQuote.billing_interval)?.label ??
      seatAddonQuote.billing_interval);

  const renderSummary = () => {
    if (seatAddonBillingContextActive) {
      if (seatAddonQuote) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Você está adicionando assentos à sua conta ativa. O valor de hoje é proporcional aos dias restantes do
            ciclo; na renovação passa a valer o novo total.
          </p>
          <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-medium text-right">{plan?.name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Assentos hoje</span>
              <span className="font-medium">{seatAddonQuote.current_contracted}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Novos assentos</span>
              <span className="font-medium">+{seatAddonQuote.additional_seats}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total após pagamento</span>
              <span className="font-semibold">{seatAddonQuote.new_total} assentos</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Valor por usuário ({seatAddonIntervalLabel})</span>
              <span className="font-medium">{formatPrice(seatAddonQuote.price_per_user_full_period_cents)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Dias restantes no ciclo</span>
              <span className="font-medium">{seatAddonQuote.remaining_period_days}</span>
            </div>
            <div className="flex justify-between gap-2 border-t pt-2 mt-2">
              <span className="text-muted-foreground">A pagar agora (pró-rata)</span>
              <span className="font-semibold text-lg">{formatPrice(seatAddonQuote.amount_cents_now)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Novo valor por período (próximos ciclos)</span>
              <span className="font-medium">{formatPrice(seatAddonQuote.new_recurring_period_cents)}</span>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Ciclo de referência: {seatAddonQuote.period_start} → {seatAddonQuote.period_end}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => navigate('/meu-plano', { replace: true })}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={seatAddonPayPrimingLoading}
              onClick={() => void handleSeatAddonGoToPayment()}
            >
              {seatAddonPayPrimingLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando valores…
                </>
              ) : (
                'Ir para pagamento'
              )}
            </Button>
          </div>
        </div>
      );
      }
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pagamento de <strong>assentos adicionais</strong> na sua conta. Na próxima etapa você escolhe PIX, boleto ou
            cartão.
          </p>
          {result ? (
            <p className="text-sm font-medium">
              Valor desta cobrança: {formatPrice(result.amount_cents)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando dados da cobrança…
            </p>
          )}
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => navigate('/meu-plano', { replace: true })}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!result || seatAddonPayPrimingLoading}
              onClick={() => void handleSeatAddonGoToPayment()}
            >
              {seatAddonPayPrimingLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando valores…
                </>
              ) : (
                'Ir para pagamento'
              )}
            </Button>
          </div>
        </div>
      );
    }

    return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground shrink-0">Plano</dt>
            <dd className="font-medium text-right">{plan?.name}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground shrink-0">Intervalo</dt>
            <dd className="font-medium text-right">{intervalLabel}</dd>
          </div>
          {isCustom && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">Usuários</dt>
              <dd className="font-medium text-right">{usersCount}</dd>
            </div>
          )}
        </dl>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground shrink-0">Empresa</dt>
            <dd className="font-medium text-right truncate max-w-[60%]" title={company.company_name}>
              {company.company_name || '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground shrink-0">Administrador</dt>
            <dd className="font-medium text-right truncate max-w-[60%]" title={company.responsible_name}>
              {company.responsible_name || '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground shrink-0">E-mail</dt>
            <dd className="font-medium text-right break-all max-w-[65%]">{company.email || '—'}</dd>
          </div>
          {!isCheckoutUpgrade && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground shrink-0">WhatsApp</dt>
              <dd className="font-medium text-right">{adminWhatsapp || '—'}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="flex justify-between text-base font-semibold pt-3 border-t">
        <span>Valor total</span>
        <span>{formatPrice(amountCents)}</span>
      </div>
      {showTrialOnSummary && plan && (
        <div className="rounded-2xl border-2 border-primary/45 bg-gradient-to-b from-primary/[0.14] via-primary/[0.06] to-transparent p-4 shadow-[0_10px_50px_-15px_hsl(var(--primary)/0.45)] sm:p-5">
          <p className="mb-4 text-center text-sm leading-relaxed text-muted-foreground">
            Período de avaliação de{' '}
            <strong className="text-foreground">{effectiveCheckoutTrialDays(plan)} dias</strong> sem cobrança agora.
            Quando o período terminar, você poderá concluir o pagamento pelo painel.
          </p>
          <Button
            type="button"
            size="lg"
            disabled={loading}
            onClick={() => void handleStartTrial()}
            className={cn(
              'h-14 w-full text-base font-bold shadow-xl transition-all sm:h-16 sm:text-lg',
              'bg-gradient-to-r from-primary to-[hsl(220_88%_48%)] text-primary-foreground hover:opacity-[0.96]',
              'hover:shadow-2xl hover:shadow-primary/25 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Abrindo trial…
              </>
            ) : (
              <>
                <Gift className="mr-2 h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
                Testar {effectiveCheckoutTrialDays(plan)} dias grátis
              </>
            )}
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">Sem cobrança neste passo · você escolhe quando pagar</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 justify-between sm:justify-end">
        <Button variant="outline" onClick={handleBack}>
          Voltar
        </Button>
        <div className="flex flex-wrap gap-2">
          {showTrialOnSummary ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                blockAutoHydrateRef.current = false;
                setStep(4);
              }}
            >
              Pagar agora (opcional)
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                blockAutoHydrateRef.current = false;
                setStep(4);
              }}
            >
              Ir para pagamento
            </Button>
          )}
        </div>
      </div>
    </div>
    );
  };

  const renderPayment = () => {
    const payTrialBadge = plan ? freeAccessDaysBadge(plan.is_free, plan.free_access_days) : null;
    const billingDocDigits = billingCpf.replace(/\D/g, '');
    const resumeBillingDocLocked =
      (resumePaymentOnly || seatAddonBillingContextActive) &&
      !resumeBillingDocUnlocked &&
      billingDocDigits.length > 0 &&
      isValidCpfOrCnpj(billingDocDigits);
    const methodLocked = loading || paymentConfirmed;
    const displayPm = effectivePaymentDisplayMethod(result, paymentMethod);
    const canGenerate =
      !hasChargeReady &&
      !paymentConfirmed &&
      (paymentMethod !== 'PIX' || isValidCpfOrCnpj(billingDocDigits));
    return (
      <div className="space-y-4">
        {plan && (
          <div className="rounded-lg border bg-muted/25 px-4 py-3 text-sm space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {seatAddonBillingContextActive ? 'Assentos adicionais' : plan.name}
              </p>
              {!seatAddonBillingContextActive && payTrialBadge && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {payTrialBadge}
                </span>
              )}
            </div>
            <p className="text-muted-foreground">
              {seatAddonBillingContextActive ? (
                seatAddonPayNowCents != null ? (
                  <>
                    <span className="font-medium text-foreground">{formatPrice(seatAddonPayNowCents)}</span>
                    <span className="text-muted-foreground/80"> — a pagar agora (pró-rata dos assentos extras)</span>
                    {seatAddonQuote ? (
                      <span className="block mt-1 text-xs text-muted-foreground">
                        A partir da próxima renovação ({seatAddonIntervalLabel ?? 'período'}):{' '}
                        <span className="font-medium text-foreground">
                          {formatPrice(seatAddonQuote.new_recurring_period_cents)}
                        </span>{' '}
                        com {seatAddonQuote.new_total} assentos contratados
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-sm">Carregando valor proporcional…</span>
                )
              ) : (
                <>
                  {formatPrice(amountCents)} <span className="text-muted-foreground/80">/ {periodLabel}</span>
                  {isCustom && (
                    <>
                      {' · '}
                      {intervalLabel}
                      {usersCount > 0 && ` · ${usersCount} usuário${usersCount !== 1 ? 's' : ''}`}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        )}
        {!seatAddonBillingContextActive && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Empresa: </span>
            <span className="font-medium">{company.company_name || '—'}</span>
          </div>
        )}
        {seatAddonBillingContextActive && (company.company_name?.trim() || company.email?.trim()) && (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-1">
            {company.company_name?.trim() ? (
              <p className="mb-0">
                <span className="text-muted-foreground">Conta: </span>
                <span className="font-medium">{company.company_name}</span>
              </p>
            ) : null}
            {company.email?.trim() ? (
              <p className="mb-0">
                <span className="text-muted-foreground">E-mail: </span>
                <span className="font-medium">{company.email}</span>
              </p>
            ) : null}
          </div>
        )}

        {!paymentConfirmed && (
          <div>
            <Label className="text-sm font-medium">Forma de pagamento</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              {seatAddonBillingContextActive
                ? hasChargeReady
                  ? 'Troque o método se precisar; o valor continua sendo só o proporcional desta cobrança de assentos.'
                  : 'Escolha o método para ver os dados de pagamento.'
                : hasChargeReady
                  ? 'Troque o método se precisar; geramos ou reutilizamos a cobrança compatível com o mesmo contexto.'
                  : 'Escolha o método e clique em Gerar cobrança para ver os dados de pagamento na própria tela.'}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PAYMENT_METHODS.map((pm) => {
                const Icon = pm.icon;
                const isSelected = paymentMethod === pm.value;
                const busy = loading && hasChargeReady && isSelected;
                return (
                  <button
                    key={pm.value}
                    type="button"
                    disabled={methodLocked}
                    onClick={() =>
                      hasChargeReady ? void runPlanPayment(pm.value) : setPaymentMethod(pm.value)
                    }
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 sm:p-4 text-left transition-colors disabled:opacity-60 ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className={`rounded-full p-2 ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                      {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" />}
                    </div>
                    <span className="text-sm font-semibold">{pm.label}</span>
                    <span className="text-center text-[11px] leading-tight text-muted-foreground">{pm.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card p-4 space-y-4">
          {!paymentConfirmed && !hasChargeReady && (
            <div>
              <Label htmlFor="billing_cpf_cnpj">
                CPF ou CNPJ
                {paymentMethod === 'PIX' ? ' *' : ''}
              </Label>
              {resumeBillingDocLocked && (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {seatAddonBillingContextActive
                    ? 'CPF/CNPJ já cadastrado na sua conta. Use "Alterar documento" só se precisar corrigir.'
                    : 'Documento já cadastrado na conta. Use "Alterar documento" só se precisar corrigir.'}
                </p>
              )}
              <Input
                id="billing_cpf_cnpj"
                value={billingCpf}
                readOnly={resumeBillingDocLocked}
                onChange={(e) => {
                  if (resumeBillingDocLocked) return;
                  setCpfCnpjError('');
                  setBillingCpf(formatCpfCnpjDigits(e.target.value));
                }}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                autoComplete="off"
                inputMode="numeric"
                aria-invalid={!!cpfCnpjError}
                className={
                  cpfCnpjError ? 'border-destructive' : resumeBillingDocLocked ? 'bg-muted/50 text-muted-foreground' : undefined
                }
              />
              {resumeBillingDocLocked && (
                <Button
                  type="button"
                  variant="link"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => setResumeBillingDocUnlocked(true)}
                >
                  Alterar documento
                </Button>
              )}
              {cpfCnpjError ? (
                <p className="mt-1.5 text-sm text-destructive" role="alert">
                  {cpfCnpjError}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Obrigatório para PIX; pode ser exigido pelo provedor nos demais métodos.
                </p>
              )}
            </div>
          )}

          {!paymentConfirmed && !hasChargeReady && (
            <Button
              type="button"
              className="w-full"
              disabled={!canGenerate || loading}
              onClick={() => void runPlanPayment(paymentMethod)}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando cobrança…
                </>
              ) : (
                'Gerar cobrança'
              )}
            </Button>
          )}

          {loading && result && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Atualizando dados de pagamento…
            </p>
          )}

          {paymentConfirmed && plan && (
            <div className="py-6 flex flex-col items-center justify-center gap-4 text-center">
              <div className="rounded-full bg-green-500/20 p-4">
                <Check className="h-12 w-12 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">Pagamento confirmado!</p>
                <p className="text-sm text-muted-foreground mt-1">Abrindo o painel…</p>
              </div>
            </div>
          )}

          {!paymentConfirmed &&
            result &&
            plan &&
            displayPm === 'PIX' &&
            hasRenderablePayloadForMethod(result, 'PIX') && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">
                  {seatAddonBillingContextActive ? 'Assentos adicionais' : plan.name}
                </span>
                <span className="text-muted-foreground">
                  {seatAddonBillingContextActive ? (
                    <>{formatPrice(result.amount_cents)} — proporcional neste ciclo</>
                  ) : (
                    <>
                      {formatPrice(result.amount_cents)} / {periodLabel}
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                <span className="text-lg" aria-hidden>
                  🟡
                </span>
                <span className="font-medium">Aguardando confirmação do pagamento...</span>
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
                    <Input readOnly value={result.pix_copy_paste} className="font-mono text-xs" />
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
                Após o pagamento seu acesso será liberado automaticamente.
              </p>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => (isCheckoutUpgrade ? navigate('/meu-plano') : navigate('/landing'))}
              >
                Concluir depois
              </Button>
            </div>
          )}

          {!paymentConfirmed &&
            result &&
            plan &&
            displayPm === 'BOLETO' &&
            hasRenderablePayloadForMethod(result, 'BOLETO') && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {seatAddonBillingContextActive ? (
                  <>
                    Assentos adicionais — <strong>{formatPrice(result.amount_cents)}</strong> proporcional neste ciclo
                    <span className="block text-xs mt-1">Fatura {result.invoice_number ?? result.billing_id}</span>
                  </>
                ) : (
                  <>
                    Fatura <strong>{result.invoice_number ?? result.billing_id}</strong> —{' '}
                    {formatPrice(result.amount_cents)}
                  </>
                )}
              </p>
              <p className="text-sm font-medium">Aguardando pagamento do boleto</p>
              {result.bank_slip_digitable_line?.trim() && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Linha digitável</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={result.bank_slip_digitable_line} className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => copyToClipboard(result.bank_slip_digitable_line!)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {result.bank_slip_url && (
                  <Button variant="outline" size="sm" className="gap-2" asChild>
                    <a href={result.bank_slip_url} target="_blank" rel="noopener noreferrer">
                      PDF do boleto
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                {result.invoice_url && (
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" asChild>
                    <a href={result.invoice_url} target="_blank" rel="noopener noreferrer">
                      Abrir fatura no site do pagamento
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
              <Button className="w-full" onClick={() => (isCheckoutUpgrade ? navigate('/meu-plano') : navigate('/landing'))}>
                Concluir
              </Button>
            </div>
          )}

          {!paymentConfirmed &&
            result &&
            plan &&
            displayPm === 'CREDIT_CARD' &&
            hasRenderablePayloadForMethod(result, 'CREDIT_CARD') && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {seatAddonBillingContextActive ? (
                  <>
                    Assentos adicionais — <strong>{formatPrice(result.amount_cents)}</strong> proporcional neste ciclo
                    <span className="block text-xs mt-1">Fatura {result.invoice_number ?? result.billing_id}</span>
                  </>
                ) : (
                  <>
                    Fatura <strong>{result.invoice_number ?? result.billing_id}</strong> —{' '}
                    {formatPrice(result.amount_cents)}
                  </>
                )}
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                <span className="text-lg" aria-hidden>
                  🟡
                </span>
                <span className="font-medium">Preencha os dados do cartão abaixo (mesmo fluxo seguro das faturas).</span>
              </div>
              <InlineCreditCardPaymentForm
                fieldIdPrefix="plan_checkout_"
                form={planCardForm}
                setForm={setPlanCardForm}
                onSubmit={handlePlanPayWithCard}
                paying={payingPlanCard}
                emphasizeSubmit
                showHostedCheckoutFallback={false}
              />
            </div>
          )}
        </div>

        <p className="text-base font-semibold">
          {formatPrice(
            seatAddonBillingContextActive
              ? (seatAddonPayNowCents ?? result?.amount_cents ?? 0)
              : (result?.amount_cents ?? (seatAddonQuote?.amount_cents_now ?? amountCents))
          )}
        </p>
        <div className="flex gap-2 justify-end">
          {seatAddonBillingContextActive && !paymentConfirmed ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/meu-plano', { replace: true })}
              disabled={loading}
            >
              Cancelar — Meu plano
            </Button>
          ) : (
            <Button variant="outline" onClick={handleBack} disabled={loading}>
              Voltar
            </Button>
          )}
        </div>
      </div>
    );
  };

  const currentStepTitle =
    step === 4 && paymentConfirmed
      ? 'Pagamento confirmado'
      : seatAddonBillingContextActive && step === 3
        ? 'Resumo — assentos adicionais'
        : STEP_DEFS[step - 1]?.title ?? '';
  const checkoutDisplayPm = effectivePaymentDisplayMethod(result, paymentMethod);
  const currentStepDesc =
    step === 1
      ? 'Compare os planos e selecione um. Ajuste intervalo e usuários (se aplicável) antes de continuar.'
      : step === 2
      ? 'Dados da empresa e do administrador.'
      : step === 3
        ? seatAddonBillingContextActive
          ? 'Confira os valores da contratação incremental antes de pagar.'
          : 'Confira antes de pagar.'
        : step === 4
          ? paymentConfirmed
            ? 'Pagamento confirmado.'
            : result && checkoutDisplayPm === 'PIX' && (result.pix_qr_code || result.pix_copy_paste)
              ? 'Aguardando confirmação do PIX.'
              : 'Escolha o método e conclua o pagamento abaixo.'
          : '';

  /** Bloqueia passos 1–3 até sessão + checkout-context concluírem (evita disputa com fluxo normal). */
  const showResumeBlockingLoader =
    (isResumeMode || isRenewMode) &&
    !resumeContextError &&
    (authLoading || resumeContextLoading || !resumePaymentOnly);

  const hubContextError = resumeContextError && (isResumeMode || isRenewMode);

  return (
    <LandingLayout>
      <div className="py-6 bg-muted/30">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="mb-6 text-center sm:text-left">
            <h1 className="text-2xl font-bold">
              {isResumeMode
                ? 'Retomada — conclua o pagamento'
                : isRenewMode
                  ? 'Renovação — conclua o pagamento'
                  : seatAddonBillingContextActive
                    ? 'Checkout — assentos adicionais'
                    : plan
                      ? `Checkout — ${plan.name}`
                      : 'Checkout — escolha seu plano'}
            </h1>
            {step === 1 && !isResumeMode && !isRenewMode && (
              <p className="text-sm text-muted-foreground mt-1">Contratação em etapas: plano, dados e pagamento.</p>
            )}
          </div>

          <div className="mx-auto w-full max-w-5xl">
            {!showResumeBlockingLoader && !hubContextError && (
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-4">
              {visibleSteps.map((s, i) => {
                const Icon = s.icon;
                const logical = displayStepIndex(s.id);
                const active = displayStepIndex(step) === logical;
                const done = displayStepIndex(step) > logical;
                return (
                  <span key={s.id} className="inline-flex items-center gap-2">
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs sm:text-sm ${
                        active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="hidden sm:inline">{s.title}</span>
                    </div>
                    {i < visibleSteps.length - 1 && <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />}
                  </span>
                );
              })}
            </div>
            )}

            <Card className="shadow-sm">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="text-lg">
                  {showResumeBlockingLoader
                    ? 'Preparando pagamento'
                    : hubContextError
                      ? isRenewMode
                        ? 'Renovação indisponível'
                        : 'Retomada indisponível'
                      : currentStepTitle}
                </CardTitle>
                <CardDescription className="text-sm">
                  {showResumeBlockingLoader
                    ? 'Carregando dados da sua conta para gerar a cobrança.'
                    : hubContextError
                      ? 'Tente novamente mais tarde ou use outro caminho no painel.'
                      : currentStepDesc}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {showResumeBlockingLoader ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
                    <Loader2 className="h-10 w-10 animate-spin" />
                    <p className="text-sm">
                      {authLoading ? 'Verificando sessão…' : 'Carregando dados da sua conta…'}
                    </p>
                  </div>
                ) : hubContextError ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-12 px-4 text-center">
                    <p className="text-sm text-destructive max-w-md">{resumeContextError}</p>
                    <p className="text-xs text-muted-foreground max-w-md">
                      Não foi possível continuar o pagamento com os dados atuais. Volte ao hub comercial ou entre em
                      contato com o suporte.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button type="button" variant="default" onClick={() => navigate('/meu-plano')}>
                        Voltar ao Meu plano
                      </Button>
                      {!isRenewMode ? (
                        <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
                          Ir ao painel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    {step === 1 && renderPlanPicker()}
                    {step === 2 && renderCompanyStep()}
                    {step === 3 && renderSummary()}
                    {step === 4 && renderPayment()}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </LandingLayout>
  );
}

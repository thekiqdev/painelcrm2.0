import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/integrations/api/client';
import { formatDateYmdOrInstantPtBr } from '@/lib/formatInvoiceDates';
import { toast } from '@/components/ui/sonner';
import { PixAutomaticConsentSwitch } from '@/components/billing/PixAutomaticConsentSwitch';
import {
  enableMyPixAutomatic,
  disableMyPixAutomatic,
  type PixAutomaticPreference,
} from '@/services/tenantPixAutomatic';
import {
  Check,
  ArrowRight,
  CreditCard,
  Calendar,
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
  Building2,
  AlertCircle,
  Sparkles,
  LayoutGrid,
  Banknote,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { COMMERCIAL_402_REDIRECT_FLAG } from '@/lib/commercialAccessPaths';

const checkoutResumeEnabled = import.meta.env.VITE_CHECKOUT_RESUME_V1 === 'true';

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
  LayoutGrid,
  Banknote,
};

/** Preço de referência no catálogo (comparação e rotulagem). */
function catalogListPriceCents(p: Plan, intervalKey: string, seats: number): number {
  if (p.plan_type === 'custom' && p.interval_prices && p.interval_prices.length) {
    const row =
      p.interval_prices.find((r) => r.billing_interval === intervalKey) ?? p.interval_prices[0];
    return row.price_per_user_cents * Math.max(1, seats);
  }
  return p.price_cents;
}

const INTERVALS = [
  { key: 'monthly', label: 'Mensal' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'semi_annual', label: 'Semestral' },
  { key: 'yearly', label: 'Anual' },
] as const;

interface PlanBenefit {
  icon?: string;
  label: string;
}

interface IntervalPrice {
  billing_interval: string;
  price_per_user_cents: number;
  price_per_instance_cents?: number | null;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  billing_interval: string;
  plan_type: 'standard' | 'custom';
  max_users?: number | null;
  max_whatsapp_instances?: number | null;
  is_free?: boolean;
  free_access_days?: number | null;
  benefits?: PlanBenefit[];
  interval_prices?: IntervalPrice[];
}

interface PendingBillingSummary {
  billing_id: string;
  status: string;
  amount_cents: number;
  due_date: string | null;
  payment_method: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
  gateway: string | null;
  invoice_number: string | null;
  has_gateway_reference: boolean;
  is_activated_billing: boolean;
}

interface PendingSeatAddonBilling {
  billing_id: string;
  status: string;
  amount_cents: number;
  due_date: string | null;
  payment_method: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | null;
  gateway: string | null;
  invoice_number: string | null;
  has_gateway_reference: boolean;
}

interface SeatAddonPreviewResponse {
  current_contracted: number;
  new_total: number;
  billing_interval: string;
  breakdown: {
    formula: string;
    period_start: string;
    period_end: string;
    today: string;
    remaining_window_start: string;
    total_period_days: number;
    remaining_period_days: number;
    price_per_user_full_period_cents: number;
    additional_seats: number;
    amount_cents: number;
  };
}

interface InstanceAddonPreviewResponse {
  current_contracted: number;
  new_total: number;
  billing_interval: string;
  breakdown: {
    formula: string;
    period_start: string;
    period_end: string;
    today: string;
    remaining_window_start: string;
    total_period_days: number;
    remaining_period_days: number;
    price_per_instance_full_period_cents: number;
    additional_instances: number;
    amount_cents: number;
  };
}

interface MyPlanResponse {
  tenant_id: string;
  plan: Plan;
  trial_ends_at: string | null;
  max_users_override: number | null;
  max_whatsapp_instances_override: number | null;
  tenant_status?: string;
  plan_period_start?: string | null;
  plan_period_end?: string | null;
  suspension_reason?: string | null;
  activated_billing_id?: string | null;
  pending_billing?: PendingBillingSummary | null;
  max_users_scheduled_next_cycle?: number | null;
  max_whatsapp_instances_scheduled_next_cycle?: number | null;
  pending_seat_addon_billing?: PendingSeatAddonBilling | null;
  pending_instance_addon_billing?: PendingSeatAddonBilling | null;
}

/** Resposta de GET /api/me/tenant/subscription (Fase C hub comercial). */
interface SaasSubscriptionPayload {
  id: string;
  plan_id: string;
  plan_name: string | null;
  plan_slug: string | null;
  plan_type: string | null;
  amount_cents: number;
  billing_interval: string;
  status: string;
  next_billing_date: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  users_count: number | null;
  days_until_next_billing: number | null;
  renewal_overdue: boolean;
  will_cancel_at_period_end: boolean;
  /** Sprint C — SSOT Pix Automático */
  pix_automatic?: PixAutomaticPreference | null;
}

interface TenantUsersLimitsPayload {
  current: number;
  limit: number | null;
  allowed: boolean;
}

/** GET /api/me/tenant/commercial-billings — uma linha por cobrança pai (tenant_billing). */
interface CommercialBillingHubRow {
  id: string;
  amount_cents: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  effective_payment_method: string | null;
  invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  billing_reason: string;
  plan_name_snapshot: string | null;
  has_gateway_reference: boolean;
  created_at: string;
}

type CommercialMode =
  | 'trial_resume_required'
  | 'payment_pending'
  | 'plan_period_expired'
  | 'trial_active'
  | 'active'
  | 'suspended_other'
  | 'other';

function formatPrice(cents: number): string {
  if (cents === 0) return 'Grátis';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return formatDateYmdOrInstantPtBr(iso);
}

function trialEndedUnpaid(data: MyPlanResponse): boolean {
  const end = data.trial_ends_at ? new Date(data.trial_ends_at).getTime() : NaN;
  return (
    data.tenant_status === 'trial' &&
    data.trial_ends_at != null &&
    !Number.isNaN(end) &&
    end < Date.now() &&
    (data.activated_billing_id == null || data.activated_billing_id === '')
  );
}

function needsTrialResumeFlow(data: MyPlanResponse | null, requiresCheckoutResume: boolean): boolean {
  if (requiresCheckoutResume) return true;
  if (!data) return false;
  if (data.tenant_status === 'suspended' && data.suspension_reason === 'trial_expired') return true;
  return trialEndedUnpaid(data);
}

function isPlanBillingPeriodPast(data: MyPlanResponse): boolean {
  if (!data.plan_period_end) return false;
  const t = new Date(data.plan_period_end).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

function resolveCommercialMode(
  data: MyPlanResponse,
  requiresCheckoutResume: boolean
): CommercialMode {
  if (needsTrialResumeFlow(data, requiresCheckoutResume)) {
    return 'trial_resume_required';
  }
  if (data.tenant_status === 'payment_pending') {
    return 'payment_pending';
  }
  if (isPlanBillingPeriodPast(data)) {
    return 'plan_period_expired';
  }
  if (data.tenant_status === 'trial') {
    const end = data.trial_ends_at ? new Date(data.trial_ends_at).getTime() : NaN;
    if (data.trial_ends_at && !Number.isNaN(end) && end > Date.now()) {
      return 'trial_active';
    }
    if (!data.trial_ends_at) {
      return 'trial_active';
    }
  }
  if (data.tenant_status === 'active') {
    return 'active';
  }
  if (data.tenant_status === 'suspended') {
    return 'suspended_other';
  }
  return 'other';
}

function daysUntil(iso: string): number {
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function billingStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    pending: 'Aguardando pagamento',
    waiting_payment: 'Aguardando pagamento',
    processing: 'Em processamento',
    overdue: 'Vencida',
    paid: 'Paga',
    cancelled: 'Cancelada',
    failed: 'Falhou',
    refunded: 'Estornada',
  };
  return m[status] ?? status;
}

function paymentMethodLabelPt(method: string | null | undefined): string {
  if (!method) return 'A definir no pagamento';
  if (method === 'PIX') return 'PIX';
  if (method === 'BOLETO') return 'Boleto';
  if (method === 'CREDIT_CARD') return 'Cartão de crédito';
  return method;
}

/** Forma de pagamento para exibição em resumos (quando desconhecido, traço). */
function paymentMethodOrDash(method: string | null | undefined): string {
  if (!method) return '—';
  return paymentMethodLabelPt(method);
}

/** Apenas dia/mês, para compactar o período no mobile. */
function formatDateShortDm(iso: string | null | undefined): string {
  if (iso == null || typeof iso !== 'string') return '—';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}`;
  }
  const t = Date.parse(iso);
  if (!Number.isNaN(t)) {
    return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  return '—';
}

function mobileBillingStatusStyles(status: string): { className: string; shortLabel: string } {
  if (status === 'paid') {
    return { className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200', shortLabel: 'Pago' };
  }
  if (['pending', 'waiting_payment', 'processing'].includes(status)) {
    return { className: 'bg-amber-500/20 text-amber-950 dark:text-amber-100', shortLabel: 'Pendente' };
  }
  if (status === 'overdue') {
    return { className: 'bg-destructive/10 text-destructive', shortLabel: 'Vencido' };
  }
  if (status === 'cancelled') {
    return { className: 'bg-muted text-muted-foreground', shortLabel: 'Cancelada' };
  }
  if (status === 'refunded') {
    return { className: 'bg-muted text-muted-foreground', shortLabel: 'Estornada' };
  }
  if (status === 'failed') {
    return { className: 'bg-destructive/10 text-destructive', shortLabel: 'Falhou' };
  }
  return { className: 'bg-muted/60 text-foreground', shortLabel: billingStatusLabelPt(status) };
}

function billingIntervalLabelPt(key: string): string {
  const row = INTERVALS.find((i) => i.key === key);
  return row?.label ?? key;
}

/** Texto curto para o cartão de assentos (restante fica no fluxo de compra). */
const SEATS_SHORT_HINT =
  'Usuários extras podem gerar custo adicional. Reduções valem para o próximo ciclo.';

const WHATSAPP_CONNECTIONS_HINT =
  'Conexões extras são cobradas proporcionalmente ao ciclo atual e passam a integrar o seu limite contratado.';
const WHATSAPP_CONNECTIONS_HINT_CUSTOM =
  'No plano personalizado, a quantidade contratada define o teto. Você pode comprar conexões extras aqui (quando houver preço no catálogo) ou pedir ajuste ao administrador da conta.';

/** Checklist padrão quando o plano não traz `benefits` do catálogo — alinhado ao posicionamento do produto. */
const DEFAULT_INCLUDED_FEATURES: { icon: string; label: string }[] = [
  { icon: 'Check', label: 'Acesso a todos os módulos' },
  { icon: 'MessageCircle', label: 'WhatsApp integrado' },
  { icon: 'Smartphone', label: 'Notificações por WhatsApp' },
  { icon: 'Calendar', label: 'Agenda online' },
  { icon: 'BarChart3', label: 'Relatórios e dashboards' },
  { icon: 'LayoutGrid', label: 'Funil de vendas' },
  { icon: 'FileText', label: 'Propostas e contratos' },
  { icon: 'Lock', label: 'Segurança dos dados' },
  { icon: 'Banknote', label: 'Faturas e controle financeiro' },
];

function billingReasonLabelPt(reason: string): string {
  const m: Record<string, string> = {
    plan_purchase: 'Contratação / plano',
    plan_upgrade: 'Upgrade de plano',
    plan_renewal: 'Renovação',
    manual_charge: 'Cobrança avulsa',
    seat_addon: 'Assentos adicionais (pró-rata)',
    instance_addon: 'Conexões WhatsApp (pró-rata)',
  };
  return m[reason] ?? reason;
}

function competenceLineForBilling(b: CommercialBillingHubRow): string {
  if (b.period_start && b.period_end) {
    return `${formatDate(b.period_start)} — ${formatDate(b.period_end)}`;
  }
  return `Vencimento ${formatDate(b.due_date)}`;
}

function nextBillingCopy(sub: SaasSubscriptionPayload): { title: string; detail: string } {
  const d = sub.days_until_next_billing;
  const dateStr = formatDate(sub.next_billing_date);
  if (d === null) {
    return { title: 'Próxima cobrança', detail: dateStr };
  }
  if (d < 0) {
    return {
      title: 'Renovação',
      detail: `A data de referência (${dateStr}) já passou. Se houver pagamento pendente, conclua-o para manter o plano em dia.`,
    };
  }
  if (d === 0) {
    return { title: 'Próxima cobrança', detail: `Prevista para hoje — ${dateStr}.` };
  }
  if (d <= 7) {
    return {
      title: 'Próxima cobrança em breve',
      detail: `Em ${d} dia${d === 1 ? '' : 's'}, em ${dateStr}.`,
    };
  }
  return { title: 'Próxima cobrança', detail: `${dateStr} (daqui a ${d} dias).` };
}

export default function MeuPlano() {
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();
  const [myPlan, setMyPlan] = useState<MyPlanResponse | null>(null);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [planAccessDenied, setPlanAccessDenied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [intervalIdx, setIntervalIdx] = useState(0);
  const [seatAddonInlineExpanded, setSeatAddonInlineExpanded] = useState(false);
  const [seatAddonExtra, setSeatAddonExtra] = useState(1);
  const [seatAddonPreview, setSeatAddonPreview] = useState<SeatAddonPreviewResponse | null>(null);
  const [seatAddonLoading, setSeatAddonLoading] = useState(false);
  const [instanceAddonInlineExpanded, setInstanceAddonInlineExpanded] = useState(false);
  const [instanceAddonExtra, setInstanceAddonExtra] = useState(1);
  const [instanceAddonPreview, setInstanceAddonPreview] = useState<InstanceAddonPreviewResponse | null>(null);
  const [instanceAddonLoading, setInstanceAddonLoading] = useState(false);
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState(1);
  const [instanceDowngradeOpen, setInstanceDowngradeOpen] = useState(false);
  const [instanceDowngradeTarget, setInstanceDowngradeTarget] = useState(1);
  const [subscription, setSubscription] = useState<SaasSubscriptionPayload | null>(null);
  const [limitsUsers, setLimitsUsers] = useState<TenantUsersLimitsPayload | null>(null);
  const [limitsWhatsapp, setLimitsWhatsapp] = useState<TenantUsersLimitsPayload | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [commercialBillings, setCommercialBillings] = useState<CommercialBillingHubRow[]>([]);
  const seatAddonPreviewSeq = useRef(0);
  const instanceAddonPreviewSeq = useRef(0);
  const isMobile = useIsMobile();
  const canManage = authUser?.can_manage_plan === true;

  useEffect(() => {
    try {
      sessionStorage.removeItem(COMMERCIAL_402_REDIRECT_FLAG);
    } catch {
      /* ignore */
    }
  }, []);

  const inferredNextPaymentMethodLabel = useMemo(() => {
    if (myPlan?.pending_billing?.payment_method) {
      return paymentMethodOrDash(myPlan.pending_billing.payment_method);
    }
    const sorted = [...commercialBillings].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const fromPaid = sorted.find((b) => b.status === 'paid' && b.effective_payment_method);
    if (fromPaid) return paymentMethodOrDash(fromPaid.effective_payment_method);
    const any = sorted.find((b) => b.effective_payment_method);
    return paymentMethodOrDash(any?.effective_payment_method);
  }, [myPlan, commercialBillings]);

  const refreshAfterMutation = useCallback(async () => {
    const [resPlan, resSub, resLimits, resBill] = await Promise.all([
      apiClient.get<MyPlanResponse>('/api/me/tenant/plan'),
      apiClient.get<{ subscription: SaasSubscriptionPayload | null }>('/api/me/tenant/subscription'),
      apiClient.get<{
        users: TenantUsersLimitsPayload;
        whatsapp_instances?: TenantUsersLimitsPayload;
      }>('/api/me/tenant/limits'),
      apiClient.get<{ billings: CommercialBillingHubRow[] }>('/api/me/tenant/commercial-billings'),
    ]);
    if (resPlan.data && resPlan.details?.status !== 403) {
      setMyPlan(resPlan.data);
    }
    if (resSub.data) setSubscription(resSub.data.subscription ?? null);
    if (resLimits.data?.users) setLimitsUsers(resLimits.data.users);
    if (resLimits.data?.whatsapp_instances) setLimitsWhatsapp(resLimits.data.whatsapp_instances);
    if (resBill.data?.billings) setCommercialBillings(resBill.data.billings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlanAccessDenied(false);
    Promise.all([
      apiClient.get<MyPlanResponse>('/api/me/tenant/plan'),
      apiClient.get<{ subscription: SaasSubscriptionPayload | null }>('/api/me/tenant/subscription'),
      apiClient.get<{
        users: TenantUsersLimitsPayload;
        whatsapp_instances?: TenantUsersLimitsPayload;
      }>('/api/me/tenant/limits'),
      apiClient.get<{ billings: CommercialBillingHubRow[] }>('/api/me/tenant/commercial-billings'),
      apiClient.get<Plan[]>('/api/plans'),
    ]).then(([resPlan, resSub, resLimits, resBill, resPlans]) => {
      if (cancelled) return;
      if (resPlan.details?.status === 403) {
        setPlanAccessDenied(true);
        setMyPlan(null);
      } else if (resPlan.error) {
        setPlanAccessDenied(false);
        setMyPlan(null);
      } else if (resPlan.data) {
        setMyPlan(resPlan.data);
      }
      if (resSub.data) setSubscription(resSub.data.subscription ?? null);
      else setSubscription(null);
      if (resLimits.data?.users) setLimitsUsers(resLimits.data.users);
      if (resLimits.data?.whatsapp_instances) setLimitsWhatsapp(resLimits.data.whatsapp_instances);
      else setLimitsWhatsapp(null);
      if (resLimits.data?.users) setLimitsUsers(resLimits.data.users);
      else setLimitsUsers(null);
      if (resBill.data?.billings) setCommercialBillings(resBill.data.billings);
      else setCommercialBillings([]);
      if (resPlans.data) setAllPlans(resPlans.data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const key = myPlan?.plan.billing_interval;
    if (!key) return;
    const idx = INTERVALS.findIndex((i) => i.key === key);
    if (idx >= 0) setIntervalIdx(idx);
  }, [myPlan?.plan.billing_interval, myPlan?.plan.id]);

  const requiresCheckoutResume = authUser?.requires_checkout_resume === true;

  const commercialMode = useMemo(() => {
    if (!myPlan) return null;
    return resolveCommercialMode(myPlan, requiresCheckoutResume);
  }, [myPlan, requiresCheckoutResume]);

  /** Preview de assentos adicionais: atualiza automaticamente ao alterar a quantidade (sem botão “Calcular”). */
  useEffect(() => {
    if (!seatAddonInlineExpanded || commercialMode !== 'active' || !myPlan || myPlan.plan.plan_type !== 'custom') {
      return;
    }
    if (seatAddonExtra < 1) {
      setSeatAddonPreview(null);
      return;
    }
    const contracted = Math.max(1, subscription?.users_count ?? myPlan.max_users_override ?? 1);
    const cap = myPlan.plan.max_users ?? null;
    if (cap != null && contracted + seatAddonExtra > cap) {
      setSeatAddonPreview(null);
      setSeatAddonLoading(false);
      toast.error(
        `Este plano suporta no máximo ${cap} assentos. Você possui ${contracted} e está tentando adicionar ${seatAddonExtra}.`
      );
      return;
    }
    const seq = ++seatAddonPreviewSeq.current;
    const timer = setTimeout(async () => {
      setSeatAddonLoading(true);
      setSeatAddonPreview(null);
      const res = await apiClient.post<SeatAddonPreviewResponse>('/api/me/tenant/seat-addon/preview', {
        additional_seats: seatAddonExtra,
      });
      if (seq !== seatAddonPreviewSeq.current) return;
      setSeatAddonLoading(false);
      if (res.error || !res.data) {
        toast.error(res.error ?? 'Não foi possível calcular o valor agora. Atualize a página em instantes ou tente novamente.');
        return;
      }
      setSeatAddonPreview(res.data);
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [
    seatAddonInlineExpanded,
    seatAddonExtra,
    myPlan,
    myPlan?.tenant_id,
    myPlan?.plan.plan_type,
    myPlan?.plan.max_users,
    myPlan?.max_users_override,
    subscription?.users_count,
    commercialMode,
  ]);

  useEffect(() => {
    if (myPlan?.pending_seat_addon_billing) {
      setSeatAddonInlineExpanded(false);
      setSeatAddonPreview(null);
    }
  }, [myPlan?.pending_seat_addon_billing, myPlan?.pending_seat_addon_billing?.billing_id]);

  /** Preview de conexões WhatsApp extras. */
  useEffect(() => {
    if (!instanceAddonInlineExpanded || commercialMode !== 'active' || !myPlan) {
      return;
    }
    if (instanceAddonExtra < 1) {
      setInstanceAddonPreview(null);
      return;
    }
    if (limitsWhatsapp?.limit == null) {
      setInstanceAddonPreview(null);
      return;
    }
    const seq = ++instanceAddonPreviewSeq.current;
    const timer = setTimeout(async () => {
      setInstanceAddonLoading(true);
      setInstanceAddonPreview(null);
      const res = await apiClient.post<InstanceAddonPreviewResponse>('/api/me/tenant/instance-addon/preview', {
        additional_instances: instanceAddonExtra,
      });
      if (seq !== instanceAddonPreviewSeq.current) return;
      setInstanceAddonLoading(false);
      if (res.error || !res.data) {
        toast.error(res.error ?? 'Não foi possível calcular o valor agora. Atualize a página em instantes ou tente novamente.');
        return;
      }
      setInstanceAddonPreview(res.data);
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [
    instanceAddonInlineExpanded,
    instanceAddonExtra,
    myPlan,
    myPlan?.tenant_id,
    limitsWhatsapp?.limit,
    commercialMode,
  ]);

  useEffect(() => {
    if (myPlan?.pending_instance_addon_billing) {
      setInstanceAddonInlineExpanded(false);
      setInstanceAddonPreview(null);
    }
  }, [myPlan?.pending_instance_addon_billing, myPlan?.pending_instance_addon_billing?.billing_id]);

  const buildCheckoutState = useCallback(() => {
    if (!myPlan) return null;
    const plan = myPlan.plan;
    const interval = INTERVALS[intervalIdx] ?? INTERVALS[0];
    const contracted =
      plan.plan_type === 'custom'
        ? Math.max(1, subscription?.users_count ?? myPlan.max_users_override ?? 1)
        : 1;
    return {
      plan: {
        id: plan.id,
        name: plan.name,
        plan_type: plan.plan_type,
        price_cents: plan.price_cents,
        interval_prices: plan.interval_prices,
        description: plan.description,
        benefits: plan.benefits,
      },
      billingInterval: interval.key,
      usersCount: plan.plan_type === 'custom' ? contracted : undefined,
    };
  }, [myPlan, intervalIdx, subscription]);

  const goToCheckoutWithPlan = useCallback(() => {
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode aceder ao pagamento do plano.');
      return;
    }
    const state = buildCheckoutState();
    if (!state) return;
    /** `mode=renew`: tenant já existe — checkout pula Empresa/Resumo e usa plano/intervalo do state + contexto da API. */
    navigate('/checkout?mode=renew', { state });
  }, [navigate, buildCheckoutState, canManage]);

  /** Pagamento de cobrança interna SaaS (tenant_billing) — fluxo dedicado, fora do PlanCheckout. */
  const goOpenSaasBillingPay = useCallback(
    (billingId: string) => {
      navigate(`/saas-billing/${encodeURIComponent(billingId)}/pay`);
    },
    [navigate]
  );

  const goToCheckoutResume = useCallback(() => {
    navigate('/checkout?mode=resume');
  }, [navigate]);

  /**
   * Concluir pagamento: cobrança interna pendente → `/saas-billing/:id/pay`.
   * `?mode=resume` só quando não há cobrança reapresentável (retomada trial/checkout-context).
   */
  const goToPaymentOrResume = useCallback(() => {
    const pendingId = myPlan?.pending_billing?.billing_id?.trim();
    if (pendingId) {
      goOpenSaasBillingPay(pendingId);
      return;
    }
    if (checkoutResumeEnabled && requiresCheckoutResume) {
      goToCheckoutResume();
      return;
    }
    goToCheckoutWithPlan();
  }, [
    myPlan?.pending_billing?.billing_id,
    requiresCheckoutResume,
    goOpenSaasBillingPay,
    goToCheckoutResume,
    goToCheckoutWithPlan,
  ]);

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const changePlan = async (planId: string) => {
    if (!myPlan || saving) return;
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode alterar o plano.');
      return;
    }
    setSaving(true);
    const res = await apiClient.put('/api/me/tenant/plan', { plan_id: planId });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Plano alterado.');
    await refreshAfterMutation();
  };

  const runSeatAddonCheckout = async () => {
    if (!myPlan || seatAddonExtra < 1) return;
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode contrair assentos adicionais.');
      return;
    }
    setSeatAddonLoading(true);

    // Recalcula o preview imediatamente antes de criar a cobrança para garantir que o quote
    // passado ao checkout reflita os dias proporcionais e o valor atuais, não o cache da tela.
    const freshPreviewRes = await apiClient.post<SeatAddonPreviewResponse>(
      '/api/me/tenant/seat-addon/preview',
      { additional_seats: seatAddonExtra }
    );
    if (freshPreviewRes.error || !freshPreviewRes.data) {
      setSeatAddonLoading(false);
      toast.error(freshPreviewRes.error ?? 'Não foi possível calcular o valor atualizado.');
      return;
    }

    const res = await apiClient.post<{ billing_id: string }>('/api/me/tenant/seat-addon/checkout', {
      additional_seats: seatAddonExtra,
    });
    setSeatAddonLoading(false);
    if (res.error || !res.data?.billing_id) {
      toast.error(res.error ?? 'Não foi possível gerar a cobrança');
      return;
    }
    setSeatAddonInlineExpanded(false);
    setSeatAddonPreview(null);
    toast.success('Abrindo a tela de pagamento para concluir.');
    goOpenSaasBillingPay(res.data.billing_id);
    await refreshAfterMutation();
  };

  const runInstanceAddonCheckout = async () => {
    if (!myPlan || instanceAddonExtra < 1) return;
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode contratar conexões WhatsApp extras.');
      return;
    }
    setInstanceAddonLoading(true);

    const freshPreviewRes = await apiClient.post<InstanceAddonPreviewResponse>(
      '/api/me/tenant/instance-addon/preview',
      { additional_instances: instanceAddonExtra }
    );
    if (freshPreviewRes.error || !freshPreviewRes.data) {
      setInstanceAddonLoading(false);
      toast.error(freshPreviewRes.error ?? 'Não foi possível calcular o valor atualizado.');
      return;
    }

    const res = await apiClient.post<{ billing_id: string }>('/api/me/tenant/instance-addon/checkout', {
      additional_instances: instanceAddonExtra,
    });
    setInstanceAddonLoading(false);
    if (res.error || !res.data?.billing_id) {
      toast.error(res.error ?? 'Não foi possível gerar a cobrança');
      return;
    }
    setInstanceAddonInlineExpanded(false);
    setInstanceAddonPreview(null);
    toast.success('Abrindo a tela de pagamento para concluir.');
    goOpenSaasBillingPay(res.data.billing_id);
    await refreshAfterMutation();
  };

  const runScheduleDowngrade = async () => {
    if (!myPlan) return;
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode agendar a redução de assentos.');
      return;
    }
    setSaving(true);
    const res = await apiClient.put<{ scheduled_next_cycle: number | null; message: string }>(
      '/api/me/tenant/seats/schedule-next-cycle',
      { target_seats: downgradeTarget }
    );
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data?.message ?? 'Agendamento atualizado.');
    setDowngradeOpen(false);
    await refreshAfterMutation();
  };

  const runScheduleInstanceDowngrade = async () => {
    if (!myPlan) return;
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode agendar a redução de conexões.');
      return;
    }
    setSaving(true);
    const res = await apiClient.put<{ scheduled_next_cycle: number | null; message: string }>(
      '/api/me/tenant/instances/schedule-next-cycle',
      { target_instances: instanceDowngradeTarget }
    );
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(res.data?.message ?? 'Agendamento atualizado.');
    setInstanceDowngradeOpen(false);
    await refreshAfterMutation();
  };

  const confirmCancelAtPeriodEnd = async () => {
    if (!canManage) {
      toast.error('Apenas quem administra a conta pode cancelar a assinatura.');
      return;
    }
    setCancelSubmitting(true);
    const res = await apiClient.post('/api/me/tenant/subscription/cancel', { immediate: false });
    setCancelSubmitting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Cancelamento ao fim do período registrado.');
    setCancelDialogOpen(false);
    await refreshAfterMutation();
  };

  if (loading || authLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (planAccessDenied) {
    return (
      <div className="p-6 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Meu plano</h1>
          <p className="text-muted-foreground">Central de plano e cobrança da conta.</p>
        </div>
        <Card className="border-muted">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-muted-foreground" />
              Gestão pelo administrador principal
            </CardTitle>
            <CardDescription>
              A contratação, troca de plano e pagamentos são feitos pelo{' '}
              <strong>administrador principal</strong> da conta (primeiro usuário criado). Sua sessão não tem
              permissão para alterar o plano nesta tela.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            {requiresCheckoutResume && (
              <div
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-950 dark:text-amber-100"
                role="status"
              >
                <p className="font-medium text-foreground">Pagamento pendente na conta</p>
                <p className="mt-1">
                  O período de avaliação encerrou ou há cobrança em aberto. Peça ao administrador principal para
                  acessar <strong>Meu plano</strong> com a conta dele e concluir o pagamento na tela de pagamento.
                </p>
              </div>
            )}
            {authUser?.tenant_status === 'payment_pending' && !requiresCheckoutResume && (
              <p>
                Esta conta possui pagamento pendente. O administrador principal pode concluir em{' '}
                <strong>Meu plano</strong>.
              </p>
            )}
            <p>
              Dúvidas? Entre em contato com quem gerencia a assinatura da sua empresa ou abra um chamado em suporte.
            </p>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Atualizar página
            </Button>
          </CardContent>
        </Card>

        {subscription && (
          <Card id="meu-plano-assinatura">
            <CardHeader>
              <CardTitle className="text-lg">Assinatura</CardTitle>
              <CardDescription>
                Resumo do plano e da renovação. Para alterar contratação ou assentos, o administrador principal deve
                acessar esta página com a conta dele.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Plano</span>
                <br />
                <span className="font-medium">{subscription.plan_name ?? '—'}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Próxima cobrança</span>
                <br />
                <span className="font-medium">{formatDate(subscription.next_billing_date)}</span>
              </p>
              {subscription.will_cancel_at_period_end && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100">
                  Cancelamento ao fim do período já está agendado nesta assinatura.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {limitsUsers != null && (
          <Card id="meu-plano-assentos">
            <CardHeader>
              <CardTitle className="text-lg">Uso de usuários</CardTitle>
              <CardDescription>Quantas contas de acesso a equipe utiliza em relação ao limite do plano.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="font-medium">
                {limitsUsers.current}
                {limitsUsers.limit != null ? ` de ${limitsUsers.limit}` : ''}{' '}
                {limitsUsers.limit === 1 && limitsUsers.current === 1 ? 'usuário' : 'usuários'}
                {limitsUsers.limit == null ? ' (sem limite numérico fixo neste plano)' : ''}
              </p>
              {!limitsUsers.allowed && limitsUsers.limit != null && (
                <p className="text-amber-800 dark:text-amber-200">
                  O limite de lugares foi atingido. Peça ao administrador principal para contratar mais ou fazer upgrade.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {commercialBillings.length > 0 && (
          <Card id="meu-plano-cobrancas-readonly">
            <CardHeader>
              <CardTitle className="text-lg">Cobranças (somente leitura)</CardTitle>
              <CardDescription>Resumo das faturas da conta. Pagamentos são feitos pelo administrador principal.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto text-sm">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-medium">Referência</th>
                    <th className="p-2 font-medium">Valor</th>
                    <th className="p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {commercialBillings.slice(0, 15).map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="p-2">{competenceLineForBilling(b)}</td>
                      <td className="p-2">{formatPrice(b.amount_cents)}</td>
                      <td className="p-2">{billingStatusLabelPt(b.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (!myPlan || !commercialMode) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Não foi possível carregar o plano da sua conta.</p>
            <Button type="button" variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const plan = myPlan.plan;
  const isCustom = plan.plan_type === 'custom';
  const prices = plan.interval_prices ?? [];
  const priceRow = prices.find((p) => p.billing_interval === plan.billing_interval);
  const contractedSeats = Math.max(1, subscription?.users_count ?? myPlan.max_users_override ?? 1);
  const planMaxUsers = isCustom ? plan.max_users ?? null : null;
  const seatAddonCapacityReached = planMaxUsers != null && contractedSeats >= planMaxUsers;
  const canScheduleSeatDowngrade = isCustom && contractedSeats > (limitsUsers?.current ?? 1);
  const instancePriceCents = priceRow?.price_per_instance_cents;
  const canBuyWhatsappExtras =
    commercialMode === 'active' &&
    canManage &&
    limitsWhatsapp?.limit != null &&
    instancePriceCents != null &&
    instancePriceCents >= 0;
  const planWaIncluded = plan.max_whatsapp_instances ?? null;
  const contractedWhatsapp = limitsWhatsapp?.limit ?? null;
  const instanceDowngradeFloor = Math.max(planWaIncluded ?? 0, limitsWhatsapp?.current ?? 0);
  const canScheduleInstanceDowngrade =
    commercialMode === 'active' &&
    canManage &&
    contractedWhatsapp != null &&
    contractedWhatsapp > instanceDowngradeFloor;
  const currentPriceCents =
    isCustom && priceRow ? priceRow.price_per_user_cents * contractedSeats : plan.price_cents;
  const otherPlans = allPlans.filter((p) => p.id !== plan.id);
  const selectedIntervalKey = (INTERVALS[intervalIdx] ?? INTERVALS[0]).key;
  const planPeriodEnd = myPlan.plan_period_end;
  /** Primeira cobrança de plano já ativou a conta — hub não deve parecer trial/grátis nem negar ciclo pago. */
  const isPostFirstPaidActivation =
    myPlan.tenant_status === 'active' &&
    myPlan.activated_billing_id != null &&
    String(myPlan.activated_billing_id).trim() !== '';
  /** Catálogo pode marcar is_free (SKU trial); após ativação paga o preço vem da assinatura ou do plano contratado. */
  const showPlanAsGratis = plan.is_free === true && !isPostFirstPaidActivation;
  const billingIntervalLabel =
    INTERVALS.find((i) => i.key === plan.billing_interval)?.label ?? plan.billing_interval;
  const pendingBilling = myPlan.pending_billing ?? null;
  const showPendingDetailCard =
    pendingBilling != null ||
    commercialMode === 'trial_resume_required' ||
    commercialMode === 'payment_pending' ||
    commercialMode === 'plan_period_expired';

  const statusBadge = (() => {
    switch (commercialMode) {
      case 'trial_active':
        return { label: 'Trial ativo', className: 'bg-sky-500/15 text-sky-800 dark:text-sky-200' };
      case 'trial_resume_required':
        return { label: 'Pagamento necessário', className: 'bg-amber-500/15 text-amber-900 dark:text-amber-100' };
      case 'payment_pending':
        return { label: 'Pagamento pendente', className: 'bg-amber-500/15 text-amber-900 dark:text-amber-100' };
      case 'plan_period_expired':
        return { label: 'Período vencido', className: 'bg-amber-500/15 text-amber-900 dark:text-amber-100' };
      case 'active':
        return { label: 'Ativo', className: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' };
      case 'suspended_other':
        return { label: 'Suspenso', className: 'bg-destructive/10 text-destructive' };
      default:
        return { label: myPlan.tenant_status ?? '—', className: 'bg-muted text-muted-foreground' };
    }
  })();

  const hero = (() => {
    const billingLead = pendingBilling
      ? `Há uma cobrança de ${formatPrice(pendingBilling.amount_cents)} (${billingStatusLabelPt(pendingBilling.status)}). ${
          pendingBilling.has_gateway_reference
            ? 'Você pode concluir com PIX, boleto ou cartão na próxima etapa. '
            : ''
        }`
      : '';

    switch (commercialMode) {
      case 'trial_resume_required':
        return {
          icon: AlertCircle,
          variant: 'border-amber-500/40 bg-amber-500/5' as const,
          title: 'Conclua o pagamento para continuar',
          description: `${billingLead}O período de avaliação terminou ou a conta precisa de pagamento para ser reativada. Conclua na tela de pagamento (PIX, boleto ou cartão, quando disponível).`,
          primaryLabel: 'Concluir pagamento',
          onPrimary: goToPaymentOrResume,
        };
      case 'payment_pending':
        return {
          icon: CreditCard,
          variant: 'border-amber-500/40 bg-amber-500/5' as const,
          title: 'Cobrança pendente',
          description: `${billingLead || 'Há cobrança aguardando pagamento ou confirmação. '}Abra a tela de pagamento para ver o link e finalizar a contratação.`,
          primaryLabel: 'Ver link de pagamento',
          onPrimary: goToPaymentOrResume,
          secondaryLabel: undefined,
          onSecondary: undefined,
        };
      case 'plan_period_expired':
        return {
          icon: AlertCircle,
          variant: 'border-amber-500/40 bg-amber-500/5' as const,
          title: 'Período do plano expirado',
          description: `${billingLead || 'O período contratado desta conta já encerrou. '}Renove ou conclua o pagamento em aberto para voltar a usar o CRM.`,
          primaryLabel: pendingBilling ? 'Pagar agora' : 'Renovar plano',
          onPrimary: goToPaymentOrResume,
          secondaryLabel: undefined,
          onSecondary: undefined,
        };
      case 'trial_active': {
        const ends = myPlan.trial_ends_at ? formatDate(myPlan.trial_ends_at) : null;
        const days = myPlan.trial_ends_at ? daysUntil(myPlan.trial_ends_at) : null;
        return {
          icon: Sparkles,
          variant: 'border-sky-500/35 bg-sky-500/5' as const,
          title: 'Período de avaliação ativo',
          description:
            days != null && ends
              ? `Restam ${days} dia${days === 1 ? '' : 's'} até ${ends}. Depois será necessário contratar para manter o acesso completo.`
              : 'Você está usando o plano em modo avaliação. Quando quiser, pode contratar para continuar sem interrupções.',
          primaryLabel: 'Ver opções do plano',
          onPrimary: () => scrollToId('meu-plano-catalogo'),
          secondaryLabel: 'Ir ao pagamento',
          onSecondary: goToPaymentOrResume,
        };
      }
      case 'active': {
        const nb =
          subscription?.next_billing_date != null ? nextBillingCopy(subscription) : null;
        const periodFallback =
          !nb && myPlan.plan_period_end
            ? ` Período vigente da conta até ${formatDate(myPlan.plan_period_end)}.`
            : '';
        return {
          icon: Check,
          variant: 'border-emerald-500/35 bg-emerald-500/5' as const,
          title: 'Plano em dia',
          description:
            'Sua conta está ativa. Abaixo você pode trocar de plano, gerir assentos e conexões WhatsApp ou revisar benefícios.' +
            (nb ? ` ${nb.title}: ${nb.detail}` : periodFallback),
          primaryLabel: 'Trocar de plano',
          onPrimary: () => scrollToId('meu-plano-catalogo'),
          secondaryLabel: isCustom ? 'Gerir conexões' : undefined,
          onSecondary: isCustom ? () => scrollToId('meu-plano-whatsapp-conexoes') : undefined,
        };
      }
      case 'suspended_other': {
        const reason = myPlan.suspension_reason;
        return {
          icon: AlertCircle,
          variant: 'border-destructive/30 bg-destructive/5' as const,
          title: 'Conta suspensa',
          description: reason
            ? `Motivo registrado: ${reason}. Entre em contato com o suporte ou com o administrador da conta.`
            : 'A conta está suspensa. Entre em contato com o suporte para mais detalhes.',
          primaryLabel: 'Abrir suporte',
          onPrimary: () => navigate('/support/tickets'),
          secondaryLabel: undefined,
          onSecondary: undefined,
        };
      }
      default:
        return {
          icon: LayoutGrid,
          variant: 'border-border bg-card' as const,
          title: 'Situação da conta',
          description: 'Revise o plano atual e as ações disponíveis abaixo.',
          primaryLabel: 'Ir ao pagamento',
          onPrimary: goToCheckoutWithPlan,
          secondaryLabel: undefined,
          onSecondary: undefined,
        };
    }
  })();

  const HeroIcon = hero.icon;
  const mainDisplayPriceCents =
    subscription != null && subscription.amount_cents > 0 ? subscription.amount_cents : currentPriceCents;
  const nextBillingLine =
    subscription?.next_billing_date != null ? formatDate(subscription.next_billing_date) : '—';
  const periodLineArrow =
    subscription?.current_period_start && subscription?.current_period_end
      ? `${formatDate(subscription.current_period_start)} → ${formatDate(subscription.current_period_end)}`
      : myPlan.plan_period_start && myPlan.plan_period_end
        ? `${formatDate(myPlan.plan_period_start)} → ${formatDate(myPlan.plan_period_end)}`
        : planPeriodEnd
          ? `Vigente até ${formatDate(planPeriodEnd)}`
          : '—';
  const periodLineMobile =
    subscription?.current_period_start && subscription?.current_period_end
      ? `${formatDateShortDm(subscription.current_period_start)} → ${formatDateShortDm(subscription.current_period_end)}`
      : myPlan.plan_period_start && myPlan.plan_period_end
        ? `${formatDateShortDm(myPlan.plan_period_start)} → ${formatDateShortDm(myPlan.plan_period_end)}`
        : planPeriodEnd
          ? `até ${formatDateShortDm(planPeriodEnd)}`
          : '—';
  const usersCompactLine =
    limitsUsers != null
      ? limitsUsers.limit != null
        ? `${limitsUsers.current}/${limitsUsers.limit} usuários`
        : `${limitsUsers.current} usuário${limitsUsers.current === 1 ? '' : 's'} (sem teto no plano)`
      : isCustom
        ? `${contractedSeats} assentos`
        : '—';
  const availableSeats =
    limitsUsers != null && limitsUsers.limit != null
      ? Math.max(0, limitsUsers.limit - limitsUsers.current)
      : null;
  const nextRenewalStatusLabel = subscription
    ? subscription.renewal_overdue
      ? 'A regularizar'
      : subscription.will_cancel_at_period_end
        ? 'Sem renovação (cancelada)'
        : 'Em dia'
    : '—';
  const includedFeatures =
    Array.isArray(plan.benefits) && plan.benefits.length > 0
      ? plan.benefits.map((b) => ({ icon: b.icon ?? 'Check', label: b.label }))
      : DEFAULT_INCLUDED_FEATURES;
  const showCancelSubscriptionBtn =
    canManage &&
    commercialMode === 'active' &&
    subscription?.status === 'active' &&
    !subscription?.cancel_at_period_end;

  const planCapacityHints: string[] = [];
  if (availableSeats != null && availableSeats > 0) {
    planCapacityHints.push(
      `Você ainda tem ${availableSeats} usuário${availableSeats === 1 ? '' : 's'} disponível${availableSeats === 1 ? '' : 'is'}.`
    );
  }
  if (limitsUsers != null && limitsUsers.limit != null && limitsUsers.current >= limitsUsers.limit) {
    planCapacityHints.push('Você atingiu o limite de usuários do plano.');
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:gap-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Meu plano</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie sua assinatura, usuários e cobranças.
          </p>
          <div className="mt-3 md:hidden">
        <span
              className={cn(
                'inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium',
                statusBadge.className
              )}
        >
          {statusBadge.label}
        </span>
      </div>
        </div>
        <span
          className={cn(
            'hidden w-fit items-center rounded-full px-3 py-1.5 text-xs font-medium md:inline-flex',
            statusBadge.className
          )}
        >
          {statusBadge.label}
        </span>
      </header>

      {commercialMode !== 'active' && (
        <Card className={cn(hero.variant, 'border')}>
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
            <div className="flex min-w-0 gap-3">
              <HeroIcon className="h-10 w-10 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{hero.title}</p>
                <p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{hero.description}</p>
              </div>
            </div>
            {canManage ? (
              <div className="flex w-full flex-col gap-2 sm:max-w-xs sm:flex-shrink-0">
                <Button type="button" className="w-full gap-2" size="lg" onClick={hero.onPrimary}>
            <CreditCard className="h-4 w-4" />
            {hero.primaryLabel}
          </Button>
                {hero.secondaryLabel && hero.onSecondary ? (
                  <Button type="button" variant="outline" className="w-full" onClick={hero.onSecondary}>
              {hero.secondaryLabel}
            </Button>
                ) : null}
              </div>
            ) : (
              <p className="w-full text-sm text-muted-foreground sm:max-w-sm">
                A gestão de pagamento e de plano é feita pelo administrador da conta. Peça a essa pessoa que abra a
                tela <strong>Meu plano</strong> e conclua a regularização.
              </p>
          )}
        </CardContent>
      </Card>
      )}

      <Card
        id="meu-plano-resumo"
        className="overflow-hidden border-2 border-primary/15 bg-gradient-to-b from-primary/[0.05] to-card shadow-sm"
      >
        <CardHeader className="space-y-1 pb-2 md:pb-3">
          <CardDescription className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Plano atual
            </CardDescription>
          <CardTitle className="text-xl font-bold leading-tight md:text-2xl lg:text-3xl">{plan.name}</CardTitle>
          </CardHeader>
        <CardContent className="space-y-4 text-sm md:space-y-5">
          {commercialMode === 'active' && !showPendingDetailCard && (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-emerald-900 dark:text-emerald-200">
              <Check className="mt-0.5 h-4 w-4 shrink-0 md:h-5 md:w-5" />
                  <div>
                <p className="text-sm font-medium leading-tight">Tudo certo com sua assinatura.</p>
                <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-200/80">
                  Seu plano está ativo e pronto para uso.
                    </p>
                  </div>
                  </div>
          )}

          {canManage &&
            commercialMode === 'active' &&
            subscription?.pix_automatic?.available ? (
              <PixAutomaticConsentSwitch
                state={{
                  available: true,
                  switch_on: subscription.pix_automatic.switch_on,
                  status: subscription.pix_automatic.status,
                  has_active: subscription.pix_automatic.has_active,
                }}
                onToggle={async (nextOn) => {
                  if (nextOn) {
                    const billingId =
                      pendingBilling?.billing_id ??
                      myPlan?.pending_billing?.billing_id ??
                      null;
                    const res = await enableMyPixAutomatic(billingId);
                    if (res.error) {
                      if (res.code === 'needs_open_billing') {
                        toast.message(
                          'Abra o pagamento da fatura para autorizar o Pix Automático.'
                        );
                      } else {
                        toast.error(res.error);
                      }
                      return;
                    }
                    toast.success('Pix Automático preparado. Conclua no pagamento da fatura.');
                    if (res.data?.billing_id) {
                      navigate(`/saas-billing/${encodeURIComponent(res.data.billing_id)}/pay`);
                    }
                    await refreshAfterMutation();
                  } else {
                    const res = await disableMyPixAutomatic();
                    if (res.error) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success('Pix Automático desligado para as próximas cobranças.');
                    await refreshAfterMutation();
                  }
                }}
              />
            ) : null}
          {pendingBilling && (
            <div className="rounded-xl border-2 border-amber-500/40 bg-amber-500/10 p-4 shadow-sm">
              <p className="text-base font-semibold text-amber-950 dark:text-amber-100">Pagamento pendente</p>
              <p className="mt-1 text-sm text-amber-900/95 dark:text-amber-100">
                Existe uma fatura em aberto para reativar seu acesso.
              </p>
              <ul className="mt-3 space-y-1 text-sm text-amber-950/95 dark:text-amber-50">
                <li>
                  <span className="text-amber-900/80 dark:text-amber-200/90">Valor: </span>
                  <span className="font-medium tabular-nums">{formatPrice(pendingBilling.amount_cents)}</span>
                </li>
                {pendingBilling.due_date ? (
                  <li>
                    <span className="text-amber-900/80 dark:text-amber-200/90">Vencimento: </span>
                    <span className="font-medium tabular-nums">{formatDate(pendingBilling.due_date)}</span>
                  </li>
                ) : null}
                <li>
                  <span className="text-amber-900/80 dark:text-amber-200/90">Status: </span>
                  <span className="font-medium">{billingStatusLabelPt(pendingBilling.status)}</span>
                </li>
                <li>
                  <span className="text-amber-900/80 dark:text-amber-200/90">Meio de pagamento: </span>
                  <span className="font-medium">{paymentMethodOrDash(pendingBilling.payment_method)}</span>
                </li>
                {pendingBilling.invoice_number ? (
                  <li>
                    <span className="text-amber-900/80 dark:text-amber-200/90">Fatura: </span>
                    <span className="font-medium tabular-nums">{pendingBilling.invoice_number}</span>
                  </li>
                ) : null}
                {pendingBilling.gateway ? (
                  <li>
                    <span className="text-amber-900/80 dark:text-amber-200/90">Gateway: </span>
                    <span className="font-medium">{pendingBilling.gateway}</span>
                  </li>
                ) : null}
              </ul>
              {canManage && (
                <Button type="button" size="sm" className="mt-4 w-full sm:w-auto" onClick={goToPaymentOrResume}>
                  Pagar agora
                </Button>
              )}
            </div>
          )}

          <div className="md:hidden space-y-2.5 border-b border-border/50 pb-4 text-sm">
            <div>
              <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
                {showPlanAsGratis ? 'Grátis' : formatPrice(mainDisplayPriceCents)}
                {!showPlanAsGratis ? (
                  <span className="text-base font-normal text-muted-foreground"> / {billingIntervalLabel}</span>
                ) : null}
                  </p>
                </div>
            <p className="text-[15px] text-muted-foreground">{usersCompactLine}</p>
            <p>
              <span className="text-muted-foreground">Próxima cobrança </span>
              <span className="font-medium tabular-nums text-foreground">{nextBillingLine}</span>
                </p>
                <p>
              <span className="text-muted-foreground">Período </span>
              <span className="font-medium tabular-nums text-foreground">{periodLineMobile}</span>
            </p>
          </div>

          <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Valor</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                {showPlanAsGratis ? 'Grátis' : formatPrice(mainDisplayPriceCents)}
                {!showPlanAsGratis ? (
                  <span className="ml-1 text-sm font-medium text-muted-foreground">/ {billingIntervalLabel}</span>
                ) : null}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Usuários</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{usersCompactLine}</p>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Próxima cobrança</p>
              <p className="mt-1 text-lg font-semibold tabular-nums leading-snug">{nextBillingLine}</p>
            </div>
            <div className="rounded-2xl bg-muted/50 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Período</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{periodLineArrow}</p>
            </div>
          </div>

          {planCapacityHints.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {planCapacityHints.map((h, i) => (
                <li key={i}>• {h}</li>
              ))}
            </ul>
          )}

          {!canManage && (
            <p className="text-xs text-muted-foreground">
              Só o administrador principal da conta pode alterar o plano, contrair usuários extras ou trocar de oferta.
                  </p>
                )}

          <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:flex-wrap sm:items-center">
            {canManage && (commercialMode === 'active' || commercialMode === 'trial_active') && (
              <>
                <Button
                  type="button"
                  className="h-11 w-full min-w-[10rem] sm:w-auto"
                  onClick={() => scrollToId('meu-plano-catalogo')}
                >
                  Trocar plano
                </Button>
                {isCustom && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 w-full sm:w-auto"
                    onClick={() => scrollToId('meu-plano-usuarios-assentos')}
                  >
                    Gerenciar usuários
                    </Button>
                  )}
                {showCancelSubscriptionBtn ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full border-destructive/25 text-destructive hover:bg-destructive/5 sm:ml-0 sm:w-auto"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancelar no fim do período
                  </Button>
                ) : null}
              </>
            )}
            {canManage &&
              (commercialMode === 'trial_resume_required' ||
                commercialMode === 'payment_pending' ||
                commercialMode === 'plan_period_expired') && (
                <Button type="button" className="h-11 w-full sm:w-auto" onClick={goToPaymentOrResume}>
                  {commercialMode === 'payment_pending' || commercialMode === 'plan_period_expired'
                    ? myPlan.pending_billing
                      ? 'Pagar agora'
                      : 'Renovar plano'
                    : 'Regularizar pagamento'}
                </Button>
              )}
            {!subscription && isPostFirstPaidActivation && (
              <p className="w-full text-xs text-muted-foreground">
                Os detalhes da assinatura podem levar alguns instantes para atualizar.
              </p>
            )}
            {subscription?.will_cancel_at_period_end && (
              <p className="w-full text-xs text-amber-800 dark:text-amber-200">
                A assinatura não renova após o fim do período. O acesso permanece até essa data.
              </p>
            )}
          </div>
          </CardContent>
        </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 md:items-start">
        <Card
          id="meu-plano-usuarios-assentos"
          className="order-2 min-w-0 border-border/80 md:order-1"
        >
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base md:text-lg">Usuários e assentos</CardTitle>
          <CardDescription className="text-xs leading-relaxed">{SEATS_SHORT_HINT}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {limitsUsers != null ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5 md:px-4 md:py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Usuários em uso</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {limitsUsers.limit != null
                    ? `${limitsUsers.current} / ${limitsUsers.limit} usuários`
                    : `${limitsUsers.current} usuário${limitsUsers.current === 1 ? '' : 's'}`}
                </p>
                {limitsUsers.limit == null && (
                  <p className="mt-1 text-xs text-muted-foreground">Sem teto numérico neste plano.</p>
                )}
              </div>
              {isCustom && (
                <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5 md:px-4 md:py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Assentos contratados
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{contractedSeats} contratados</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Próxima renovação:{' '}
                    {subscription?.next_billing_date
                      ? formatDate(subscription.next_billing_date)
                      : myPlan.plan_period_end
                        ? formatDate(myPlan.plan_period_end)
                        : '—'}
                  </p>
                </div>
              )}
              {isCustom && myPlan.max_users_scheduled_next_cycle != null && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 sm:col-span-2 lg:col-span-1 md:px-4 md:py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-950 dark:text-amber-100">
                    Redução agendada
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-foreground">
                    {contractedSeats} → {myPlan.max_users_scheduled_next_cycle} assentos
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Efeito na próxima cobrança (
                    {subscription?.next_billing_date ? formatDate(subscription.next_billing_date) : 'data da renovação'}
                    ).
                  </p>
                </div>
              )}
              {limitsUsers.limit != null && (
                <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5 md:px-4 md:py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Assentos disponíveis
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {availableSeats ?? 0} disponíveis
                  </p>
              </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Limites de uso não disponíveis no momento.</p>
          )}

          {myPlan.pending_seat_addon_billing && commercialMode === 'active' && (
            <div
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm"
              role="status"
            >
              <p className="font-medium text-foreground">Upgrade de assentos aguardando pagamento</p>
              <p className="text-muted-foreground mt-1">
                Valor {formatPrice(myPlan.pending_seat_addon_billing.amount_cents)} —{' '}
                {billingStatusLabelPt(myPlan.pending_seat_addon_billing.status)}. Os novos assentos só ficam ativos após a
                confirmação do pagamento.
              </p>
              {canManage ? (
              <Button
                type="button"
                size="sm"
                className="mt-3"
                variant="secondary"
                onClick={() => goOpenSaasBillingPay(myPlan.pending_seat_addon_billing!.billing_id)}
              >
                Continuar para pagamento
              </Button>
              ) : null}
            </div>
          )}

          {!isCustom && (
            <p className="text-muted-foreground">
              Seu plano tem limite fixo no catálogo. Para mais lugares, faça upgrade — a contratação com pagamento é feita
              na tela de pagamento.
            </p>
          )}

          {isCustom && commercialMode === 'active' && canManage && (
            <div className="space-y-4 pt-2 border-t">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
                <Button
                  type="button"
                  className="h-11 w-full sm:w-auto"
                  variant={seatAddonInlineExpanded ? 'secondary' : 'default'}
                  disabled={!!myPlan.pending_seat_addon_billing || seatAddonCapacityReached}
                  aria-expanded={seatAddonInlineExpanded}
                  onClick={() => {
                    if (seatAddonInlineExpanded) {
                      setSeatAddonInlineExpanded(false);
                      setSeatAddonPreview(null);
                    } else {
                      setSeatAddonExtra(1);
                      setSeatAddonPreview(null);
                      setSeatAddonInlineExpanded(true);
                    }
                  }}
                >
                  {seatAddonInlineExpanded ? 'Fechar' : 'Adicionar usuários'}
                </Button>
                {seatAddonCapacityReached && (
                  <p className="text-xs text-muted-foreground w-full">
                    Seu plano atual já atingiu o limite de {planMaxUsers} assento{planMaxUsers === 1 ? '' : 's'}.
                  </p>
                )}
                <Button
                  type="button"
                  className="h-11 w-full sm:w-auto"
                  variant="outline"
                  disabled={saving || !!myPlan.pending_seat_addon_billing || !canScheduleSeatDowngrade}
                  onClick={() => {
                    const def = Math.max(limitsUsers?.current ?? 1, contractedSeats - 1);
                    setDowngradeTarget(def);
                    setDowngradeOpen(true);
                  }}
                >
                  Reduzir no próximo ciclo
                </Button>
                {!canScheduleSeatDowngrade && (
                  <p className="text-xs text-muted-foreground w-full">
                    Só é possível agendar a redução quando existem assentos contratados além do uso real (ou remova
                    utilizadores antes).
                  </p>
                )}
              </div>

              {seatAddonInlineExpanded && !myPlan.pending_seat_addon_billing && (
                <div
                  id="meu-plano-seat-addon-inline"
                  className="rounded-xl border border-primary/20 bg-muted/20 p-5 space-y-5"
                >
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Adicionar assentos</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quantos <strong>novos</strong> lugares você deseja além dos {contractedSeats} já contratados? O valor
                      único de hoje é proporcional ao tempo restante do período atual; a renovação passa a refletir o novo
                      total.
                    </p>
                  </div>
                  <div className="space-y-2 max-w-xs">
                    <label className="text-sm font-medium" htmlFor="seat-addon-extra-inline">
                      Novos assentos
                    </label>
                    <Input
                      id="seat-addon-extra-inline"
                      type="number"
                      min={1}
                      step={1}
                      value={seatAddonExtra}
                      onChange={(e) => setSeatAddonExtra(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                  </div>
                  {seatAddonLoading && (
                    <p className="text-sm text-muted-foreground">Atualizando valores…</p>
                  )}
                  {seatAddonPreview && !seatAddonLoading && (
                    <div className="space-y-5">
                      <div className="rounded-lg border bg-card px-4 py-4 space-y-3 text-sm">
                        <p className="font-medium text-foreground">Resumo</p>
                        <ul className="space-y-2 text-muted-foreground list-none pl-0">
                          <li>
                            Você possui hoje:{' '}
                            <strong className="text-foreground">{seatAddonPreview.current_contracted} assentos</strong>
                          </li>
                          <li>
                            Está adicionando:{' '}
                            <strong className="text-foreground">
                              {seatAddonPreview.breakdown.additional_seats}{' '}
                              {seatAddonPreview.breakdown.additional_seats === 1 ? 'assento' : 'assentos'}
                            </strong>
                          </li>
                          <li>
                            Novo total:{' '}
                            <strong className="text-foreground">{seatAddonPreview.new_total} assentos</strong>
                          </li>
                        </ul>
                      </div>
                      <div className="rounded-lg border bg-background px-4 py-4 space-y-2 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Cobrança agora
                        </p>
                        <p>
                          Valor por usuário ({billingIntervalLabelPt(seatAddonPreview.billing_interval)}):{' '}
                          <strong>{formatPrice(seatAddonPreview.breakdown.price_per_user_full_period_cents)}</strong>
                        </p>
                        <p>
                          {subscription?.days_until_next_billing != null && subscription.days_until_next_billing >= 0 ? (
                            <>
                              Dias até a próxima renovação:{' '}
                              <strong>{subscription.days_until_next_billing}</strong>
                            </>
                          ) : (
                            <>
                              Dias proporcionais considerados neste ciclo:{' '}
                              <strong>{seatAddonPreview.breakdown.remaining_period_days}</strong>
                            </>
                          )}
                        </p>
                        <p>
                          Valor proporcional a pagar agora:{' '}
                          <strong className="text-lg text-foreground">
                            {formatPrice(seatAddonPreview.breakdown.amount_cents)}
                          </strong>
                        </p>
                      </div>
                      <div className="rounded-lg border bg-background px-4 py-4 space-y-2 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Próximos ciclos
                        </p>
                        <p>
                          Novo valor por período ({billingIntervalLabelPt(seatAddonPreview.billing_interval)}):{' '}
                          <strong className="text-lg text-foreground">
                            {formatPrice(
                              seatAddonPreview.new_total *
                                seatAddonPreview.breakdown.price_per_user_full_period_cents
                            )}
                          </strong>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Valor da renovação após confirmar o pagamento dos novos assentos, enquanto não houver outras
                          alterações ou promoções.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={seatAddonLoading}
                        onClick={() => runSeatAddonCheckout()}
                      >
                        Continuar para checkout
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

        <Card
          id="meu-plano-proxima-cobranca"
          className="order-1 min-w-0 border-border/80 md:order-2"
        >
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base md:text-lg">Próxima cobrança</CardTitle>
            <CardDescription className="text-xs leading-relaxed">Próxima renovação da sua assinatura.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {subscription ? (
              <>
                <div className="space-y-2.5 rounded-2xl bg-muted/40 px-3.5 py-3 md:px-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Valor previsto</span>
                    <span className="text-lg font-bold tabular-nums text-foreground">
                      {formatPrice(subscription.amount_cents)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Data</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {formatDate(subscription.next_billing_date)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className="font-medium text-foreground">{nextRenewalStatusLabel}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 border-t border-border/50 pt-2.5">
                    <span className="text-xs text-muted-foreground">Pagamento</span>
                    <span className="text-right text-sm font-medium text-foreground">
                      {inferredNextPaymentMethodLabel}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 w-full"
                  onClick={() => scrollToId('meu-plano-cobrancas')}
                >
                  Ver cobranças
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {isPostFirstPaidActivation
                  ? 'Em breve você verá a data e o valor. Atualize a página se continuar vazio.'
                  : 'Conclua a ativação paga para ver a próxima data aqui.'}
              </p>
            )}
            {showPendingDetailCard && pendingBilling && !subscription && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="text-muted-foreground">Em aberto</p>
                <p className="mt-0.5 font-medium">
                  {formatPrice(pendingBilling.amount_cents)} — {pendingBilling.due_date ? formatDate(pendingBilling.due_date) : '—'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="meu-plano-whatsapp-conexoes" className="min-w-0 border-border/80">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base md:text-lg">Conexões WhatsApp</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            {isCustom ? WHATSAPP_CONNECTIONS_HINT_CUSTOM : WHATSAPP_CONNECTIONS_HINT}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {limitsWhatsapp != null ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5 md:px-4 md:py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Em uso</p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums">
                  {limitsWhatsapp.limit != null
                    ? `${limitsWhatsapp.current} / ${limitsWhatsapp.limit} conexões`
                    : `${limitsWhatsapp.current} ${limitsWhatsapp.current === 1 ? 'conexão' : 'conexões'}`}
                </p>
                {limitsWhatsapp.limit == null && (
                  <p className="mt-1 text-xs text-muted-foreground">Sem teto numérico neste plano (ilimitado).</p>
                )}
              </div>
              {isCustom && contractedWhatsapp != null && (
                <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5 md:px-4 md:py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Conexões contratadas
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{contractedWhatsapp} contratadas</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {planWaIncluded != null
                      ? `Inclusas no pacote: ${planWaIncluded}. Extras acima disso entram na renovação.`
                      : 'Quantidade definida no contrato desta conta.'}
                  </p>
                </div>
              )}
              {limitsWhatsapp.limit != null && (
                <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5 md:px-4 md:py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Disponíveis</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">
                    {Math.max(0, limitsWhatsapp.limit - limitsWhatsapp.current)} disponíveis
                  </p>
                  {instancePriceCents != null && instancePriceCents >= 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Extra: {formatPrice(instancePriceCents)} / conexão ({billingIntervalLabel})
                    </p>
                  )}
                </div>
              )}
              {myPlan.max_whatsapp_instances_scheduled_next_cycle != null && contractedWhatsapp != null && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 sm:col-span-2 lg:col-span-3 md:px-4 md:py-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-950 dark:text-amber-100">
                    Redução agendada
                  </p>
                  <p className="mt-0.5 text-lg font-semibold text-foreground">
                    {contractedWhatsapp} → {myPlan.max_whatsapp_instances_scheduled_next_cycle} conexões
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Efeito na próxima cobrança (
                    {subscription?.next_billing_date ? formatDate(subscription.next_billing_date) : 'data da renovação'}
                    ).
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Limite de conexões não disponível no momento.</p>
          )}

          {myPlan.pending_instance_addon_billing && commercialMode === 'active' && (
            <div
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm"
              role="status"
            >
              <p className="font-medium text-foreground">Upgrade de conexões aguardando pagamento</p>
              <p className="text-muted-foreground mt-1">
                Valor {formatPrice(myPlan.pending_instance_addon_billing.amount_cents)} —{' '}
                {billingStatusLabelPt(myPlan.pending_instance_addon_billing.status)}. As novas conexões só ficam ativas
                após a confirmação do pagamento.
              </p>
              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  variant="secondary"
                  onClick={() => goOpenSaasBillingPay(myPlan.pending_instance_addon_billing!.billing_id)}
                >
                  Continuar para pagamento
                </Button>
              ) : null}
            </div>
          )}

          {limitsWhatsapp?.limit == null && (
            <p className="text-muted-foreground">
              {isCustom
                ? 'A quantidade de conexões ainda não foi definida para esta conta (ilimitado). Peça ao Super Admin ou ao suporte para definir a quantidade contratada — só então é possível comprar extras aqui.'
                : 'Seu plano não limita conexões WhatsApp. Extras pagos não se aplicam enquanto o limite for ilimitado.'}
            </p>
          )}

          {limitsWhatsapp?.limit != null &&
            (instancePriceCents == null || instancePriceCents < 0) &&
            commercialMode === 'active' && (
              <p className="text-muted-foreground">
                Este plano ainda não tem preço por conexão extra. Fale com o suporte ou peça ao Super Admin para
                configurar o valor no catálogo — o teto contratado já está ativo.
              </p>
            )}

          {(canBuyWhatsappExtras || canScheduleInstanceDowngrade) && (
            <div className="space-y-4 pt-2 border-t">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
                {canBuyWhatsappExtras ? (
                  <Button
                    type="button"
                    className="h-11 w-full sm:w-auto"
                    variant={instanceAddonInlineExpanded ? 'secondary' : 'default'}
                    disabled={!!myPlan.pending_instance_addon_billing}
                    aria-expanded={instanceAddonInlineExpanded}
                    onClick={() => {
                      if (instanceAddonInlineExpanded) {
                        setInstanceAddonInlineExpanded(false);
                        setInstanceAddonPreview(null);
                      } else {
                        setInstanceAddonExtra(1);
                        setInstanceAddonPreview(null);
                        setInstanceAddonInlineExpanded(true);
                      }
                    }}
                  >
                    {instanceAddonInlineExpanded ? 'Fechar' : 'Adicionar conexões'}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="h-11 w-full sm:w-auto"
                  variant="outline"
                  disabled={saving || !!myPlan.pending_instance_addon_billing || !canScheduleInstanceDowngrade}
                  onClick={() => {
                    const def = Math.max(
                      instanceDowngradeFloor,
                      (contractedWhatsapp ?? instanceDowngradeFloor) - 1
                    );
                    setInstanceDowngradeTarget(def);
                    setInstanceDowngradeOpen(true);
                  }}
                >
                  Reduzir no próximo ciclo
                </Button>
                {!canScheduleInstanceDowngrade && contractedWhatsapp != null && planWaIncluded != null && (
                  <p className="text-xs text-muted-foreground w-full">
                    Só é possível agendar redução quando há conexões extras além do uso atual e do incluso no plano.
                  </p>
                )}
              </div>

              {canBuyWhatsappExtras && instanceAddonInlineExpanded && !myPlan.pending_instance_addon_billing && (
                <div
                  id="meu-plano-instance-addon-inline"
                  className="rounded-xl border border-primary/20 bg-muted/20 p-5 space-y-5"
                >
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Adicionar conexões WhatsApp</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quantas <strong>novas</strong> conexões além das {limitsWhatsapp!.limit} já contratadas? O valor de
                      hoje é proporcional ao tempo restante do período; o novo limite vale após o pagamento.
                    </p>
                  </div>
                  <div className="space-y-2 max-w-xs">
                    <label className="text-sm font-medium" htmlFor="instance-addon-extra-inline">
                      Novas conexões
                    </label>
                    <Input
                      id="instance-addon-extra-inline"
                      type="number"
                      min={1}
                      step={1}
                      value={instanceAddonExtra}
                      onChange={(e) => setInstanceAddonExtra(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    />
                  </div>
                  {instanceAddonLoading && (
                    <p className="text-sm text-muted-foreground">Atualizando valores…</p>
                  )}
                  {instanceAddonPreview && !instanceAddonLoading && (
                    <div className="space-y-5">
                      <div className="rounded-lg border bg-card px-4 py-4 space-y-3 text-sm">
                        <p className="font-medium text-foreground">Resumo</p>
                        <ul className="space-y-2 text-muted-foreground list-none pl-0">
                          <li>
                            Você possui hoje:{' '}
                            <strong className="text-foreground">
                              {instanceAddonPreview.current_contracted} conexões
                            </strong>
                          </li>
                          <li>
                            Está adicionando:{' '}
                            <strong className="text-foreground">
                              {instanceAddonPreview.breakdown.additional_instances}{' '}
                              {instanceAddonPreview.breakdown.additional_instances === 1
                                ? 'conexão'
                                : 'conexões'}
                            </strong>
                          </li>
                          <li>
                            Novo total:{' '}
                            <strong className="text-foreground">{instanceAddonPreview.new_total} conexões</strong>
                          </li>
                        </ul>
                      </div>
                      <div className="rounded-lg border bg-background px-4 py-4 space-y-2 text-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Cobrança agora
                        </p>
                        <p>
                          Valor por conexão ({billingIntervalLabelPt(instanceAddonPreview.billing_interval)}):{' '}
                          <strong>
                            {formatPrice(instanceAddonPreview.breakdown.price_per_instance_full_period_cents)}
                          </strong>
                        </p>
                        <p>
                          {subscription?.days_until_next_billing != null &&
                          subscription.days_until_next_billing >= 0 ? (
                            <>
                              Dias até a próxima renovação:{' '}
                              <strong>{subscription.days_until_next_billing}</strong>
                            </>
                          ) : (
                            <>
                              Dias proporcionais considerados neste ciclo:{' '}
                              <strong>{instanceAddonPreview.breakdown.remaining_period_days}</strong>
                            </>
                          )}
                        </p>
                        <p>
                          Valor proporcional a pagar agora:{' '}
                          <strong className="text-lg text-foreground">
                            {formatPrice(instanceAddonPreview.breakdown.amount_cents)}
                          </strong>
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="lg"
                        className="w-full sm:w-auto"
                        disabled={instanceAddonLoading}
                        onClick={() => runInstanceAddonCheckout()}
                      >
                        Continuar para checkout
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={downgradeOpen} onOpenChange={setDowngradeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reduzir assentos na próxima renovação</DialogTitle>
            <DialogDescription>
              Sem estorno. A quantidade menor só vale na <strong>próxima cobrança</strong>. Até lá você mantém os{' '}
              {contractedSeats} assentos atuais. Não pode ser menor que usuários em uso ({limitsUsers?.current ?? '—'}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium" htmlFor="downgrade-target">
              Nova quantidade (a partir da próxima renovação)
            </label>
            <Input
              id="downgrade-target"
              type="number"
              min={limitsUsers?.current ?? 1}
              max={Math.max(limitsUsers?.current ?? 1, contractedSeats - 1)}
              step={1}
              value={downgradeTarget}
              onChange={(e) =>
                setDowngradeTarget(
                  Math.min(
                    Math.max(limitsUsers?.current ?? 1, parseInt(e.target.value, 10) || 1),
                    contractedSeats - 1
                  )
                )
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDowngradeOpen(false)}>
              Voltar
            </Button>
            <Button type="button" disabled={saving} onClick={() => runScheduleDowngrade()}>
              {saving ? 'Salvando…' : 'Confirmar agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={instanceDowngradeOpen} onOpenChange={setInstanceDowngradeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reduzir conexões na próxima renovação</DialogTitle>
            <DialogDescription>
              Sem estorno. A quantidade menor só vale na <strong>próxima cobrança</strong>. Até lá você mantém as{' '}
              {contractedWhatsapp ?? '—'} conexões atuais. Mínimo:{' '}
              {instanceDowngradeFloor} (incluso no plano ou em uso).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium" htmlFor="instance-downgrade-target">
              Nova quantidade (a partir da próxima renovação)
            </label>
            <Input
              id="instance-downgrade-target"
              type="number"
              min={instanceDowngradeFloor}
              max={Math.max(instanceDowngradeFloor, (contractedWhatsapp ?? instanceDowngradeFloor) - 1)}
              step={1}
              value={instanceDowngradeTarget}
              onChange={(e) =>
                setInstanceDowngradeTarget(
                  Math.min(
                    Math.max(instanceDowngradeFloor, parseInt(e.target.value, 10) || instanceDowngradeFloor),
                    Math.max(instanceDowngradeFloor, (contractedWhatsapp ?? instanceDowngradeFloor) - 1)
                  )
                )
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInstanceDowngradeOpen(false)}>
              Voltar
            </Button>
            <Button type="button" disabled={saving} onClick={() => runScheduleInstanceDowngrade()}>
              {saving ? 'Salvando…' : 'Confirmar agendamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card id="meu-plano-beneficios" className="border-border/80">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base md:text-lg">O que está incluído</CardTitle>
          <CardDescription className="text-xs">Recursos disponíveis no seu plano.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ul
            className={cn('grid text-sm', isMobile ? 'grid-cols-1 gap-1.5' : 'sm:grid-cols-2 sm:gap-x-4 sm:gap-y-1.5')}
          >
            {includedFeatures.map((b, i) => {
              const IconC = BENEFIT_ICON_MAP[b.icon] ?? Check;
                return (
                <li key={i} className="flex items-start gap-2 py-1.5 sm:py-1">
                  <IconC className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                  <span className="leading-tight text-foreground/90">{b.label}</span>
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>

      <Card id="meu-plano-cobrancas" className="border-border/80">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base md:text-lg">Cobranças</CardTitle>
          <CardDescription className="text-xs">Histórico de pagamentos da sua assinatura.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {commercialBillings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ainda não há faturas para esta conta.</p>
          ) : isMobile ? (
            <div className="space-y-2.5">
              {commercialBillings.map((b) => {
                const canReopenGateway =
                  ['pending', 'waiting_payment', 'processing'].includes(b.status) && b.has_gateway_reference;
                const openCommercially = ['pending', 'waiting_payment', 'processing', 'overdue'].includes(b.status);
                const tone = mobileBillingStatusStyles(b.status);
                return (
                  <div
                    key={b.id}
                    className={cn(
                      'overflow-hidden rounded-xl border border-border/60 text-sm',
                      b.status === 'paid' && 'bg-emerald-500/[0.04]',
                      ['pending', 'waiting_payment', 'processing'].includes(b.status) && 'bg-amber-500/[0.06]',
                      b.status === 'overdue' && 'bg-destructive/[0.04]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-border/40 bg-muted/20 px-3 py-2.5">
                      <p className="min-w-0 text-[13px] font-medium leading-snug">{competenceLineForBilling(b)}</p>
                      <Badge
                        variant="secondary"
                        className={cn('shrink-0 text-[10px] font-medium', tone.className)}
                      >
                        {tone.shortLabel}
                      </Badge>
                    </div>
                    <div className="space-y-1 px-3 py-3">
                      <p>
                        <span className="text-xs text-muted-foreground">Vencimento </span>
                        <span className="text-xs font-medium tabular-nums text-foreground">{formatDate(b.due_date)}</span>
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-foreground">{formatPrice(b.amount_cents)}</p>
                      <p className="text-xs text-muted-foreground">
                        {paymentMethodOrDash(b.effective_payment_method)}
                      </p>
                    </div>
                    <div className="border-t border-border/40 bg-background/30 px-3 py-1.5">
                      <p className="text-[10px] text-muted-foreground">
                        {b.invoice_number ? `Ref. ${b.invoice_number}` : `ID ${b.id.slice(0, 8)}…`}
                      </p>
                    </div>
                    {canReopenGateway || (openCommercially && !canReopenGateway) ? (
                      <div className="p-3 pt-0">
                        <Button
                          type="button"
                          className="h-10 w-full"
                          size="sm"
                          variant={canReopenGateway ? 'default' : 'outline'}
                          onClick={() => goOpenSaasBillingPay(b.id)}
                        >
                          {canReopenGateway ? 'Pagar agora' : 'Abrir'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/80">
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs">
                    <th className="px-2 py-2.5 font-medium">Referência</th>
                    <th className="px-2 py-2.5 font-medium">Tipo</th>
                    <th className="px-2 py-2.5 font-medium">Valor</th>
                    <th className="px-2 py-2.5 font-medium">Vencimento</th>
                    <th className="px-2 py-2.5 font-medium">Status</th>
                    <th className="px-2 py-2.5 font-medium">Pagamento</th>
                    <th className="px-2 py-2.5 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {commercialBillings.map((b) => {
                    const canReopenGateway =
                      ['pending', 'waiting_payment', 'processing'].includes(b.status) && b.has_gateway_reference;
                    const openCommercially = ['pending', 'waiting_payment', 'processing', 'overdue'].includes(b.status);
                    return (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="max-w-[10rem] px-2 py-2 align-top">
                          <div className="line-clamp-2 font-medium leading-snug">{competenceLineForBilling(b)}</div>
                          {b.invoice_number ? (
                            <div className="text-[9px] text-muted-foreground font-mono leading-tight">{b.invoice_number}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 align-top text-xs text-muted-foreground">
                          {billingReasonLabelPt(b.billing_reason)}
                        </td>
                        <td className="px-2 py-2 align-top text-sm font-semibold tabular-nums text-foreground">
                          {formatPrice(b.amount_cents)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 align-top text-xs tabular-nums text-foreground">
                          {formatDate(b.due_date)}
                        </td>
                        <td className="px-2 py-2 align-top text-xs text-foreground">{billingStatusLabelPt(b.status)}</td>
                        <td className="px-2 py-2 align-top text-xs text-muted-foreground">
                          {paymentMethodOrDash(b.effective_payment_method)}
                        </td>
                        <td className="px-2 py-2 align-top text-right">
                          {canReopenGateway && (
                            <Button type="button" size="sm" variant="secondary" onClick={() => goOpenSaasBillingPay(b.id)}>
                              Pagar
                            </Button>
                          )}
                          {openCommercially && !canReopenGateway && (
                            <Button type="button" size="sm" variant="outline" onClick={() => goOpenSaasBillingPay(b.id)}>
                              Abrir
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {otherPlans.length > 0 && (
        <Card id="meu-plano-catalogo">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">Planos disponíveis</CardTitle>
            <CardDescription className="text-sm">
              {commercialMode === 'active'
                ? 'Compare e mude de plano. O pagamento ou ajuste é concluído na tela seguinte, com segurança.'
                : 'Escolha um plano. A contratação termina na tela de pagamento.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherPlans.map((p) => {
                const listC = catalogListPriceCents(p, selectedIntervalKey, contractedSeats);
                const isUpgrade = listC > mainDisplayPriceCents;
                const isCheaper = listC < mainDisplayPriceCents;
                const topBenefits = Array.isArray(p.benefits) ? p.benefits.slice(0, 3) : [];
                const checkoutLabel = isUpgrade
                  ? 'Fazer upgrade e pagar'
                  : isCheaper
                    ? 'Trocar plano e pagar'
                    : 'Trocar plano e confirmar';
                const changeLabel = isCheaper ? 'Trocar plano (sem pagamento agora)' : 'Trocar plano (só alocar)';
                return (
                  <div
                    key={p.id}
                    className="flex flex-col rounded-xl border border-border/80 bg-card p-4 shadow-sm gap-3"
                  >
                    <div>
                      <h3 className="text-lg font-semibold leading-tight">{p.name}</h3>
                      <p className="mt-2 text-2xl font-bold tabular-nums">
                        {formatPrice(listC)}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          / {INTERVALS.find((i) => i.key === selectedIntervalKey)?.label ?? 'ciclo'}
                        </span>
                      </p>
                    </div>
                    {p.description ? (
                      <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                    ) : null}
                    {topBenefits.length > 0 ? (
                      <ul className="space-y-1.5 text-sm">
                        {topBenefits.map((b, i) => (
                          <li key={i} className="flex gap-2">
                            <Check className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                            <span className="leading-snug">{b.label}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-auto flex flex-col gap-2 pt-1">
                      {canManage ? (
                        <>
                    <Button
                            type="button"
                            className="h-11 w-full gap-2"
                      disabled={saving}
                      onClick={() =>
                        navigate('/checkout?mode=renew', {
                          state: {
                            plan: {
                              id: p.id,
                              name: p.name,
                              plan_type: p.plan_type,
                              price_cents: p.price_cents,
                              interval_prices: p.interval_prices,
                              description: p.description,
                              benefits: p.benefits,
                            },
                            billingInterval: selectedIntervalKey,
                            usersCount: p.plan_type === 'custom' ? contractedSeats : undefined,
                          },
                        })
                      }
                    >
                            {checkoutLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 w-full"
                            disabled={saving}
                            onClick={() => changePlan(p.id)}
                          >
                            {changeLabel}
                    </Button>
                        </>
                      ) : (
                        <p className="rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
                          Apenas o administrador da conta pode trocar de plano.
                        </p>
                      )}
                  </div>
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar assinatura ao fim do período?</DialogTitle>
            <DialogDescription className="space-y-2 text-left">
              <span>
                Você mantém acesso até o fim do período atual
                {subscription?.current_period_end ? ` (${formatDate(subscription.current_period_end)})` : ''}. Não há
                cobrança proporcional de cancelamento neste fluxo; a renovação automática deixa de ocorrer após essa data.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Voltar
            </Button>
            <Button type="button" variant="destructive" disabled={cancelSubmitting} onClick={confirmCancelAtPeriodEnd}>
              {cancelSubmitting ? 'Confirmando…' : 'Confirmar cancelamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

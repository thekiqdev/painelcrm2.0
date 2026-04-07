import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/integrations/api/client';
import { toast } from 'sonner';
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
};

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
  pending_seat_addon_billing?: PendingSeatAddonBilling | null;
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
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
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

function billingIntervalLabelPt(key: string): string {
  const row = INTERVALS.find((i) => i.key === key);
  return row?.label ?? key;
}

/** Contratar mais assentos: pró-rata até o fim do ciclo atual, pago no checkout. Reduzir: próxima renovação, sem estorno. */
const SEATS_COMMERCIAL_SUMMARY =
  'Novos assentos exigem pagamento da diferença proporcional ao tempo restante do ciclo. Reduções entram na próxima cobrança, sem estorno.';

function billingReasonLabelPt(reason: string): string {
  const m: Record<string, string> = {
    plan_purchase: 'Contratação / plano',
    plan_upgrade: 'Upgrade de plano',
    plan_renewal: 'Renovação',
    manual_charge: 'Cobrança avulsa',
    seat_addon: 'Assentos adicionais (pró-rata)',
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
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [downgradeTarget, setDowngradeTarget] = useState(1);
  const [subscription, setSubscription] = useState<SaasSubscriptionPayload | null>(null);
  const [limitsUsers, setLimitsUsers] = useState<TenantUsersLimitsPayload | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [commercialBillings, setCommercialBillings] = useState<CommercialBillingHubRow[]>([]);
  const seatAddonPreviewSeq = useRef(0);

  const refreshAfterMutation = useCallback(async () => {
    const [resPlan, resSub, resLimits, resBill] = await Promise.all([
      apiClient.get<MyPlanResponse>('/api/me/tenant/plan'),
      apiClient.get<{ subscription: SaasSubscriptionPayload | null }>('/api/me/tenant/subscription'),
      apiClient.get<{ users: TenantUsersLimitsPayload }>('/api/me/tenant/limits'),
      apiClient.get<{ billings: CommercialBillingHubRow[] }>('/api/me/tenant/commercial-billings'),
    ]);
    if (resPlan.data && resPlan.details?.status !== 403) {
      setMyPlan(resPlan.data);
    }
    if (resSub.data) setSubscription(resSub.data.subscription ?? null);
    if (resLimits.data?.users) setLimitsUsers(resLimits.data.users);
    if (resBill.data?.billings) setCommercialBillings(resBill.data.billings);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlanAccessDenied(false);
    Promise.all([
      apiClient.get<MyPlanResponse>('/api/me/tenant/plan'),
      apiClient.get<{ subscription: SaasSubscriptionPayload | null }>('/api/me/tenant/subscription'),
      apiClient.get<{ users: TenantUsersLimitsPayload }>('/api/me/tenant/limits'),
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
    const state = buildCheckoutState();
    if (!state) return;
    navigate('/checkout', { state });
  }, [navigate, buildCheckoutState]);

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
    if (checkoutResumeEnabled) {
      goToCheckoutResume();
      return;
    }
    goToCheckoutWithPlan();
  }, [
    myPlan?.pending_billing?.billing_id,
    goOpenSaasBillingPay,
    goToCheckoutResume,
    goToCheckoutWithPlan,
  ]);

  const scrollToId = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const changePlan = async (planId: string) => {
    if (!myPlan || saving) return;
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
    const freshPreview = freshPreviewRes.data;

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

  const runScheduleDowngrade = async () => {
    if (!myPlan) return;
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

  const confirmCancelAtPeriodEnd = async () => {
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
            <Button type="button" variant="outline" onClick={() => navigate('/dashboard')}>
              Voltar ao painel
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
            <Button type="button" variant="outline" className="mt-4" onClick={() => navigate('/dashboard')}>
              Voltar ao painel
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
  const currentPriceCents =
    isCustom && priceRow ? priceRow.price_per_user_cents * contractedSeats : plan.price_cents;
  const otherPlans = allPlans.filter((p) => p.id !== plan.id);
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
    commercialMode === 'payment_pending';

  const statusBadge = (() => {
    switch (commercialMode) {
      case 'trial_active':
        return { label: 'Trial ativo', className: 'bg-sky-500/15 text-sky-800 dark:text-sky-200' };
      case 'trial_resume_required':
        return { label: 'Pagamento necessário', className: 'bg-amber-500/15 text-amber-900 dark:text-amber-100' };
      case 'payment_pending':
        return { label: 'Pagamento pendente', className: 'bg-amber-500/15 text-amber-900 dark:text-amber-100' };
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
            'Sua conta está ativa. Abaixo você pode trocar de plano, gerir assentos (plano por usuário) ou revisar benefícios.' +
            (nb ? ` ${nb.title}: ${nb.detail}` : periodFallback),
          primaryLabel: 'Trocar de plano',
          onPrimary: () => scrollToId('meu-plano-catalogo'),
          secondaryLabel: isCustom ? 'Gerir assentos' : undefined,
          onSecondary: isCustom ? () => scrollToId('meu-plano-usuarios-assentos') : undefined,
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

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meu plano</h1>
          <p className="text-muted-foreground">
            Acompanhe seu plano, renovação e equipe. Quando houver pagamento a concluir, você será direcionado à página
            segura de pagamento.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-medium ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>

      <Card className={hero.variant}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <HeroIcon className="h-6 w-6 shrink-0 text-primary" />
            {hero.title}
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">{hero.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" size="lg" className="gap-2" onClick={hero.onPrimary}>
            <CreditCard className="h-4 w-4" />
            {hero.primaryLabel}
          </Button>
          {hero.secondaryLabel && hero.onSecondary && (
            <Button type="button" size="lg" variant="outline" onClick={hero.onSecondary}>
              {hero.secondaryLabel}
            </Button>
          )}
        </CardContent>
      </Card>

      {showPendingDetailCard && (
        <Card className="border-amber-500/35 bg-amber-500/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Banknote className="h-5 w-5 text-amber-700 dark:text-amber-300" />
              {pendingBilling ? 'Detalhes da cobrança em aberto' : 'Próximo passo: pagamento'}
            </CardTitle>
            <CardDescription>
              Resumo da cobrança pendente. Para pagar com PIX, boleto ou cartão, use a opção de abrir a tela de pagamento
              abaixo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingBilling ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Valor</p>
                    <p className="font-semibold text-lg">{formatPrice(pendingBilling.amount_cents)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{billingStatusLabelPt(pendingBilling.status)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Forma de pagamento</p>
                    <p className="font-medium">{paymentMethodLabelPt(pendingBilling.payment_method)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Vencimento</p>
                    <p className="font-medium">
                      {pendingBilling.due_date ? formatDate(pendingBilling.due_date) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fatura</p>
                    <p className="font-medium">{pendingBilling.invoice_number ?? '—'}</p>
                  </div>
                </div>
                {pendingBilling.is_activated_billing && (
                  <p className="text-sm text-muted-foreground">
                    Esta cobrança está associada à ativação do seu plano atual.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Use o botão <strong>Concluir pagamento</strong> ou <strong>Ver link de pagamento</strong> no topo desta
                  página para abrir a tela de pagamento e finalizar com PIX, boleto ou cartão.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed bg-background/60 px-4 py-3 text-sm text-muted-foreground">
                <p>
                  Não há cobrança em aberto no momento. Se você acabou de contratar ou precisa retomar um pagamento, use{' '}
                  <strong>Concluir pagamento</strong> ou <strong>Ver link de pagamento</strong> acima.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="meu-plano-assinatura">
          <CardHeader>
            <CardTitle className="text-lg">Assinatura</CardTitle>
            <CardDescription>Plano ativo, valor da renovação e situação da sua conta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!subscription ? (
              isPostFirstPaidActivation ? (
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Seu plano está <strong className="text-foreground">ativo</strong> e vinculado ao ciclo atual. Os
                    detalhes da renovação (valor e próxima data) podem levar alguns instantes para aparecer aqui — tente
                    atualizar a página em breve.
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Assim que você concluir a contratação, verá aqui o plano, o valor da renovação e a próxima data de
                  cobrança. Em período de avaliação, isso aparece após a ativação do plano pago.
                </p>
              )
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {subscription.will_cancel_at_period_end ? (
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-100">
                      Cancelamento ao fim do período
                    </span>
                  ) : subscription.renewal_overdue ? (
                    <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                      Renovação a regularizar
                    </span>
                  ) : subscription.status === 'active' ? (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      Assinatura ativa
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{subscription.status}</span>
                  )}
                </div>
                <p>
                  <span className="text-muted-foreground">Plano contratado</span>
                  <br />
                  <span className="font-medium text-base">{subscription.plan_name ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Valor da renovação</span>
                  <br />
                  <span className="font-semibold text-lg">{formatPrice(subscription.amount_cents)}</span>
                  <span className="text-muted-foreground"> ({billingIntervalLabelPt(subscription.billing_interval)})</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Próxima cobrança</span>
                  <br />
                  <span className="font-medium">{formatDate(subscription.next_billing_date)}</span>
                </p>
                {subscription.will_cancel_at_period_end && (
                  <p className="rounded-md border border-amber-500/35 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
                    Não haverá nova cobrança após o fim do período atual. Você continua com acesso até essa data.
                  </p>
                )}
                {commercialMode === 'active' &&
                  subscription.status === 'active' &&
                  !subscription.cancel_at_period_end && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setCancelDialogOpen(true)}>
                      Cancelar ao fim do período
                    </Button>
                  )}
              </>
            )}
          </CardContent>
        </Card>

        <Card id="meu-plano-ciclo">
          <CardHeader>
            <CardTitle className="text-lg">Ciclo e próxima cobrança</CardTitle>
            <CardDescription>Período em que seu plano está vigente e quando ocorre a próxima renovação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {subscription ? (
              <>
                <div>
                  <p className="text-muted-foreground">Período atual</p>
                  <p className="font-medium">
                    {subscription.current_period_start && subscription.current_period_end
                      ? `${formatDate(subscription.current_period_start)} — ${formatDate(subscription.current_period_end)}`
                      : '—'}
                  </p>
                </div>
                {(() => {
                  const nb = nextBillingCopy(subscription);
                  return (
                    <div>
                      <p className="text-muted-foreground">{nb.title}</p>
                      <p className="font-medium">{nb.detail}</p>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  Se aparecer uma cobrança pendente nesta página, conclua o pagamento na etapa seguinte para manter o plano
                  em dia.
                </p>
              </>
            ) : (
              <>
                <div>
                  <p className="text-muted-foreground">Período vigente</p>
                  <p className="font-medium">
                    {myPlan.plan_period_start && myPlan.plan_period_end
                      ? `${formatDate(myPlan.plan_period_start)} — ${formatDate(myPlan.plan_period_end)}`
                      : planPeriodEnd
                        ? `Até ${formatDate(planPeriodEnd)}`
                        : '—'}
                  </p>
                </div>
                <p className="text-muted-foreground">
                  {isPostFirstPaidActivation
                    ? 'Em breve este bloco mostrará também o calendário de renovação junto com os dados da assinatura ao lado.'
                    : 'Após a confirmação do pagamento, você verá aqui o calendário completo de renovação.'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="meu-plano-usuarios-assentos">
        <CardHeader>
          <CardTitle>Usuários e assentos</CardTitle>
          <CardDescription>
            {SEATS_COMMERCIAL_SUMMARY} Não é possível alterar a quantidade livremente no mesmo ciclo para pagar menos na
            renovação: redução só vale na próxima cobrança; aumento exige pagamento da diferença.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {limitsUsers != null ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border bg-muted/30 px-4 py-3">
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Usuários em uso</p>
                <p className="text-lg font-semibold">
                  {limitsUsers.current}
                  {limitsUsers.limit != null ? ` / ${limitsUsers.limit}` : ''}{' '}
                  {limitsUsers.limit === 1 && limitsUsers.current === 1 ? 'usuário' : 'usuários'}
                </p>
                {limitsUsers.limit == null && (
                  <p className="text-xs text-muted-foreground mt-1">Sem teto numérico neste plano.</p>
                )}
              </div>
              {isCustom && (
                <div className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Assentos contratados (vigente)</p>
                  <p className="text-lg font-semibold">{contractedSeats}</p>
                  <p className="text-xs text-muted-foreground mt-1">
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
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-amber-950 dark:text-amber-100 font-medium">
                    Redução agendada
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {contractedSeats} → {myPlan.max_users_scheduled_next_cycle} assentos
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sem estorno. Passa a valer na próxima cobrança ({subscription?.next_billing_date ? formatDate(subscription.next_billing_date) : 'data da renovação'}).
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-dashed px-4 py-3 sm:col-span-2 lg:col-span-1">
                <p className="text-xs font-medium text-foreground">Resumo comercial</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{SEATS_COMMERCIAL_SUMMARY}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Limites de uso não disponíveis neste momento.</p>
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
              <Button
                type="button"
                size="sm"
                className="mt-3"
                variant="secondary"
                onClick={() => goOpenSaasBillingPay(myPlan.pending_seat_addon_billing!.billing_id)}
              >
                Continuar para pagamento
              </Button>
            </div>
          )}

          {!isCustom && (
            <p className="text-muted-foreground">
              Seu plano tem limite fixo no catálogo. Para mais lugares, faça upgrade — a contratação com pagamento é feita
              na tela de pagamento.
            </p>
          )}

          {isCustom && commercialMode === 'active' && (
            <div className="space-y-4 pt-2 border-t">
              <div className="flex flex-wrap gap-2 items-start">
                <Button
                  type="button"
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
                  {seatAddonInlineExpanded ? 'Fechar' : 'Contratar novos usuários'}
                </Button>
                {seatAddonCapacityReached && (
                  <p className="text-xs text-muted-foreground w-full">
                    Seu plano atual já atingiu o limite de {planMaxUsers} assento{planMaxUsers === 1 ? '' : 's'}.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || !!myPlan.pending_seat_addon_billing || !canScheduleSeatDowngrade}
                  onClick={() => {
                    const def = Math.max(limitsUsers?.current ?? 1, contractedSeats - 1);
                    setDowngradeTarget(def);
                    setDowngradeOpen(true);
                  }}
                >
                  Reduzir usuários no próximo ciclo
                </Button>
                {!canScheduleSeatDowngrade && (
                  <p className="text-xs text-muted-foreground w-full">
                    Redução agendada só é possível quando há mais assentos contratados do que usuários em uso (ou remova
                    usuários antes).
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

      <Card>
        <CardHeader>
          <CardTitle>Ações rápidas</CardTitle>
          <CardDescription>Atalhos para o fluxo comercial sem sair desta central.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {commercialMode === 'trial_resume_required' && (
            <Button type="button" variant="secondary" className="gap-2" onClick={goToPaymentOrResume}>
              Concluir pagamento
            </Button>
          )}
          {commercialMode === 'payment_pending' && (
            <Button type="button" variant="secondary" className="gap-2" onClick={goToPaymentOrResume}>
              Ver link de pagamento
            </Button>
          )}
          <Button type="button" variant="outline" className="gap-2" onClick={() => scrollToId('meu-plano-assinatura')}>
            Ver assinatura e ciclo
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => scrollToId('meu-plano-catalogo')}>
            <LayoutGrid className="h-4 w-4" />
            Catálogo de planos
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => scrollToId('meu-plano-usuarios-assentos')}>
            <Users className="h-4 w-4" />
            Usuários e assentos
          </Button>
        </CardContent>
      </Card>

      <Card id="meu-plano-detalhes">
        <CardHeader>
          <CardTitle>Plano atual</CardTitle>
          <CardDescription>
            {plan.name} — benefícios e preço de referência. Assentos e ajuste de lugares ficam na seção{' '}
            <strong>Usuários e assentos</strong>; cobranças emitidas, em <strong>Cobranças</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Faturamento</span>
              <p className="font-medium">{billingIntervalLabel}</p>
            </div>
            {subscription?.next_billing_date && commercialMode === 'active' && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Próxima cobrança (recorrência)</span>
                  <p className="font-medium">{formatDate(subscription.next_billing_date)}</p>
                </div>
              </div>
            )}
            {!subscription?.next_billing_date && planPeriodEnd && commercialMode === 'active' && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-muted-foreground">Referência de período (conta)</span>
                  <p className="font-medium">{formatDate(planPeriodEnd)}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showPlanAsGratis ? (
              <span className="text-2xl font-bold text-green-600">Grátis</span>
            ) : (
              <span className="text-2xl font-bold">
                {formatPrice(
                  subscription != null && subscription.amount_cents > 0
                    ? subscription.amount_cents
                    : currentPriceCents
                )}
              </span>
            )}
            {showPlanAsGratis && myPlan.trial_ends_at && commercialMode === 'trial_active' && (
              <span className="text-sm text-muted-foreground">até {formatDate(myPlan.trial_ends_at)}</span>
            )}
            {isPostFirstPaidActivation && plan.is_free && (
              <span className="text-sm text-muted-foreground">
                Plano contratado (catálogo pode marcar avaliação gratuita; sua conta está em ciclo pago).
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {Array.isArray(plan.benefits) &&
              plan.benefits.map((b, i) => {
                const IconC = b.icon ? BENEFIT_ICON_MAP[b.icon] ?? Check : Check;
                return (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <IconC className="h-4 w-4 shrink-0 text-primary" />
                    {b.label}
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>

      <Card id="meu-plano-cobrancas">
        <CardHeader>
          <CardTitle>Cobranças</CardTitle>
          <CardDescription>
            Histórico comercial: uma linha por fatura principal emitida para a conta. Tentativas técnicas de pagamento
            (vários PIX/boletos) não são listadas separadamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {commercialBillings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobrança comercial registrada ainda para esta conta.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th className="p-3 font-medium">Período / referência</th>
                    <th className="p-3 font-medium">Tipo</th>
                    <th className="p-3 font-medium">Valor</th>
                    <th className="p-3 font-medium">Vencimento</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Forma (efetiva)</th>
                    <th className="p-3 font-medium text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {commercialBillings.map((b) => {
                    const canReopenGateway =
                      ['pending', 'waiting_payment', 'processing'].includes(b.status) && b.has_gateway_reference;
                    const openCommercially = ['pending', 'waiting_payment', 'processing', 'overdue'].includes(b.status);
                    return (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="p-3 align-top">
                          <div className="font-medium">{competenceLineForBilling(b)}</div>
                          {b.plan_name_snapshot && (
                            <div className="text-xs text-muted-foreground">{b.plan_name_snapshot}</div>
                          )}
                          {b.invoice_number && (
                            <div className="text-xs text-muted-foreground font-mono">{b.invoice_number}</div>
                          )}
                        </td>
                        <td className="p-3 align-top">{billingReasonLabelPt(b.billing_reason)}</td>
                        <td className="p-3 align-top font-medium">{formatPrice(b.amount_cents)}</td>
                        <td className="p-3 align-top">{formatDate(b.due_date)}</td>
                        <td className="p-3 align-top">{billingStatusLabelPt(b.status)}</td>
                        <td className="p-3 align-top">{paymentMethodLabelPt(b.effective_payment_method)}</td>
                        <td className="p-3 align-top text-right">
                          {canReopenGateway && (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => goOpenSaasBillingPay(b.id)}
                            >
                              Pagar agora
                            </Button>
                          )}
                          {openCommercially && !canReopenGateway && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => goOpenSaasBillingPay(b.id)}
                            >
                              Abrir pagamento
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {otherPlans.length > 0 && (
        <Card id="meu-plano-catalogo">
          <CardHeader>
            <CardTitle>Outros planos</CardTitle>
            <CardDescription>
              {commercialMode === 'active'
                ? 'Troque de plano — a contratação ou upgrade é finalizada na tela de pagamento.'
                : 'Escolha um plano — a contratação é finalizada na tela de pagamento.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherPlans.map((p) => (
                <div key={p.id} className="flex flex-col rounded-lg border p-4 gap-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.description && <p className="text-sm text-muted-foreground line-clamp-2">{p.description}</p>}
                  <div className="mt-auto pt-2 flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1"
                      disabled={saving}
                      onClick={() =>
                        navigate('/checkout', {
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
                            billingInterval: (INTERVALS[intervalIdx] ?? INTERVALS[0]).key,
                            usersCount: p.plan_type === 'custom' ? contractedSeats : undefined,
                          },
                        })
                      }
                    >
                      Assinar (pagamento)
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full" disabled={saving} onClick={() => changePlan(p.id)}>
                      Trocar plano (sem pagamento agora)
                    </Button>
                  </div>
                </div>
              ))}
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

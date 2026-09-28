import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { PixAutomaticConsentSwitch, isPixAutomaticDefaultOnBillingReason } from '@/components/billing/PixAutomaticConsentSwitch';
import {
  getMyPixAutomatic,
  enableMyPixAutomatic,
  disableMyPixAutomatic,
  type PixAutomaticPreference,
} from '@/services/tenantPixAutomatic';
import {
  resolvePixAutomaticSwitchOn,
  usePixAutomaticAutoEnable,
} from '@/lib/pixAutomaticCheckoutUx';
import { formatMoneyBRL } from '@/lib/planCheckoutDisplay';
import { formatCpfCnpjDigits } from '@/lib/brazilInputMasks';
import { isValidCpfOrCnpj } from '@/utils/cpfCnpj';
import {
  Loader2,
  Copy,
  ExternalLink,
  CreditCard,
  QrCode,
  Banknote,
  ArrowLeft,
  Check,
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

const LOG_PREFIX = '[InternalBillingCheckout]';

function devLog(msg: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  if (data) console.log(LOG_PREFIX, msg, data);
  else console.log(LOG_PREFIX, msg);
}

function formatPrice(cents: number): string {
  return formatMoneyBRL(cents);
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

const PAYMENT_METHODS = [
  { value: 'PIX' as const, label: 'PIX', icon: QrCode, description: 'Pagamento instantâneo via PIX' },
  { value: 'BOLETO' as const, label: 'Boleto', icon: Banknote, description: 'Pague via boleto bancário' },
  {
    value: 'CREDIT_CARD' as const,
    label: 'Cartão de crédito',
    icon: CreditCard,
    description: 'Pague com cartão de crédito',
  },
];

interface PlanCheckoutPendingApi {
  pending: SaasBillingPurchaseResult | null;
}

interface BillingStatusResponse {
  billing_id: string;
  status: string;
  tenant_status: string | null;
}

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

interface InstanceAddonPreviewResponse {
  current_contracted: number;
  new_total: number;
  billing_interval: string;
  breakdown: {
    period_start: string;
    period_end: string;
    remaining_period_days: number;
    price_per_instance_full_period_cents: number;
    additional_instances: number;
    amount_cents: number;
  };
}

interface CheckoutContextLite {
  cpf_cnpj: string;
  email: string;
  responsible_name: string;
  company_name: string;
}

const BILLING_INTERVAL_LABEL: Record<string, string> = {
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  semi_annual: 'Semestral',
  yearly: 'Anual',
};

function billingReasonLabel(reason: string): string {
  switch (reason) {
    case 'seat_addon':
      return 'Assentos adicionais';
    case 'instance_addon':
      return 'Conexões WhatsApp adicionais';
    case 'plan_upgrade':
      return 'Upgrade de plano';
    case 'plan_renewal':
      return 'Renovação';
    case 'manual_charge':
      return 'Cobrança interna';
    case 'plan_purchase':
    default:
      return 'Contratação / plano';
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success('Copiado!'),
    () => toast.error('Não foi possível copiar')
  );
}

function toastPrepareError(code: string | undefined, fallback: string) {
  if (code === 'CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD') {
    toast.error('CPF ou CNPJ válido é obrigatório para este método de pagamento.');
    return;
  }
  toast.error(fallback);
}

/** Alinhado ao GET /api/me/tenant/plan (403 = não é administrador principal). */
type CommerceGateState = 'pending' | 'non_primary' | 'ready' | 'gate_failed';

export default function InternalBillingCheckout() {
  const { billingId: billingIdParam } = useParams<{ billingId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshUser } = useAuth();

  const billingId = billingIdParam?.trim() ?? '';

  const [commerceGate, setCommerceGate] = useState<CommerceGateState>('pending');

  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ok' | 'unavailable' | 'error'>('idle');
  const [hubRow, setHubRow] = useState<CommercialBillingHubRow | null>(null);
  const [result, setResult] = useState<SaasBillingPurchaseResult | null>(null);
  const [seatPreview, setSeatPreview] = useState<SeatAddonPreviewResponse | null>(null);
  const [instancePreview, setInstancePreview] = useState<InstanceAddonPreviewResponse | null>(null);
  const [billingCpf, setBillingCpf] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PlanPurchasePm>('PIX');
  const [pixAutomatic, setPixAutomatic] = useState<PixAutomaticPreference | null>(null);
  const [pixAutoUserOptedOff, setPixAutoUserOptedOff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [payingCard, setPayingCard] = useState(false);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [planCardForm, setPlanCardForm] = useState<InlineCreditCardFormState>(() => createEmptyInlineCreditCardForm());
  /** CPF/CNPJ válido vindo de `GET /api/me/tenant/checkout-context` (tenant); define se pedimos digitação nesta tela. */
  const [savedTenantDocValid, setSavedTenantDocValid] = useState(false);
  /** Auto-prepare PIX na primeira carga (conta já apta). */
  const [autoInitialPixStatus, setAutoInitialPixStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentFinalizeStartedRef = useRef(false);
  const lastPolledBillingIdRef = useRef<string | null>(null);
  const prepareInFlightRef = useRef(false);
  const autoPixStartedForBillingRef = useRef<string | null>(null);

  const hasChargeReady = Boolean(result?.billing_id);

  const ensureFreshSeatAddonPreview = useCallback(async (): Promise<boolean> => {
    const additional = result?.seat_addon_additional_seats ?? null;
    if (result?.billing_reason !== 'seat_addon' || additional == null || additional < 1) {
      return true;
    }
    const res = await apiClient.post<SeatAddonPreviewResponse>('/api/me/tenant/seat-addon/preview', {
      additional_seats: additional,
    });
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível recalcular o valor proporcional. Tente novamente.');
      return false;
    }
    if (result.billing_id && Math.abs(res.data.breakdown.amount_cents - result.amount_cents) > 2) {
      toast.error(
        'O valor proporcional mudou em relação a esta cobrança. Volte ao Meu plano e gere novamente a cobrança de assentos.'
      );
      return false;
    }
    return true;
  }, [result]);

  const ensureFreshInstanceAddonPreview = useCallback(async (): Promise<boolean> => {
    const additional = result?.instance_addon_additional_instances ?? null;
    if (result?.billing_reason !== 'instance_addon' || additional == null || additional < 1) {
      return true;
    }
    const res = await apiClient.post<InstanceAddonPreviewResponse>('/api/me/tenant/instance-addon/preview', {
      additional_instances: additional,
    });
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Não foi possível recalcular o valor proporcional. Tente novamente.');
      return false;
    }
    if (result.billing_id && Math.abs(res.data.breakdown.amount_cents - result.amount_cents) > 2) {
      toast.error(
        'O valor proporcional mudou em relação a esta cobrança. Volte ao Meu plano e gere novamente a cobrança de conexões.'
      );
      return false;
    }
    return true;
  }, [result]);

  /**
   * 1) GET /api/me/tenant/plan — mesma regra do Meu plano (só primary recebe 200).
   * 2) Só então pending + hub + preview de assentos.
   */
  useEffect(() => {
    if (authLoading || !user?.id) return;
    if (!billingId || !isUuid(billingId)) return;

    let cancelled = false;
    setCommerceGate('pending');
    setLoadState('idle');

    void (async () => {
      const planRes = await apiClient.get('/api/me/tenant/plan');
      if (cancelled) return;

      if (planRes.details?.status === 403) {
        setCommerceGate('non_primary');
        devLog('commerce_gate_non_primary', { billing_id: billingId });
        return;
      }

      if (planRes.error) {
        setCommerceGate('gate_failed');
        setLoadState('error');
        toast.error(planRes.error);
        return;
      }

      setCommerceGate('ready');
      setLoadState('loading');
      setBillingCpf('');
      setPlanCardForm(createEmptyInlineCreditCardForm());
      setPaymentMethod('PIX');
      setSavedTenantDocValid(false);
      setAutoInitialPixStatus('idle');
      autoPixStartedForBillingRef.current = null;

      const [pendingRes, hubRes, ctxRes] = await Promise.all([
        apiClient.get<PlanCheckoutPendingApi>(
          `/api/me/tenant/plan-checkout-pending?billing_id=${encodeURIComponent(billingId)}`
        ),
        apiClient.get<{ billings: CommercialBillingHubRow[] }>('/api/me/tenant/commercial-billings'),
        /** `purpose=renew` cobre active, payment_pending, trial, etc. (CPF/dados da empresa no hub). */
        apiClient.get<CheckoutContextLite>('/api/me/tenant/checkout-context?purpose=renew'),
      ]);

      if (cancelled) return;

      if (pendingRes.error) {
        setLoadState('error');
        toast.error(pendingRes.error);
        return;
      }

      const pending = pendingRes.data?.pending ?? null;
      const hubList = hubRes.data?.billings ?? [];
      const hub = hubList.find((b) => b.id === billingId) ?? null;
      setHubRow(hub);

      if (!pending) {
        setResult(null);
        setLoadState('unavailable');
        devLog('pending_null', { billing_id: billingId, hub_status: hub?.status ?? null });
        return;
      }

      setResult(
        buildSaasBillingDisplayResult({
          ...pending,
          tenant_id: pending.tenant_id || user.tenant_id || '',
        })
      );

      if (pending.billing_reason === 'seat_addon' && pending.seat_addon_additional_seats != null) {
        const prev = await apiClient.post<SeatAddonPreviewResponse>('/api/me/tenant/seat-addon/preview', {
          additional_seats: pending.seat_addon_additional_seats,
        });
        if (!cancelled && prev.data) {
          setSeatPreview(prev.data);
        }
      }

      if (pending.billing_reason === 'instance_addon' && pending.instance_addon_additional_instances != null) {
        const prev = await apiClient.post<InstanceAddonPreviewResponse>('/api/me/tenant/instance-addon/preview', {
          additional_instances: pending.instance_addon_additional_instances,
        });
        if (!cancelled && prev.data) {
          setInstancePreview(prev.data);
        }
      }

      if (!cancelled && !ctxRes.error && ctxRes.data) {
        const d = ctxRes.data;
        const cpfDigits = String(d.cpf_cnpj ?? '').replace(/\D/g, '');
        setSavedTenantDocValid(isValidCpfOrCnpj(cpfDigits));
        if (cpfDigits) {
          setBillingCpf(formatCpfCnpjDigits(cpfDigits));
        }
        setPlanCardForm((f) => ({
          ...f,
          ch_name: f.ch_name || d.responsible_name?.trim() || '',
          ch_email: f.ch_email || d.email?.trim() || '',
          ch_cpf_cnpj: f.ch_cpf_cnpj || cpfDigits || f.ch_cpf_cnpj,
        }));
      } else if (!cancelled) {
        setSavedTenantDocValid(false);
      }

      setLoadState('ok');
      devLog('loaded', {
        billing_id: pending.billing_id,
        billing_reason: pending.billing_reason,
        amount_cents: pending.amount_cents,
        status: pending.status,
        summarySource:
          pending.billing_reason === 'seat_addon' && pending.seat_addon_additional_seats != null
            ? 'billing+seat_preview (async)'
            : pending.billing_reason === 'instance_addon' &&
                pending.instance_addon_additional_instances != null
              ? 'billing+instance_preview (async)'
              : hub
                ? 'billing+commercial_hub_row'
                : 'billing_pending_only',
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, user?.tenant_id, billingId]);

  const finalizePaidAndRedirect = useCallback(async () => {
    if (paymentFinalizeStartedRef.current) return;
    paymentFinalizeStartedRef.current = true;
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    pollingRef.current = null;
    timeoutRef.current = null;

    await refreshUser().catch(() => {});
    setPaymentConfirmed(true);
    devLog('redirect_scheduled', {
      billing_id: billingId,
      trigger: 'billing.status===paid',
      destination: '/meu-plano',
    });
    toast.success('Pagamento confirmado!');
    setTimeout(() => {
      navigate('/meu-plano', { replace: true });
    }, 1500);
  }, [billingId, navigate, refreshUser]);

  useEffect(() => {
    const id = result?.billing_id;
    if (!id || paymentConfirmed || loadState !== 'ok') return;
    if (lastPolledBillingIdRef.current !== id) {
      lastPolledBillingIdRef.current = id;
      paymentFinalizeStartedRef.current = false;
    }

    const POLL_MS = 2500;
    const POLL_TIMEOUT_MS = 10 * 60 * 1000;

    const checkStatus = async () => {
      const res = await apiClient.get<BillingStatusResponse>(`/api/billing/${id}/status`);
      if (res.error || !res.data) return;
      const { status } = res.data;
      if (status === 'paid') {
        await finalizePaidAndRedirect();
      }
    };

    pollingRef.current = setInterval(checkStatus, POLL_MS);
    void checkStatus();

    timeoutRef.current = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
    }, POLL_TIMEOUT_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      pollingRef.current = null;
      timeoutRef.current = null;
    };
  }, [result?.billing_id, paymentConfirmed, loadState, finalizePaidAndRedirect]);

  useEffect(() => {
    const reason = result?.billing_reason;
    if (reason === 'seat_addon' || reason === 'instance_addon') {
      setPixAutomatic(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getMyPixAutomatic();
      if (cancelled) return;
      if (res.data?.pix_automatic) {
        setPixAutomatic(res.data.pix_automatic);
        if (res.data.pix_automatic.user_opted_off) setPixAutoUserOptedOff(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.billing_id, result?.billing_reason, loadState]);

  const pixAutoDefaultOn = isPixAutomaticDefaultOnBillingReason(result?.billing_reason);
  const pixSwitchOn = resolvePixAutomaticSwitchOn({
    pref: pixAutomatic,
    userOptedOff: pixAutoUserOptedOff,
    defaultOn: pixAutoDefaultOn,
  });

  const enablePixAutoOnce = useCallback(async (): Promise<boolean> => {
    const bid = billingId || result?.billing_id;
    if (!bid) return false;
    const res = await enableMyPixAutomatic(bid);
    if (res.error) {
      // Conta Asaas sem produto / etc. — não spammar toast no auto; usuário ainda vê switch ON e pode tentar de novo.
      console.warn('[InternalBillingCheckout] auto-enable Pix Automático', res.error, res.code);
      return false;
    }
    setPaymentMethod('PIX');
    const pref = await getMyPixAutomatic();
    if (pref.data?.pix_automatic) setPixAutomatic(pref.data.pix_automatic);
    const qrImage = res.data.pix_qr_code ?? pref.data?.pix_automatic?.qr_image ?? null;
    const qrPayload = res.data.pix_copy_paste ?? pref.data?.pix_automatic?.qr_payload ?? null;
    if (qrImage || qrPayload) {
      setResult((prev) =>
        prev
          ? {
              ...prev,
              payment_method: 'PIX',
              pix_qr_code: qrImage ?? prev.pix_qr_code,
              pix_copy_paste: qrPayload ?? prev.pix_copy_paste,
            }
          : prev
      );
    }
    return true;
  }, [billingId, result?.billing_id]);

  const { enabling: pixAutoEnabling } = usePixAutomaticAutoEnable({
    enabled: pixAutoDefaultOn && loadState === 'ok' && !paymentConfirmed,
    pref: pixAutomatic,
    userOptedOff: pixAutoUserOptedOff,
    canEnable: Boolean(billingId || result?.billing_id) && Boolean(pixAutomatic?.available),
    enableFn: enablePixAutoOnce,
  });

  const runPreparePayment = useCallback(
    async (method: PlanPurchasePm, options?: { silent?: boolean }): Promise<boolean> => {
      if (!result?.billing_id) return false;
      if (prepareInFlightRef.current) return false;

      setCpfError('');
      const docDigits = billingCpf.replace(/\D/g, '');
      if (method === 'PIX' && !isValidCpfOrCnpj(docDigits)) {
        setCpfError('Informe um CPF ou CNPJ válido para pagamento PIX.');
        if (!options?.silent) {
          toastPrepareError('CPF_CNPJ_REQUIRED_FOR_PAYMENT_METHOD', 'CPF/CNPJ inválido.');
        }
        return false;
      }

      const pmOnResult = normalizePlanPurchasePaymentMethod(result.payment_method);
      if (
        method === paymentMethod &&
        (!pmOnResult || pmOnResult === method) &&
        hasRenderablePayloadForMethod(result, method)
      ) {
        return true;
      }

      if (result.billing_reason === 'seat_addon') {
        const ok = await ensureFreshSeatAddonPreview();
        if (!ok) return false;
      }
      if (result.billing_reason === 'instance_addon') {
        const ok = await ensureFreshInstanceAddonPreview();
        if (!ok) return false;
      }

      setPaymentMethod(method);
      prepareInFlightRef.current = true;
      setLoading(true);
      try {
        const prep = await apiClient.post<SaasBillingPurchaseResult>('/api/me/tenant/plan-checkout-prepare-payment', {
          billing_id: result.billing_id,
          payment_method: method,
        });
        if (prep.error) {
          if (!options?.silent) {
            toastPrepareError(prep.code, prep.error);
          } else {
            toast.error(prep.error);
          }
          if (prep.field === 'cpf_cnpj') {
            setCpfError(prep.error);
          }
          return false;
        }
        if (prep.data) {
          const p = prep.data;
          setResult((prev) =>
            buildSaasBillingDisplayResult(p, {
              tenant_id: p.tenant_id || user?.tenant_id || '',
              billing_reason: p.billing_reason ?? prev?.billing_reason,
              seat_addon_additional_seats: p.seat_addon_additional_seats ?? prev?.seat_addon_additional_seats,
              instance_addon_additional_instances:
                p.instance_addon_additional_instances ?? prev?.instance_addon_additional_instances,
            })
          );
          const apiPm = normalizePlanPurchasePaymentMethod(p.payment_method);
          if (apiPm && !options?.silent) {
            setPaymentMethod(apiPm);
          }
          if (!options?.silent) {
            toast.success('Pagamento preparado. Siga as instruções abaixo.');
          }
          devLog('prepare_payment_ok', {
            billing_id: result.billing_id,
            method,
            amount_cents: prep.data.amount_cents,
          });
          return true;
        }
        return false;
      } finally {
        setLoading(false);
        prepareInFlightRef.current = false;
      }
    },
    [result, billingCpf, paymentMethod, ensureFreshSeatAddonPreview, ensureFreshInstanceAddonPreview, user?.tenant_id]
  );

  useEffect(() => {
    if (loadState !== 'ok' || paymentConfirmed || !result?.billing_id) return;
    if (paymentMethod !== 'PIX') return;
    if (!savedTenantDocValid) return;

    if (hasRenderablePayloadForMethod(result, 'PIX')) {
      setAutoInitialPixStatus('success');
      return;
    }

    const bid = result.billing_id;
    if (autoPixStartedForBillingRef.current === bid) return;

    autoPixStartedForBillingRef.current = bid;
    setAutoInitialPixStatus('running');

    void (async () => {
      const ok = await runPreparePayment('PIX', { silent: true });
      setAutoInitialPixStatus(ok ? 'success' : 'failed');
    })();
  }, [loadState, paymentConfirmed, result, paymentMethod, savedTenantDocValid, runPreparePayment]);

  const handlePayWithCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result?.billing_id || payingCard) return;
    if (!result.inline_pay_token && !user?.tenant_id) {
      toast.error('Atualize a página e gere a cobrança novamente para liberar o pagamento com cartão.');
      return;
    }
    if (result.billing_reason === 'seat_addon') {
      const ok = await ensureFreshSeatAddonPreview();
      if (!ok) return;
    }
    if (result.billing_reason === 'instance_addon') {
      const ok = await ensureFreshInstanceAddonPreview();
      if (!ok) return;
    }

    setPayingCard(true);
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

      const res = await apiClient.post<{
        ok?: boolean;
        billing_status?: string;
        error?: string;
        code?: string;
      }>(`/api/billing/${result.billing_id}/pay-with-card`, body);

      if (res.error) {
        for (let i = 0; i < 4; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 1200));
          const st = await apiClient.get<BillingStatusResponse>(`/api/billing/${result.billing_id}/status`);
          if (st.data?.status === 'paid') {
            await finalizePaidAndRedirect();
            return;
          }
        }
        toast.error(res.error);
        return;
      }

      if (res.data?.ok && res.data.billing_status === 'paid') {
        await finalizePaidAndRedirect();
        return;
      }
      if (res.data?.ok) {
        toast.success('Pagamento enviado. Aguardando confirmação…');
        const st = await apiClient.get<BillingStatusResponse>(`/api/billing/${result.billing_id}/status`);
        if (st.data?.status === 'paid') {
          await finalizePaidAndRedirect();
        }
      }
    } finally {
      setPayingCard(false);
    }
  };

  if (authLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <p className="text-muted-foreground">Faça login para acessar o pagamento.</p>
        <Button className="mt-4" onClick={() => navigate('/login', { replace: true })}>
          Ir para login
        </Button>
      </div>
    );
  }

  if (!billingId || !isUuid(billingId)) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Cobrança inválida</h1>
        <p className="text-sm text-muted-foreground">O identificador da cobrança na URL não é válido.</p>
        <Button variant="outline" onClick={() => navigate('/meu-plano')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao Meu plano
        </Button>
      </div>
    );
  }

  if (commerceGate === 'pending') {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verificando permissões…</p>
      </div>
    );
  }

  if (commerceGate === 'non_primary') {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/meu-plano')}>
          <ArrowLeft className="h-4 w-4" />
          Meu plano
        </Button>
        <Card className="border-muted">
          <CardHeader>
            <CardTitle className="text-lg">Pagamento da conta</CardTitle>
            <CardDescription>
              Assim como na central Meu plano, apenas o <strong>administrador principal</strong> da conta (primeiro
              usuário criado) pode concluir pagamentos e alterar métodos de cobrança interna.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Sua sessão não tem permissão para finalizar esta cobrança. Peça ao administrador principal que acesse o{' '}
              <strong>Meu plano</strong> e use &quot;Pagar agora&quot; ou &quot;Concluir pagamento&quot;, ou envie a ele
              o link desta página.
            </p>
            <Button type="button" onClick={() => navigate('/meu-plano')}>
              Voltar ao Meu plano
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (commerceGate === 'gate_failed') {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Não foi possível continuar</h1>
        <p className="text-sm text-muted-foreground">
          Não conseguimos validar seu acesso comercial. Tente de novo ou volte ao Meu plano.
        </p>
        <Button variant="outline" onClick={() => navigate('/meu-plano')}>
          Voltar ao Meu plano
        </Button>
      </div>
    );
  }

  if (loadState === 'loading' || loadState === 'idle') {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando cobrança…</p>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Erro ao carregar</h1>
        <p className="text-sm text-muted-foreground">Não foi possível carregar os dados. Tente novamente.</p>
        <Button variant="outline" onClick={() => navigate('/meu-plano')}>
          Voltar ao Meu plano
        </Button>
      </div>
    );
  }

  if (loadState === 'unavailable') {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4">
        <h1 className="text-xl font-semibold">Cobrança indisponível para pagamento online</h1>
        <p className="text-sm text-muted-foreground">
          Esta cobrança não pode ser paga por aqui no momento (status incompatível, sem retorno do gateway ou método não
          disponível). Volte ao Meu plano para gerar uma nova cobrança ou falar com o suporte.
        </p>
        <Button onClick={() => navigate('/meu-plano')}>Voltar ao Meu plano</Button>
      </div>
    );
  }

  const reason = result?.billing_reason ?? hubRow?.billing_reason ?? 'plan_purchase';
  const title = billingReasonLabel(reason);

  const needPreparePayload =
    hasChargeReady &&
    !paymentConfirmed &&
    !hasRenderablePayloadForMethod(result!, paymentMethod);

  const canGenerate =
    needPreparePayload && (paymentMethod !== 'PIX' || isValidCpfOrCnpj(billingCpf.replace(/\D/g, '')));

  const showTenantDocInput = needPreparePayload && !savedTenantDocValid;

  const showManualPrepareButton =
    needPreparePayload &&
    !loading &&
    (savedTenantDocValid
      ? paymentMethod !== 'PIX' || autoInitialPixStatus === 'failed'
      : canGenerate);

  const manualPrepareButtonLabel =
    savedTenantDocValid && paymentMethod === 'PIX' && autoInitialPixStatus === 'failed'
      ? 'Tentar novamente'
      : 'Gerar dados de pagamento';

  const hideStalePrepareHint =
    (savedTenantDocValid && paymentMethod === 'PIX' && (autoInitialPixStatus === 'running' || autoInitialPixStatus === 'idle')) ||
    showTenantDocInput ||
    showManualPrepareButton;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/meu-plano')}>
          <ArrowLeft className="h-4 w-4" />
          Meu plano
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>
            Cobrança interna da sua conta — valor e dados abaixo são desta fatura específica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resumo por billing_reason */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Valor a pagar agora</span>
              <span className="font-semibold text-lg">{formatPrice(result!.amount_cents)}</span>
            </div>
            {hubRow && (
              <>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Vencimento</span>
                  <span>{formatDate(hubRow.due_date)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Status na conta</span>
                  <span className="capitalize">{hubRow.status.replace(/_/g, ' ')}</span>
                </div>
              </>
            )}
            {reason === 'seat_addon' && seatPreview && (
              <>
                <div className="border-t pt-3 mt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detalhe dos assentos</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Assentos hoje</span>
                    <span>{seatPreview.current_contracted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Novos assentos</span>
                    <span>+{seatPreview.breakdown.additional_seats}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total após pagamento</span>
                    <span className="font-medium">{seatPreview.new_total} assentos</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Próximos ciclos (referência)</span>
                    <span>
                      {formatPrice(seatPreview.new_total * seatPreview.breakdown.price_per_user_full_period_cents)} /{' '}
                      {BILLING_INTERVAL_LABEL[seatPreview.billing_interval] ?? seatPreview.billing_interval}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ciclo: {seatPreview.breakdown.period_start} → {seatPreview.breakdown.period_end} ·{' '}
                    {seatPreview.breakdown.remaining_period_days} dias restantes neste período
                  </p>
                </div>
              </>
            )}
            {reason === 'instance_addon' && instancePreview && (
              <>
                <div className="border-t pt-3 mt-2 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Detalhe das conexões WhatsApp
                  </p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Conexões contratadas hoje</span>
                    <span>{instancePreview.current_contracted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Novas conexões</span>
                    <span>+{instancePreview.breakdown.additional_instances}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total após pagamento</span>
                    <span className="font-medium">{instancePreview.new_total} conexões</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor por conexão (ciclo)</span>
                    <span>
                      {formatPrice(instancePreview.breakdown.price_per_instance_full_period_cents)} /{' '}
                      {BILLING_INTERVAL_LABEL[instancePreview.billing_interval] ?? instancePreview.billing_interval}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ciclo: {instancePreview.breakdown.period_start} → {instancePreview.breakdown.period_end} ·{' '}
                    {instancePreview.breakdown.remaining_period_days} dias restantes neste período
                  </p>
                </div>
              </>
            )}
            {(reason === 'plan_purchase' || reason === 'plan_upgrade' || reason === 'plan_renewal') && hubRow && (
              <div className="border-t pt-3 mt-2 space-y-2">
                {hubRow.plan_name_snapshot && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Plano</span>
                    <span className="font-medium text-right">{hubRow.plan_name_snapshot}</span>
                  </div>
                )}
                {(hubRow.period_start || hubRow.period_end) && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Período</span>
                    <span className="text-right text-xs">
                      {hubRow.period_start ? formatDate(hubRow.period_start) : '—'} →{' '}
                      {hubRow.period_end ? formatDate(hubRow.period_end) : '—'}
                    </span>
                  </div>
                )}
              </div>
            )}
            {reason === 'manual_charge' && (
              <p className="text-xs text-muted-foreground border-t pt-3 mt-2">
                Cobrança avulsa da operação. Confira o valor e a data de vencimento acima.
                {hubRow?.invoice_number && (
                  <>
                    {' '}
                    Fatura: <span className="font-mono">{hubRow.invoice_number}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {paymentConfirmed ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="rounded-full bg-green-500/20 p-4">
                <Check className="h-10 w-10 text-green-600" />
              </div>
              <p className="font-semibold">Pagamento confirmado</p>
              <p className="text-sm text-muted-foreground">Redirecionando para o Meu plano…</p>
            </div>
          ) : (
            <>
              {pixAutomatic?.available &&
              result?.billing_reason !== 'seat_addon' &&
              result?.billing_reason !== 'instance_addon' ? (
                <div className="mb-4">
                  <PixAutomaticConsentSwitch
                    state={{
                      available: true,
                      switch_on: pixSwitchOn,
                      status: pixAutomatic.status,
                      has_active: pixAutomatic.has_active,
                    }}
                    disabled={pixAutoEnabling || paymentConfirmed}
                    onToggle={async (nextOn) => {
                      if (nextOn) {
                        setPixAutoUserOptedOff(false);
                        const res = await enableMyPixAutomatic(billingId || result?.billing_id);
                        if (res.error) {
                          toast.error(
                            res.error.includes('404')
                              ? 'Não foi possível ativar o Pix Automático agora. Você pode pagar esta fatura normalmente.'
                              : res.error
                          );
                          return;
                        }
                        toast.success('Pix Automático preparado — use o PIX para autorizar.');
                        setPaymentMethod('PIX');
                        const pref = await getMyPixAutomatic();
                        if (pref.data?.pix_automatic) setPixAutomatic(pref.data.pix_automatic);
                        const qrImage = res.data.pix_qr_code ?? pref.data?.pix_automatic?.qr_image ?? null;
                        const qrPayload =
                          res.data.pix_copy_paste ?? pref.data?.pix_automatic?.qr_payload ?? null;
                        if (qrImage || qrPayload) {
                          setResult((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  payment_method: 'PIX',
                                  pix_qr_code: qrImage ?? prev.pix_qr_code,
                                  pix_copy_paste: qrPayload ?? prev.pix_copy_paste,
                                }
                              : prev
                          );
                        }
                      } else {
                        setPixAutoUserOptedOff(true);
                        const res = await disableMyPixAutomatic(billingId || result?.billing_id);
                        if (res.error) {
                          toast.error(res.error);
                          return;
                        }
                        toast.success('Pix Automático desligado para as próximas cobranças.');
                        if (res.data?.pix_automatic) setPixAutomatic(res.data.pix_automatic);
                        if (res.data?.pix_copy_paste || res.data?.pix_qr_code) {
                          setResult((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  payment_method: 'PIX',
                                  pix_qr_code: res.data!.pix_qr_code ?? prev.pix_qr_code,
                                  pix_copy_paste: res.data!.pix_copy_paste ?? prev.pix_copy_paste,
                                }
                              : prev
                          );
                        } else if (billingId || result?.billing_id) {
                          void runPreparePayment('PIX');
                        }
                      }
                    }}
                  />
                </div>
              ) : null}
              <div>
                <Label className="text-sm font-medium">Forma de pagamento</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {PAYMENT_METHODS.map((pm) => {
                    const Icon = pm.icon;
                    const isSelected = paymentMethod === pm.value;
                    const busy = loading && hasChargeReady && isSelected;
                    return (
                      <button
                        key={pm.value}
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          hasChargeReady ? void runPreparePayment(pm.value) : setPaymentMethod(pm.value)
                        }
                        className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors disabled:opacity-60 ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card hover:border-primary/50'
                        }`}
                      >
                        <div className={`rounded-full p-2 ${isSelected ? 'bg-primary/20' : 'bg-muted'}`}>
                          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" />}
                        </div>
                        <span className="text-sm font-semibold">{pm.label}</span>
                        <span className="text-center text-[11px] text-muted-foreground">{pm.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(showTenantDocInput || showManualPrepareButton) && (
                <div className="space-y-3">
                  {showTenantDocInput && (
                    <div>
                      <Label htmlFor="ib_cpf">CPF ou CNPJ {paymentMethod === 'PIX' ? '(obrigatório para PIX)' : ''}</Label>
                      <p className="text-xs text-muted-foreground mt-1 mb-2">
                        Não encontramos um documento válido na sua conta. Informe abaixo para gerar o pagamento. Para
                        alterar o cadastro depois, use os dados da empresa ou perfil da conta no painel.
                      </p>
                      <Input
                        id="ib_cpf"
                        value={billingCpf}
                        onChange={(e) => {
                          setCpfError('');
                          setBillingCpf(formatCpfCnpjDigits(e.target.value));
                        }}
                        placeholder="000.000.000-00"
                        className={cpfError ? 'border-destructive' : undefined}
                      />
                      {cpfError ? <p className="text-sm text-destructive mt-1">{cpfError}</p> : null}
                    </div>
                  )}
                  {showManualPrepareButton && (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={!savedTenantDocValid && !canGenerate}
                      onClick={() => void runPreparePayment(paymentMethod)}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                          Preparando…
                        </>
                      ) : (
                        manualPrepareButtonLabel
                      )}
                    </Button>
                  )}
                </div>
              )}

              {hasChargeReady &&
                paymentMethod === 'PIX' &&
                hasRenderablePayloadForMethod(result!, 'PIX') && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="text-sm font-medium">PIX — {formatPrice(result!.amount_cents)}</p>
                    {result!.pix_qr_code && (
                      <div className="flex justify-center rounded-xl border bg-white p-4 dark:bg-muted/30">
                        <img
                          src={result!.pix_qr_code}
                          alt="QR Code PIX"
                          className="h-52 w-52 object-contain"
                        />
                      </div>
                    )}
                    {result!.pix_copy_paste && (
                      <div className="flex gap-2">
                        <Input readOnly value={result!.pix_copy_paste} className="font-mono text-xs" />
                        <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(result!.pix_copy_paste!)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">O status atualiza automaticamente após o pagamento.</p>
                  </div>
                )}

              {hasChargeReady &&
                paymentMethod === 'BOLETO' &&
                hasRenderablePayloadForMethod(result!, 'BOLETO') && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="text-sm">
                      Boleto — <strong>{formatPrice(result!.amount_cents)}</strong>
                    </p>
                    {result!.bank_slip_digitable_line?.trim() && (
                      <div className="space-y-1">
                        <Label className="text-xs">Linha digitável</Label>
                        <div className="flex gap-2">
                          <Input readOnly className="font-mono text-xs" value={result!.bank_slip_digitable_line} />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(result!.bank_slip_digitable_line!)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {result!.bank_slip_url && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={result!.bank_slip_url} target="_blank" rel="noopener noreferrer">
                            PDF do boleto
                            <ExternalLink className="h-4 w-4 ml-1" />
                          </a>
                        </Button>
                      )}
                      {result!.invoice_url?.trim() &&
                        result!.invoice_url.trim() !== result!.bank_slip_url?.trim() && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={result!.invoice_url} target="_blank" rel="noopener noreferrer">
                              Fatura / link do Asaas
                              <ExternalLink className="h-4 w-4 ml-1" />
                            </a>
                          </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Status da cobrança: <span className="capitalize">{result!.status.replace(/_/g, ' ')}</span>
                    </p>
                  </div>
                )}

              {hasChargeReady &&
                paymentMethod === 'CREDIT_CARD' &&
                hasRenderablePayloadForMethod(result!, 'CREDIT_CARD') && (
                  <div className="space-y-3 rounded-lg border p-4">
                    <p className="text-sm text-muted-foreground">
                      Cartão — <strong>{formatPrice(result!.amount_cents)}</strong>
                    </p>
                    <InlineCreditCardPaymentForm
                      fieldIdPrefix="internal_billing_"
                      form={planCardForm}
                      setForm={setPlanCardForm}
                      onSubmit={handlePayWithCard}
                      paying={payingCard}
                      hostedCheckoutUrl={result!.invoice_url?.trim() || null}
                    />
                  </div>
                )}

              {hasChargeReady &&
                needPreparePayload &&
                !loading &&
                !hideStalePrepareHint && (
                  <p className="text-sm text-muted-foreground">
                    Clique em &quot;Gerar dados de pagamento&quot; para obter QR Code, boleto ou liberar o cartão.
                  </p>
                )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

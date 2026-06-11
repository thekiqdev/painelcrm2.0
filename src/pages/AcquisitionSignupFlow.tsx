import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/contexts/AuthContext';
import { effectiveCheckoutTrialDays, planHasCheckoutTrial } from '@/lib/planCheckoutDisplay';
import { loadSignupEntryConfig } from '@/lib/signupEntry';
import { getOnboardingSessionAvatar, setOnboardingSessionAvatar } from '@/lib/onboardingSessionStorage';
import { prepareOnboardingAvatarDataUrl } from '@/lib/onboardingAvatarImage';
import {
  INITIAL_SIGNUP_FORM,
  ONBOARDING_CTA_LABELS,
  ONBOARDING_CTA_ACCESS_REQUEST,
  ACQUISITION_CAPTURE_NAME_PLACEHOLDER,
  ONBOARDING_HEADLINES,
  OnboardingCard,
  OnboardingConversionStep,
  OnboardingCta,
  OnboardingLayout,
  ContactSetupStep,
  OperationSetupStep,
  OperationMobileBottomSheet,
  ActivationWelcomeStep,
  ActivationMobileFooter,
  buildOperationPreview,
  clampUsersCount,
  type AcquisitionSignupFormState,
  type PublicAcquisitionPlan,
} from '@/components/acquisition/onboarding';
import {
  mergeContactAutofill,
  contactAutofillFromSearchParams,
  contactAutofillFromUser,
} from '@/components/acquisition/onboarding/contact-setup';
import { Loader2 } from 'lucide-react';
import {
  isCadastroResumePath,
  isPendingSignupLeadEmail,
  planIdFromLeadAndParams,
  shouldShowResumeBanner,
} from '@/lib/acquisitionSignupResume';
import {
  cadastroWizardPath,
  isPlaceholderLeadName,
  layoutStepIndexFromWizard,
  leadCaptureSubStepFromWizard,
  resolveSignupWizardStep,
  wizardStepBackTarget,
  type SignupWizardLeadSnapshot,
  type SignupWizardStep,
} from '@/lib/acquisitionSignupWizard';
import { saveSignupCredentialDraft } from '@/lib/acquisitionSignupCredentialDraft';

type PublicLeadPayload = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  selected_plan_id?: string | null;
  current_stage?: string | null;
};

export default function AcquisitionSignupFlowPage() {
  const navigate = useNavigate();
  const { setTokenAndUser, refreshUser, user } = useAuth();
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [leadSnapshot, setLeadSnapshot] = useState<SignupWizardLeadSnapshot | null>(null);
  const [leadId, setLeadId] = useState(params.get('lead') ?? '');
  const [resumeHydrating, setResumeHydrating] = useState(() => Boolean(params.get('lead')));
  const [form, setForm] = useState<AcquisitionSignupFormState>(() => ({
    ...INITIAL_SIGNUP_FORM,
    plan_id: params.get('plan') ?? '',
  }));
  const [plans, setPlans] = useState<PublicAcquisitionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'BOLETO' | 'CREDIT_CARD'>('PIX');
  const [paymentResult, setPaymentResult] = useState<{ pix?: string; invoice?: string } | null>(null);
  const [extraTrialEligible, setExtraTrialEligible] = useState(false);
  const [contactBanner, setContactBanner] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [phoneVerificationId, setPhoneVerificationId] = useState<string | null>(null);
  const [verificationUiState, setVerificationUiState] = useState<
    'idle' | 'sending' | 'sent' | 'verified'
  >('idle');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const urlStep = params.get('step');
  const urlPlanId = params.get('plan');
  const urlLeadId = params.get('lead') ?? '';

  const wizardStep = useMemo(
    () =>
      resolveSignupWizardStep(urlStep, leadSnapshot ?? (urlLeadId ? { id: urlLeadId } : null), urlPlanId),
    [urlStep, leadSnapshot, urlLeadId, urlPlanId],
  );

  const layoutStepIndex = layoutStepIndexFromWizard(wizardStep);
  const leadSubStep = leadCaptureSubStepFromWizard(wizardStep);
  const isLeadPhase = leadSubStep !== null;

  const headline = isLeadPhase
    ? ONBOARDING_HEADLINES.lead
    : wizardStep === 'plan'
      ? ONBOARDING_HEADLINES.plan
      : ONBOARDING_HEADLINES.conversion;

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === form.plan_id) ?? null,
    [plans, form.plan_id],
  );

  const trialDays = selectedPlan ? effectiveCheckoutTrialDays(selectedPlan) : 3;
  const hasTrial = selectedPlan ? planHasCheckoutTrial(selectedPlan) : true;
  const isTrialActivation = wizardStep === 'conversion' && hasTrial;

  const operationPreview = useMemo(
    () =>
      buildOperationPreview(
        selectedPlan,
        clampUsersCount(form.users_count, selectedPlan),
      ),
    [selectedPlan, form.users_count],
  );

  const navigateWizard = useCallback(
    (step: SignupWizardStep, opts?: { leadId?: string; planId?: string; replace?: boolean }) => {
      const id = (opts?.leadId ?? leadId ?? urlLeadId).trim();
      navigate(
        cadastroWizardPath({
          leadId: id || undefined,
          step,
          planId: opts?.planId ?? form.plan_id ?? urlPlanId ?? undefined,
        }),
        { replace: opts?.replace !== false },
      );
    },
    [navigate, leadId, urlLeadId, form.plan_id, urlPlanId],
  );

  useEffect(() => {
    apiClient
      .get<{ ok: boolean; flags: { signup_flow_v1?: boolean } }>('/api/public/acquisition/config')
      .then((res) => {
        if (res.error || !res.data?.ok) {
          setEnabled(false);
          return;
        }
        setEnabled(Boolean(res.data.flags?.signup_flow_v1));
      })
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient.get<PublicAcquisitionPlan[]>('/api/plans').then((res) => {
      if (cancelled) return;
      if (res.data?.length) {
        setPlans(res.data);
        setForm((f) => {
          if (f.plan_id) return f;
          const def = res.data!.find((p) => p.is_default) ?? res.data![0];
          return def ? { ...f, plan_id: def.id } : f;
        });
      }
      setPlansLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const planFromUrl = params.get('plan');
    if (planFromUrl) {
      setForm((f) => (f.plan_id === planFromUrl ? f : { ...f, plan_id: planFromUrl }));
    }
  }, [params]);

  useEffect(() => {
    const leadParam = params.get('lead');
    if (!leadParam) {
      setResumeHydrating(false);
      setLeadSnapshot(null);
      return;
    }

    let cancelled = false;
    setResumeHydrating(true);

    void (async () => {
      const fromParams = contactAutofillFromSearchParams(params);
      let leadPayload: PublicLeadPayload | null = null;

      const res = await apiClient.get<{
        ok: boolean;
        lead?: PublicLeadPayload;
        resume_path?: string;
        resume_verified?: boolean;
        resume_message?: string;
      }>(`/api/public/acquisition/leads/${encodeURIComponent(leadParam)}`);

      if (!cancelled && res.data?.ok && res.data.lead) {
        leadPayload = res.data.lead;

        const resumePath = res.data.resume_path?.trim();
        if (resumePath && !isCadastroResumePath(resumePath)) {
          if (shouldShowResumeBanner(res.data.resume_verified, res.data.resume_message)) {
            setContactBanner(res.data.resume_message ?? null);
          }
          setResumeHydrating(false);
          navigate(resumePath, { replace: true });
          return;
        }
      }

      if (cancelled) return;

      const planId = planIdFromLeadAndParams(leadPayload, params);
      if (leadPayload) {
        setLeadId(leadPayload.id);
        setLeadSnapshot({
          id: leadPayload.id,
          name: leadPayload.name,
          email: leadPayload.email,
          selected_plan_id: leadPayload.selected_plan_id,
          current_stage: leadPayload.current_stage,
        });
        setForm((f) => {
          const merged = mergeContactAutofill(
            f,
            fromParams,
            {
              lead_name: isPlaceholderLeadName(leadPayload!.name)
                ? undefined
                : (leadPayload!.name ?? undefined),
              lead_email: isPendingSignupLeadEmail(leadPayload!.email)
                ? undefined
                : leadPayload!.email,
              lead_phone: leadPayload!.phone ?? undefined,
            },
            contactAutofillFromUser(user ?? null),
          );
          return planId && merged.plan_id !== planId ? { ...merged, plan_id: planId } : merged;
        });
      } else {
        setLeadId(leadParam);
        setLeadSnapshot({ id: leadParam });
        setForm((f) =>
          mergeContactAutofill(f, fromParams, contactAutofillFromUser(user ?? null)),
        );
      }

      if (
        res.data?.resume_message &&
        shouldShowResumeBanner(res.data.resume_verified, res.data.resume_message)
      ) {
        setContactBanner(res.data.resume_message);
      }
      setResumeHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [params, user, navigate]);

  useEffect(() => {
    if (!selectedPlan) return;
    const clamped = clampUsersCount(form.users_count, selectedPlan);
    if (clamped !== form.users_count) {
      setForm((f) => ({ ...f, users_count: clamped }));
    }
  }, [form.plan_id, selectedPlan, form.users_count]);

  const patchForm = useCallback((patch: Partial<AcquisitionSignupFormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldownSec((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSec]);

  function resetVerificationSession() {
    setVerificationCode('');
    setVerificationError(null);
    setVerificationUiState('idle');
    setPhoneVerificationId(null);
    setPhoneVerified(false);
    setResendCooldownSec(0);
  }

  function validateLeadIdentityStep(): boolean {
    const ph = form.lead_phone.replace(/\D/g, '');
    if (ph.length < 10) {
      toast.error('Informe seu WhatsApp com DDD.');
      return false;
    }
    return true;
  }

  function validateLeadVerificationStep(): boolean {
    const code = verificationCode.replace(/\D/g, '');
    if (code.length !== 6) {
      toast.error('Informe o código de 6 dígitos.');
      return false;
    }
    return true;
  }

  async function sendPhoneAccessCode(): Promise<boolean> {
    const phone = form.lead_phone.replace(/\D/g, '');
    setVerificationError(null);
    setVerificationUiState('sending');
    try {
      const res = await apiClient.post<{
        ok: boolean;
        verification_id?: string;
        error?: string;
        code?: string;
        resend_available_in_seconds?: number;
      }>('/api/public/acquisition/phone/send-code', { phone });

      if (res.error || !res.data?.ok || !res.data.verification_id) {
        const msg = res.data?.error ?? res.error ?? 'Não foi possível enviar o código.';
        toast.error(msg);
        setVerificationUiState('idle');
        if (res.data?.code === 'resend_cooldown' && res.data.resend_available_in_seconds) {
          setResendCooldownSec(res.data.resend_available_in_seconds);
        }
        return false;
      }

      setPhoneVerificationId(res.data.verification_id);
      setVerificationUiState('sent');
      setResendCooldownSec(60);
      return true;
    } catch {
      toast.error('Erro ao enviar código. Tente novamente.');
      setVerificationUiState('idle');
      return false;
    }
  }

  async function captureVerifiedPhoneContact(): Promise<string | null> {
    if (!phoneVerificationId) {
      toast.error('Confirme seu WhatsApp antes de continuar.');
      return null;
    }
    const captureRes = await apiClient.post<{ ok: boolean; lead_id?: string; error?: string }>(
      '/api/public/acquisition/contact/capture',
      {
        name: ACQUISITION_CAPTURE_NAME_PLACEHOLDER,
        phone: form.lead_phone.replace(/\D/g, ''),
        lead_id: leadId || urlLeadId || undefined,
        phone_verification_id: phoneVerificationId,
      },
    );
    if (captureRes.error || !captureRes.data?.ok) {
      toast.error(captureRes.data?.error ?? captureRes.error ?? 'Não foi possível registrar seu contato.');
      return null;
    }
    const id = captureRes.data.lead_id?.trim();
    if (id) {
      setLeadId(id);
      setLeadSnapshot((prev) => ({ ...prev, id, current_stage: 'contact_captured' }));
    }
    return id ?? leadId ?? urlLeadId ?? null;
  }

  function validateLeadCredentialsStep(): boolean {
    if (!form.lead_name.trim()) {
      toast.error('Informe seu nome.');
      return false;
    }
    if (!form.lead_email.trim() || !form.lead_email.includes('@')) {
      toast.error('Informe um e-mail válido.');
      return false;
    }
    if (form.signup_password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return false;
    }
    if (form.signup_password !== form.signup_password_confirm) {
      toast.error('As senhas não coincidem.');
      return false;
    }
    return true;
  }

  function persistCredentialDraftForLead(resolvedLeadId?: string) {
    const id = (resolvedLeadId ?? leadId ?? urlLeadId).trim();
    if (!id || form.signup_password.length < 6) return;
    saveSignupCredentialDraft(id, form.signup_password);
  }

  function validatePlanStep(): boolean {
    if (!form.plan_id) {
      toast.error('Selecione um plano para continuar.');
      return false;
    }
    return true;
  }

  async function postSignupStep(apiStep: 'contact' | 'plan' | 'checkout') {
    const res = await apiClient.post<{
      ok: boolean;
      lead_id?: string;
      next_path?: string;
      fallback_path?: string;
    }>('/api/public/acquisition/signup/step', {
      lead_id: leadId || urlLeadId || undefined,
      name: form.lead_name.trim(),
      email: form.lead_email.trim(),
      phone: form.lead_phone.replace(/\D/g, ''),
      plan_id: form.plan_id || undefined,
      step: apiStep,
      utm: {
        flow: 'lead_first_v1',
        onboarding_version: 'activation_only_v1',
        users_count: form.users_count,
        channel_primary: 'whatsapp',
      },
    });

    const body = res.data as {
      ok: boolean;
      lead_id?: string;
      next_path?: string;
      fallback_path?: string;
      code?: string;
      contact_message?: string;
    };
    if (res.error || !body?.ok) {
      if (body?.code === 'login_required') {
        toast.info(body.contact_message ?? 'Operação ativa encontrada. Faça login.');
        navigate('/login');
        return null;
      }
      if (body?.code === 'trial_blocked') {
        toast.error(body.contact_message ?? 'Trial adicional indisponível.');
        return null;
      }
      const cfg = await loadSignupEntryConfig();
      navigate(body?.fallback_path ?? cfg.paths.signup);
      return null;
    }
    if (body.lead_id) setLeadId(body.lead_id);
    if (body.contact_message) setContactBanner(body.contact_message);
    return body;
  }

  async function handleResendCode() {
    if (resendCooldownSec > 0 || resendLoading) return;
    setResendLoading(true);
    try {
      await sendPhoneAccessCode();
    } finally {
      setResendLoading(false);
    }
  }

  async function handleNext() {
    if (wizardStep === 'identity') {
      if (!validateLeadIdentityStep()) return;
      setLoading(true);
      try {
        const sent = await sendPhoneAccessCode();
        if (!sent) return;
        navigateWizard('verification', { leadId: leadId || urlLeadId || undefined });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (wizardStep === 'verification') {
      if (!validateLeadVerificationStep() || !phoneVerificationId) return;
      setLoading(true);
      setVerificationError(null);
      try {
        const verifyRes = await apiClient.post<{
          ok: boolean;
          error?: string;
        }>('/api/public/acquisition/phone/verify-code', {
          verification_id: phoneVerificationId,
          phone: form.lead_phone.replace(/\D/g, ''),
          code: verificationCode.replace(/\D/g, ''),
        });

        if (verifyRes.error || !verifyRes.data?.ok) {
          const msg = verifyRes.data?.error ?? verifyRes.error ?? 'Código incorreto.';
          setVerificationError(msg);
          return;
        }

        setPhoneVerified(true);
        setVerificationUiState('verified');
        await new Promise((r) => setTimeout(r, 700));

        const capturedLeadId = await captureVerifiedPhoneContact();
        if (!capturedLeadId) return;
        navigateWizard('credentials', { leadId: capturedLeadId });
      } catch {
        toast.error('Erro ao verificar código. Tente novamente.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (wizardStep === 'credentials') {
      if (!validateLeadCredentialsStep()) return;
      persistCredentialDraftForLead();
      setLoading(true);
      try {
        const resolveRes = await apiClient.post<{
          ok: boolean;
          action?: string;
          message?: string;
          lead_id?: string;
          extra_trial_eligible?: boolean;
        }>('/api/public/acquisition/contact/resolve', {
          name: form.lead_name.trim(),
          email: form.lead_email.trim(),
          phone: form.lead_phone.replace(/\D/g, ''),
          lead_id: leadId || urlLeadId || undefined,
        });

        if (resolveRes.data?.action === 'login_required') {
          toast.info(resolveRes.data.message ?? 'Faça login para continuar.');
          navigate('/login');
          return;
        }
        if (resolveRes.data?.action === 'trial_blocked') {
          toast.error(resolveRes.data.message ?? 'Trial indisponível.');
          return;
        }

        const resolvedLeadId = resolveRes.data?.lead_id ?? leadId ?? urlLeadId;
        if (resolvedLeadId) {
          setLeadId(resolvedLeadId);
          persistCredentialDraftForLead(resolvedLeadId);
          setLeadSnapshot({
            id: resolvedLeadId,
            name: form.lead_name.trim(),
            email: form.lead_email.trim(),
            current_stage: 'contact_captured',
            selected_plan_id: leadSnapshot?.selected_plan_id,
          });
        }
        if (resolveRes.data?.extra_trial_eligible) setExtraTrialEligible(true);
        if (shouldShowResumeBanner(undefined, resolveRes.data?.message)) {
          setContactBanner(resolveRes.data?.message ?? null);
        } else {
          setContactBanner(null);
        }

        if (resolveRes.data?.action === 'new_lead') {
          const body = await postSignupStep('contact');
          if (!body) return;
        }

        navigateWizard('plan', { leadId: resolvedLeadId });
      } catch {
        toast.error('Erro ao registrar contato. Tente novamente.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (wizardStep === 'plan') {
      if (!validatePlanStep()) return;
      setLoading(true);
      try {
        const body = await postSignupStep('plan');
        if (!body) return;
        navigateWizard('conversion', { leadId: leadId || urlLeadId, planId: form.plan_id });
      } catch {
        toast.error('Erro ao salvar plano.');
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleStartTrial() {
    if (!validatePlanStep() || !(leadId || urlLeadId)) return;
    setLoading(true);
    try {
      await postSignupStep('checkout');

      const rawAvatar = getOnboardingSessionAvatar();
      const avatar_data_url = await prepareOnboardingAvatarDataUrl(rawAvatar);
      if (avatar_data_url && avatar_data_url !== rawAvatar) {
        setOnboardingSessionAvatar(avatar_data_url);
      }

      const res = await apiClient.post<{
        ok: boolean;
        session_token?: string;
        redirect_path?: string;
        error?: string;
      }>('/api/public/acquisition/activate/trial', {
        lead_id: leadId || urlLeadId,
        users_count: form.users_count,
        grant_extra_trial: extraTrialEligible,
        ...(avatar_data_url ? { avatar_data_url } : {}),
      });

      if (res.error || !res.data?.ok || !res.data.redirect_path) {
        toast.error(res.data?.error ?? res.error ?? 'Não foi possível iniciar a avaliação.');
        return;
      }

      if (res.data.session_token) {
        sessionStorage.setItem('acquisition_onboarding_session', res.data.session_token);
      }

      toast.success('Tudo pronto! Vamos configurar sua operação.');
      navigate(res.data.redirect_path, { replace: true });
    } catch {
      toast.error('Erro ao iniciar avaliação.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment() {
    if (!validatePlanStep() || !(leadId || urlLeadId) || !selectedPlan) return;
    setLoading(true);
    setPaymentResult(null);
    try {
      await postSignupStep('checkout');

      const res = await apiClient.post<{
        token?: string;
        tenant_id?: string;
        invoice_url?: string;
        pix_copy_paste?: string;
        user?: {
          id: string;
          email: string;
          tenant_id: string;
          registration_complete?: boolean;
          onboarding_completed?: boolean;
        };
      }>('/api/plan-purchase', {
        plan_id: selectedPlan.id,
        name: form.lead_name.trim(),
        email: form.lead_email.trim(),
        responsible_name: form.lead_name.trim(),
        whatsapp: form.lead_phone.replace(/\D/g, ''),
        users_count: selectedPlan.plan_type === 'custom' ? form.users_count : undefined,
        payment_method: paymentMethod,
        cpf_cnpj: cpfCnpj.replace(/\D/g, '') || undefined,
        marketing_attribution: {
          acquisition_lead_id: leadId || urlLeadId,
          flow: 'acquisition_premium_checkout',
        },
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data?.pix_copy_paste || res.data?.invoice_url) {
        setPaymentResult({
          pix: res.data.pix_copy_paste,
          invoice: res.data.invoice_url,
        });
        toast.success('Cobrança gerada. Conclua o pagamento para liberar o onboarding.');
        return;
      }

      if (res.data?.token && res.data.user) {
        await setTokenAndUser(res.data.token, {
          ...res.data.user,
          registration_complete: false,
          onboarding_completed: false,
        });
        await refreshUser();
        const cfg = await loadSignupEntryConfig();
        navigate(cfg.paths.post_activation ?? '/onboarding', {
          replace: true,
          state: {
            tenantId: res.data.tenant_id,
            prefill: { name: form.lead_name.trim(), email: form.lead_email.trim() },
          },
        });
      }
    } catch {
      toast.error('Erro ao processar pagamento.');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    const prev = wizardStepBackTarget(wizardStep);
    if (!prev) return;

    if (prev === 'identity') {
      resetVerificationSession();
    }
    if (prev === 'verification') {
      resetVerificationSession();
    }

    navigateWizard(prev, { leadId: leadId || urlLeadId || undefined });
  }

  const canGoBack = wizardStepBackTarget(wizardStep) !== null;

  if (enabled === null || resumeHydrating) {
    return (
      <div className="dark flex min-h-[100dvh] items-center justify-center bg-[hsl(222,47%,5%)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div className="dark flex min-h-[100dvh] items-center justify-center bg-[hsl(222,47%,5%)] px-4">
        <OnboardingCard
          variant="default"
          title="Cadastro em manutenção"
          subtitle="O novo fluxo está temporariamente indisponível."
          className="max-w-md w-full"
        >
          <button
            type="button"
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            onClick={() => void loadSignupEntryConfig(true).then((c) => navigate(c.paths.signup))}
          >
            Ir para cadastro padrão
          </button>
        </OnboardingCard>
      </div>
    );
  }

  const ctaLabel =
    wizardStep === 'identity'
      ? ONBOARDING_CTA_ACCESS_REQUEST
      : wizardStep === 'verification'
        ? 'Continuar'
        : ONBOARDING_CTA_LABELS[wizardStep === 'plan' ? 'plan' : 'lead'] ?? 'Continuar';

  const leadStepNextDisabled =
    wizardStep === 'verification' &&
    (verificationCode.replace(/\D/g, '').length !== 6 ||
      verificationUiState === 'sending' ||
      verificationUiState === 'verified' ||
      !phoneVerificationId);

  const mobileFooter =
    wizardStep !== 'conversion' || isTrialActivation ? (
      <>
        {wizardStep === 'plan' && !plansLoading && form.plan_id ? (
          <OperationMobileBottomSheet preview={operationPreview}>
            <OnboardingCta
              layout="mobile-fixed"
              onBack={canGoBack ? handleBack : undefined}
              onNext={handleNext}
              loading={loading}
              nextLabel={ctaLabel}
              nextDisabled={plansLoading || !form.plan_id}
            />
          </OperationMobileBottomSheet>
        ) : isTrialActivation ? (
          <ActivationMobileFooter
            loading={loading}
            onContinue={() => void handleStartTrial()}
          />
        ) : (
          <OnboardingCta
            layout="mobile-fixed"
            onBack={canGoBack ? handleBack : undefined}
            onNext={handleNext}
            loading={loading}
            nextLabel={ctaLabel}
            nextDisabled={
              leadStepNextDisabled || (wizardStep === 'plan' && (plansLoading || !form.plan_id))
            }
          />
        )}
      </>
    ) : undefined;

  return (
    <OnboardingLayout
      activeStepIndex={layoutStepIndex}
      mobileFooter={mobileFooter}
      wideContent={isLeadPhase || wizardStep === 'plan' || isTrialActivation}
      operationStepMobile={isLeadPhase || wizardStep === 'plan' || isTrialActivation}
      reserveBottomSpace={wizardStep === 'plan'}
    >
      {isTrialActivation ? (
        <ActivationWelcomeStep
          leadName={form.lead_name}
          leadEmail={form.lead_email}
          leadPhone={form.lead_phone}
          trialDays={trialDays}
          usersCount={form.users_count}
          trialLabel={operationPreview.trialLabel}
          loading={loading}
          onContinue={() => void handleStartTrial()}
        />
      ) : isLeadPhase && leadSubStep ? (
        <ContactSetupStep
          subStep={leadSubStep}
          name={form.lead_name}
          email={form.lead_email}
          phone={form.lead_phone}
          password={form.signup_password}
          confirmPassword={form.signup_password_confirm}
          onChange={patchForm}
          onContinue={() => void handleNext()}
          onBack={canGoBack ? handleBack : undefined}
          loading={loading}
          contactBanner={contactBanner}
          verificationCode={verificationCode}
          onVerificationCodeChange={setVerificationCode}
          verificationUiState={verificationUiState}
          verificationError={verificationError}
          phoneVerified={phoneVerified}
          resendCooldownSec={resendCooldownSec}
          onResendCode={() => void handleResendCode()}
          resendLoading={resendLoading}
        />
      ) : wizardStep === 'plan' ? (
        <OperationSetupStep
          plans={plans}
          loading={plansLoading}
          selectedId={form.plan_id}
          usersCount={form.users_count}
          onSelect={(id) => patchForm({ plan_id: id })}
          onUsersCountChange={(count) => patchForm({ users_count: count })}
          onBack={handleBack}
          onContinue={handleNext}
          continueLoading={loading}
          continueDisabled={plansLoading || !form.plan_id}
          continueLabel={ctaLabel}
          activationPreview={{
            name: form.lead_name,
            email: form.lead_email,
            phone: form.lead_phone,
          }}
        />
      ) : (
        <OnboardingCard title={headline.title} subtitle={headline.subtitle}>
          {contactBanner ? (
            <p className="mb-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
              {contactBanner}
            </p>
          ) : null}
          {wizardStep === 'conversion' && selectedPlan && !hasTrial && (
            <OnboardingConversionStep
              mode="payment"
              leadName={form.lead_name}
              leadEmail={form.lead_email}
              plan={selectedPlan}
              usersCount={form.users_count}
              loading={loading}
              cpfCnpj={cpfCnpj}
              paymentMethod={paymentMethod}
              onCpfCnpjChange={setCpfCnpj}
              onPaymentMethodChange={setPaymentMethod}
              onSubmitPayment={() => void handlePayment()}
              pixCopyPaste={paymentResult?.pix}
              invoiceUrl={paymentResult?.invoice}
            />
          )}

          {wizardStep !== 'conversion' ? (
            <OnboardingCta
              className="hidden lg:flex"
              onBack={canGoBack ? handleBack : undefined}
              onNext={handleNext}
              loading={loading}
              nextLabel={ctaLabel}
              nextDisabled={wizardStep === 'plan' && (plansLoading || !form.plan_id)}
            />
          ) : null}
        </OnboardingCard>
      )}
    </OnboardingLayout>
  );
}

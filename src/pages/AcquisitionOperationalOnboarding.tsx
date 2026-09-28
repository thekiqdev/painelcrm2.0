import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/integrations/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';
import {
  clearSignupCredentialDraft,
  inspectCredentialDraft,
  loadSignupCredentialDraft,
  resolveProvisionPasswordUiState,
  setProvisionPasswordUiReason,
  getStoredProvisionPasswordUiReason,
  type ProvisionPasswordUiReason,
} from '@/lib/acquisitionSignupCredentialDraft';

const AUTO_PROVISION_ATTEMPTS_KEY = 'acquisition_auto_provision_attempts';

function bumpAutoProvisionAttempt(): number {
  if (typeof sessionStorage === 'undefined') return 1;
  const next = parseInt(sessionStorage.getItem(AUTO_PROVISION_ATTEMPTS_KEY) ?? '0', 10) + 1;
  sessionStorage.setItem(AUTO_PROVISION_ATTEMPTS_KEY, String(next));
  return next;
}

function clearAutoProvisionAttempts(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(AUTO_PROVISION_ATTEMPTS_KEY);
}
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActivationProgressRail } from '@/components/onboarding/wizard/ActivationProgressRail';
import { OperationalOnboardingFocusLayout } from '@/components/onboarding/wizard/OperationalOnboardingFocusLayout';
import { WizardFocusNav } from '@/components/onboarding/wizard/WizardFocusNav';
import {
  ProvisionMobileProgressTracker,
  ProvisionMobileProfileStrip,
  ProvisionMobilePasswordForm,
  ProvisionMobileFooter,
} from '@/components/onboarding/wizard/provision-mobile';
import { OnboardingJourneyProgressTracker } from '@/components/onboarding/wizard/OnboardingJourneyProgressTracker';
import {
  CompanyStepMainForm,
  WizardStickyContinueFooter,
  OperationalCompanyCard,
  WizardOperationSidebar,
} from '@/components/onboarding/wizard/company-step';
import { TeamStepMainForm } from '@/components/onboarding/wizard/team-step';
import {
  WhatsappFinalizationStep,
  useWhatsappOnboardingConnection,
  type WhatsappConnectedProfile,
} from '@/components/onboarding/wizard/whatsapp-step';
import { OperationReadyStep } from '@/components/onboarding/wizard/OperationReadyStep';
import {
  OperationalSummaryStep,
  type OperationalSummary,
} from '@/components/onboarding/wizard/OperationalSummaryStep';
import { OPERATIONAL_WIZARD_STEPS } from '@/components/onboarding/wizard/constants';
import { setOnboardingSessionAvatar } from '@/lib/onboardingSessionStorage';
import { ONBOARDING_AVATAR_CHANGED } from '@/hooks/useOnboardingSessionAvatar';
import {
  ActivationProfileCard,
  OperationStatusCard,
  buildWelcomeOperationPillars,
} from '@/components/acquisition/onboarding/activation-welcome';
import type { OperationalWizardStepId } from '@/components/onboarding/wizard/constants';
import type { ActivationJourneyStepId } from '@/components/acquisition/onboarding/activation-welcome';
import { uploadCatalogImageFile, isCatalogMediaUploadLikelyConfigured } from '@/services/catalogMediaUpload';
import { parseWizardApiError } from '@/lib/onboardingApiErrors';
import { slugifyOperationalName, isValidOperationalSlug } from '@/lib/operationalSlug';
import { useOperationalSlugCheck } from '@/hooks/useOperationalSlugCheck';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const SESSION_KEY = 'acquisition_onboarding_session';
const ACCEPTED_IMAGE = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

type WizardState = {
  onboarding_state: string;
  current_step: string;
  completed_steps: string[];
  activation_progress: number;
  step_data?: {
    company?: {
      company_name?: string;
      slug?: string;
      logo_light_url?: string | null;
      logo_dark_url?: string | null;
    };
    users?: { members: Array<{ email: string; full_name: string; role: string; phone?: string | null }> };
    whatsapp?: {
      instance_id?: string;
      connection_name?: string;
      connected_phone?: string | null;
      profile_name?: string | null;
      skipped?: boolean;
    };
  };
};

type MemberDraft = { email: string; full_name: string; role: string; phone: string };

type WhatsappProfile = WhatsappConnectedProfile;

function StepHeading({ title, subtitle, compact }: { title: string; subtitle: string; compact?: boolean }) {
  return (
    <header className={cn('space-y-2', compact ? 'mb-3' : 'mb-8')}>
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[1.85rem]">
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{subtitle}</p>
    </header>
  );
}

export default function AcquisitionOperationalOnboarding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokenAndUser, refreshUser } = useAuth();
  const sessionToken = params.get('session') ?? sessionStorage.getItem(SESSION_KEY) ?? '';

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState<'light' | 'dark' | null>(null);
  const [needsProvision, setNeedsProvision] = useState(false);
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [lead, setLead] = useState<{
    id?: string;
    name: string | null;
    email: string;
    phone: string | null;
  } | null>(null);
  const [stepOverride, setStepOverride] = useState<OperationalWizardStepId | 'provision' | 'summary' | null>(null);
  const [summary, setSummary] = useState<OperationalSummary | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [operationSlug, setOperationSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const slugCheck = useOperationalSlugCheck(operationSlug);
  const [logoLight, setLogoLight] = useState<string | null>(null);
  const [logoDark, setLogoDark] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [connectionName, setConnectionName] = useState('WhatsApp Comercial');
  const [waProfile, setWaProfile] = useState<WhatsappProfile | null>(null);
  const [whatsappWizardDone, setWhatsappWizardDone] = useState(false);
  const [teamStepEnabled, setTeamStepEnabled] = useState(true);
  const [seatsLimit, setSeatsLimit] = useState(1);
  const autoSkipUsersRef = useRef(false);
  const autoProvisionRanRef = useRef(false);
  const [provisionManualFallback, setProvisionManualFallback] = useState(false);
  const [provisionPasswordUiReason, setProvisionPasswordUiReasonState] =
    useState<ProvisionPasswordUiReason>('hidden');
  const authToken = apiClient.getToken();

  const credentialDraftPassword = useMemo(() => {
    if (!lead?.id || provisionManualFallback) return null;
    const inspected = inspectCredentialDraft(lead.id);
    return 'password' in inspected ? inspected.password : null;
  }, [lead?.id, provisionManualFallback]);

  const provisionPasswordUi = useMemo(
    () =>
      resolveProvisionPasswordUiState({
        needsProvision,
        leadId: lead?.id,
        provisionManualFallback,
        storedFailReason: getStoredProvisionPasswordUiReason(),
      }),
    [needsProvision, lead?.id, provisionManualFallback, submitting],
  );

  useEffect(() => {
    setProvisionPasswordUiReasonState(provisionPasswordUi.reason);
    if (provisionPasswordUi.reason !== 'hidden') {
      setProvisionPasswordUiReason(provisionPasswordUi.reason);
    }
  }, [provisionPasswordUi.reason]);

  const serverStep = needsProvision ? 'provision' : (wizard?.current_step ?? 'company');
  const displayStep = stepOverride ?? (summary ? 'summary' : serverStep);

  const stepMeta = useMemo(() => {
    if (displayStep === 'summary') {
      return { headline: 'Resumo operacional', subtitle: 'Sua central está pronta.' };
    }
    if (displayStep === 'completed') {
      return { headline: 'Operação ativada com sucesso', subtitle: 'Seu workspace está pronto para uso.' };
    }
    const id =
      displayStep === 'provision' ? 'company' : (displayStep as OperationalWizardStepId);
    const s = OPERATIONAL_WIZARD_STEPS.find((x) => x.id === id) ?? OPERATIONAL_WIZARD_STEPS[0]!;
    return { headline: s.headline, subtitle: s.subtitle };
  }, [displayStep]);

  const progressRailStep =
    displayStep === 'provision' || displayStep === 'summary' || displayStep === 'completed'
      ? 'whatsapp'
      : (displayStep as OperationalWizardStepId);

  const loadWizard = useCallback(async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    sessionStorage.setItem(SESSION_KEY, sessionToken);

    const res = await apiClient.get<{
      ok: boolean;
      needs_provision?: boolean;
      wizard?: WizardState;
      operation?: { users_count: number; seats_limit: number; team_step_enabled: boolean };
      avatar?: string | null;
      lead?: { id: string; name: string | null; email: string; phone: string | null };
    }>(`/api/public/acquisition/onboarding/wizard/${encodeURIComponent(sessionToken)}`);

    if (res.error || !res.data?.ok) {
      toast.error('Sessão expirada. Retome pelo cadastro.');
      setLoading(false);
      return;
    }

    setNeedsProvision(Boolean(res.data.needs_provision));
    setWizard(res.data.wizard ?? null);
    if (res.data.operation) {
      setTeamStepEnabled(Boolean(res.data.operation.team_step_enabled));
      setSeatsLimit(Math.max(1, res.data.operation.seats_limit ?? res.data.operation.users_count ?? 1));
    }
    if (res.data.lead) {
      setLead(res.data.lead);
      const draftPwd = res.data.lead.id ? loadSignupCredentialDraft(res.data.lead.id) : null;
      if (draftPwd) {
        setPassword(draftPwd);
        setConfirmPassword(draftPwd);
      }
    }
    if (res.data.avatar) {
      setOnboardingSessionAvatar(res.data.avatar);
      window.dispatchEvent(new Event(ONBOARDING_AVATAR_CHANGED));
    }

    const savedCompany = res.data.wizard?.step_data?.company;
    setCompanyName(savedCompany?.company_name ?? '');
    if (savedCompany?.slug) {
      setOperationSlug(savedCompany.slug);
      setSlugManuallyEdited(true);
    } else if (savedCompany?.company_name) {
      setOperationSlug(slugifyOperationalName(savedCompany.company_name));
    }
    setLogoLight(res.data.wizard?.step_data?.company?.logo_light_url ?? null);
    setLogoDark(res.data.wizard?.step_data?.company?.logo_dark_url ?? null);

    const savedMembers = res.data.wizard?.step_data?.users?.members;
    if (savedMembers?.length) {
      setMembers(
        savedMembers.map((m) => ({
          email: m.email,
          full_name: m.full_name,
          role: m.role,
          phone: m.phone ?? '',
        })),
      );
    }

    const wa = res.data.wizard?.step_data?.whatsapp;
    if (wa?.connection_name) setConnectionName(wa.connection_name);

    if (res.data.wizard?.onboarding_state === 'completed') {
      setWhatsappWizardDone(true);
      if (wa && !wa.skipped) {
        setWaProfile({
          connected: true,
          connection_name: wa.connection_name,
          phone: wa.connected_phone,
          profile_name: wa.profile_name,
        });
      }
    }

    setLoading(false);
  }, [sessionToken]);

  useEffect(() => {
    void loadWizard();
  }, [loadWizard]);

  useEffect(() => {
    autoProvisionRanRef.current = false;
    setProvisionManualFallback(false);
    clearAutoProvisionAttempts();
    setProvisionPasswordUiReason('hidden');
    setProvisionPasswordUiReasonState('hidden');
  }, [sessionToken]);

  const runProvision = useCallback(
    async (opts?: { passwordOverride?: string; fromDraft?: boolean }) => {
      if (!sessionToken || !lead) return false;
      const pwd = (opts?.passwordOverride ?? password).trim();
      if (pwd.length < 6) {
        if (!opts?.fromDraft) toast.error('Senha mínima de 6 caracteres.');
        else setProvisionManualFallback(true);
        return false;
      }
      if (!opts?.fromDraft && pwd !== confirmPassword) {
        toast.error('Senhas não coincidem.');
        return false;
      }
      setSubmitting(true);
      try {
        const res = await apiClient.post<{
          ok: boolean;
          code?: string;
          token?: string;
          user?: { id: string; email: string; tenant_id: string };
          error?: string;
        }>('/api/public/acquisition/onboarding/provision', {
          session_token: sessionToken,
          company_name: 'Minha operação',
          password: pwd,
          responsible_name: lead.name ?? undefined,
        });
        if (res.error || !res.data?.ok || !res.data.token || !res.data.user) {
          const failCode = res.data?.code;
          if (opts?.fromDraft && failCode === 'ALREADY_PROVISIONED') {
            clearSignupCredentialDraft();
            clearAutoProvisionAttempts();
            setProvisionPasswordUiReason('hidden');
            setProvisionManualFallback(false);
            await loadWizard();
            return true;
          }
          if (opts?.fromDraft) {
            const attempts = bumpAutoProvisionAttempt();
            const reason: ProvisionPasswordUiReason =
              failCode === 'ALREADY_PROVISIONED'
                ? 'already_provisioned'
                : attempts > 1
                  ? 'strict_mode_retry'
                  : 'provision_failed';
            setProvisionPasswordUiReason(reason);
            setProvisionPasswordUiReasonState(reason);
            setProvisionManualFallback(true);
            toast.error(
              res.data?.error ?? res.error ?? 'Não foi possível preparar o workspace. Defina sua senha abaixo.',
            );
          } else {
            toast.error(res.data?.error ?? res.error ?? 'Falha ao criar workspace.');
          }
          return false;
        }
        clearSignupCredentialDraft();
        clearAutoProvisionAttempts();
        setProvisionPasswordUiReason('hidden');
        setProvisionPasswordUiReasonState('hidden');
        await setTokenAndUser(res.data.token, {
          ...res.data.user,
          registration_complete: true,
          onboarding_completed: false,
        });
        await refreshUser();
        setNeedsProvision(false);
        setStepOverride(null);
        await loadWizard();
        return true;
      } catch {
        if (opts?.fromDraft) {
          const attempts = bumpAutoProvisionAttempt();
          const reason: ProvisionPasswordUiReason = attempts > 1 ? 'strict_mode_retry' : 'provision_failed';
          setProvisionPasswordUiReason(reason);
          setProvisionPasswordUiReasonState(reason);
          setProvisionManualFallback(true);
          toast.error('Não foi possível preparar o workspace. Defina sua senha abaixo.');
        } else {
          toast.error('Erro no provisionamento.');
        }
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [
      sessionToken,
      lead,
      password,
      confirmPassword,
      setTokenAndUser,
      refreshUser,
      loadWizard,
    ],
  );

  useEffect(() => {
    if (loading || !needsProvision || !lead?.id || !credentialDraftPassword) return;
    if (autoProvisionRanRef.current) return;
    autoProvisionRanRef.current = true;
    void runProvision({ passwordOverride: credentialDraftPassword, fromDraft: true });
  }, [loading, needsProvision, lead?.id, credentialDraftPassword, runProvision]);

  async function handleProvision() {
    await runProvision();
  }

  async function handleLogoUpload(file: File, variant: 'light' | 'dark') {
    if (!ACCEPTED_IMAGE.includes(file.type)) {
      toast.error('Formato não suportado. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo 2 MB.');
      return;
    }
    if (!isCatalogMediaUploadLikelyConfigured()) {
      toast.error('Upload indisponível no momento. Tente novamente em instantes.');
      return;
    }
    setUploadingLogo(variant);
    try {
      const scope = variant === 'light' ? 'tenant_logo_light' : 'tenant_logo_dark';
      const prev = variant === 'light' ? logoLight : logoDark;
      const url = await uploadCatalogImageFile(file, scope, { previousUrl: prev ?? undefined });
      if (variant === 'light') setLogoLight(url);
      else setLogoDark(url);
      toast.success(variant === 'light' ? 'Logo para fundo claro enviada.' : 'Logo para fundo escuro enviada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload. Tente outro arquivo.');
    } finally {
      setUploadingLogo(null);
    }
  }

  function handleCompanyNameChange(value: string) {
    setCompanyName(value);
    if (!slugManuallyEdited) {
      setOperationSlug(slugifyOperationalName(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setOperationSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  async function handleCompany() {
    if (!sessionToken || companyName.trim().length < 2) {
      toast.error('Informe o nome da sua operação.');
      return;
    }
    const slug = operationSlug.trim();
    if (!slug || !isValidOperationalSlug(slug) || slugCheck.status !== 'available') {
      toast.error('Escolha um endereço válido e disponível para continuar.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ ok: boolean; wizard?: WizardState; code?: string; error?: string }>(
        '/api/onboarding/wizard/company',
        {
          session_token: sessionToken,
          company_name: companyName.trim(),
          slug,
          logo_light_url: logoLight,
          logo_dark_url: logoDark,
        },
      );
      if (res.error || !res.data?.ok) {
        toast.error(parseWizardApiError(res.data ?? { error: res.error }));
        return;
      }
      setWizard(res.data.wizard ?? null);
      setStepOverride(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUsers() {
    if (!sessionToken) return;
    setSubmitting(true);
    try {
      const payload = members
        .filter((m) => m.email.trim() && m.full_name.trim())
        .map((m) => ({
          email: m.email.trim(),
          full_name: m.full_name.trim(),
          role: m.role,
          phone: m.phone.replace(/\D/g, '') || undefined,
        }));
      const res = await apiClient.post<{ ok: boolean; wizard?: WizardState; error?: string }>(
        '/api/onboarding/wizard/users',
        { session_token: sessionToken, members: payload },
      );
      if (res.error || !res.data?.ok) {
        toast.error(parseWizardApiError(res.data ?? { error: res.error }));
        return;
      }
      setWizard(res.data.wizard ?? null);
      setStepOverride(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function skipStep(step: 'users' | 'whatsapp') {
    if (!sessionToken) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ ok: boolean; wizard?: WizardState; summary?: OperationalSummary }>(
        '/api/onboarding/wizard/skip',
        { session_token: sessionToken, step },
      );
      if (res.error || !res.data?.ok) {
        toast.error(res.error ?? 'Não foi possível continuar.');
        return;
      }
      if (res.data.wizard?.onboarding_state === 'completed' || res.data.wizard?.current_step === 'completed') {
        setWhatsappWizardDone(true);
        setWizard(res.data.wizard);
        setStepOverride(null);
        return;
      }
      if (res.data.summary) {
        setSummary(res.data.summary);
        setStepOverride('summary');
        return;
      }
      setWizard(res.data.wizard ?? null);
      setStepOverride(null);
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (loading || teamStepEnabled || !sessionToken) return;
    if (displayStep !== 'users') {
      autoSkipUsersRef.current = false;
      return;
    }
    if (autoSkipUsersRef.current) return;
    autoSkipUsersRef.current = true;
    void skipStep('users');
  }, [loading, teamStepEnabled, sessionToken, displayStep]);

  const finalizeWhatsapp = useCallback(
    async (instId: string, profile?: WhatsappProfile) => {
      setSubmitting(true);
      try {
        const res = await apiClient.post<{ ok: boolean; wizard?: WizardState; summary?: OperationalSummary; error?: string }>(
          '/api/onboarding/wizard/whatsapp/complete',
          {
            session_token: sessionToken,
            instance_id: instId,
            connection_name: connectionName.trim(),
          },
        );
        if (res.error || !res.data?.ok) {
          toast.error(res.error ?? 'Falha ao concluir.');
          setWaProfile(null);
          return;
        }
        setWhatsappWizardDone(true);
        if (profile) setWaProfile(profile);
        if (res.data.wizard) setWizard(res.data.wizard as WizardState);
      } finally {
        setSubmitting(false);
      }
    },
    [sessionToken, connectionName],
  );

  const handleWhatsappConnected = useCallback(
    (profile: WhatsappProfile, instId: string) => {
      setWaProfile(profile);
      void finalizeWhatsapp(instId, profile);
    },
    [finalizeWhatsapp],
  );

  const whatsappConnection = useWhatsappOnboardingConnection({
    sessionToken,
    connectionName,
    enabled: displayStep === 'whatsapp' && !whatsappWizardDone,
    authToken,
    onConnected: handleWhatsappConnected,
  });

  async function completeOnboardingWithoutWhatsapp() {
    if (!sessionToken) return false;
    const res = await apiClient.post<{ ok: boolean; wizard?: WizardState; summary?: OperationalSummary }>(
      '/api/onboarding/wizard/skip',
      { session_token: sessionToken, step: 'whatsapp' },
    );
    if (res.error || !res.data?.ok) {
      toast.error(res.error ?? 'Não foi possível finalizar.');
      return false;
    }
    setWhatsappWizardDone(true);
    if (res.data.wizard) setWizard(res.data.wizard);
    return true;
  }

  async function handleAccessDashboard() {
    setSubmitting(true);
    try {
      if (!whatsappWizardDone) {
        if (waProfile?.connected && whatsappConnection.instanceId) {
          await finalizeWhatsapp(whatsappConnection.instanceId, waProfile);
        } else {
          const ok = await completeOnboardingWithoutWhatsapp();
          if (!ok) return;
        }
      }
      enterDashboard();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkipWhatsapp() {
    setSubmitting(true);
    try {
      const ok = await completeOnboardingWithoutWhatsapp();
      if (ok) enterDashboard();
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (displayStep === 'users') setStepOverride('company');
    else if (displayStep === 'whatsapp') setStepOverride(teamStepEnabled ? 'users' : 'company');
  }

  function enterDashboard() {
    sessionStorage.removeItem(SESSION_KEY);
    navigate('/dashboard', { replace: true });
  }

  const canGoBack =
    (displayStep === 'users' && teamStepEnabled) || displayStep === 'whatsapp';

  const wizardJourneySteps: ActivationJourneyStepId[] = ['company', 'users', 'whatsapp'];
  const showWizardAside =
    displayStep !== 'summary' &&
    displayStep !== 'completed' &&
    (displayStep === 'provision' || wizardJourneySteps.includes(displayStep as ActivationJourneyStepId));

  const isProvisionStep = displayStep === 'provision';
  const showProvisionPasswordUi = isProvisionStep && provisionPasswordUi.show;
  const isAutoProvisioning =
    isProvisionStep && Boolean(credentialDraftPassword) && needsProvision && !provisionManualFallback;
  const isCompanyStep = displayStep === 'company';
  const isTeamStep = displayStep === 'users' && teamStepEnabled;
  const isWhatsappStep = displayStep === 'whatsapp';
  const isCompletedStep = displayStep === 'completed';
  const whatsappActivated = isWhatsappStep && Boolean(waProfile?.connected);
  const whatsappDisplayProgress =
    whatsappActivated || isCompletedStep ? 100 : (wizard?.activation_progress ?? 0);
  const whatsappDisplayCompletedSteps =
    whatsappActivated || isCompletedStep
      ? teamStepEnabled
        ? ['company', 'users', 'whatsapp']
        : ['company', 'whatsapp']
      : (wizard?.completed_steps ?? []);

  const readyWhatsapp = useMemo(() => {
    const wa = wizard?.step_data?.whatsapp;
    const skipped = Boolean(wa?.skipped);
    const connected = skipped ? false : Boolean(waProfile?.connected || wa?.instance_id);
    return {
      connected,
      skipped,
      connectionName: waProfile?.connection_name ?? wa?.connection_name ?? connectionName,
      phone: waProfile?.phone ?? wa?.connected_phone ?? null,
      profileName: waProfile?.profile_name ?? wa?.profile_name ?? null,
      profilePictureUrl: waProfile?.profile_picture_url ?? null,
    };
  }, [wizard?.step_data?.whatsapp, waProfile, connectionName]);
  const companySlugReady =
    operationSlug.trim().length > 0 &&
    isValidOperationalSlug(operationSlug.trim()) &&
    slugCheck.status === 'available';
  const companyContinueDisabled = companyName.trim().length < 2 || !companySlugReady;
  const filledMembers = members.filter((m) => m.full_name.trim() && m.email.trim());
  const usedSeats = 1 + filledMembers.length;
  const canAddMember = usedSeats < seatsLimit;

  const wizardAside =
    showWizardAside && lead ? (
      showProvisionPasswordUi ? (
        <div className="hidden flex-col gap-3 lg:flex">
          <ActivationProfileCard
            name={lead.name ?? ''}
            email={lead.email}
            phone={lead.phone ?? ''}
            compact
            allowUpload
            showBadges
          />
          <OperationStatusCard pillars={buildWelcomeOperationPillars()} compact />
        </div>
      ) : isAutoProvisioning ? (
        <div className="hidden lg:flex w-full">
          <WizardOperationSidebar
            leadName={lead.name ?? ''}
            leadEmail={lead.email}
            leadPhone={lead.phone ?? ''}
            completedWizardSteps={[]}
            currentWizardStep="company"
            companyName={companyName || 'Minha operação'}
            logoLight={logoLight}
            logoDark={logoDark}
            teamStepEnabled={teamStepEnabled}
            operationLiveDraft
          />
        </div>
      ) : (
        <div className={isCompanyStep ? 'hidden lg:flex' : 'hidden lg:flex w-full'}>
          <WizardOperationSidebar
            leadName={lead.name ?? ''}
            leadEmail={lead.email}
            leadPhone={lead.phone ?? ''}
            completedWizardSteps={whatsappDisplayCompletedSteps}
            currentWizardStep={(isCompanyStep ? 'company' : displayStep) as ActivationJourneyStepId}
            companyName={companyName}
            logoLight={logoLight}
            logoDark={logoDark}
            teamStepEnabled={teamStepEnabled}
            operationLiveDraft={isCompanyStep}
          />
        </div>
      )
    ) : null;

  if (loading) {
    return (
      <div className="dark flex min-h-[100dvh] items-center justify-center bg-[hsl(228,32%,4%)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessionToken || !lead) {
    return (
      <div className="dark flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[hsl(228,32%,4%)] px-4">
        <p className="text-muted-foreground">Sessão não encontrada.</p>
        <Link to="/cadastro" className="text-sm text-primary hover:underline">
          Voltar ao cadastro
        </Link>
      </div>
    );
  }

  const header =
    isCompanyStep && wizard ? (
      <>
        <div className="lg:hidden">
          <OnboardingJourneyProgressTracker currentStepId="company" teamStepEnabled={teamStepEnabled} />
        </div>
        <div className="hidden lg:block">
          <ActivationProgressRail
            progress={wizard.activation_progress}
            currentStepId="company"
            completedSteps={wizard.completed_steps}
          />
        </div>
      </>
    ) : isTeamStep ? (
      <div className="lg:hidden">
        <OnboardingJourneyProgressTracker currentStepId="users" teamStepEnabled={teamStepEnabled} />
      </div>
    ) : displayStep === 'whatsapp' && !needsProvision && wizard ? (
      <>
        <div className="lg:hidden">
          <OnboardingJourneyProgressTracker
            currentStepId="whatsapp"
            teamStepEnabled={teamStepEnabled}
            allComplete={whatsappActivated}
          />
        </div>
        <div className="hidden lg:block">
          <ActivationProgressRail
            progress={whatsappDisplayProgress}
            currentStepId="whatsapp"
            completedSteps={whatsappDisplayCompletedSteps}
            celebrateComplete={whatsappActivated}
          />
        </div>
      </>
    ) : displayStep !== 'summary' && displayStep !== 'completed' && !needsProvision && wizard ? (
      <ActivationProgressRail
        progress={wizard.activation_progress}
        currentStepId={progressRailStep}
        completedSteps={wizard.completed_steps}
      />
    ) : isAutoProvisioning ? (
      <>
        <div className="lg:hidden">
          <OnboardingJourneyProgressTracker currentStepId="company" teamStepEnabled={teamStepEnabled} />
        </div>
        <div className="hidden lg:block">
          <ActivationProgressRail progress={0} currentStepId="company" completedSteps={[]} />
        </div>
      </>
    ) : showProvisionPasswordUi ? (
      <>
        <div className="lg:hidden">
          <ProvisionMobileProgressTracker currentStepId="profile" />
        </div>
        <p className="hidden text-sm text-muted-foreground lg:block">Primeiro acesso à sua operação</p>
      </>
    ) : null;

  const provisionContinueDisabled = password.length < 6 || password !== confirmPassword;

  const footer =
    displayStep === 'summary' ? null : showProvisionPasswordUi ? (
      <>
        <div className="lg:hidden">
          <ProvisionMobileFooter
            onSubmit={() => void handleProvision()}
            loading={submitting}
            disabled={provisionContinueDisabled}
          />
        </div>
        <div className="hidden lg:block">
          <WizardFocusNav
            loading={submitting}
            onContinue={() => void handleProvision()}
            continueLabel="Criar operação"
            continueDisabled={password.length < 6}
          />
        </div>
      </>
    ) : isCompanyStep ? (
      <WizardStickyContinueFooter
        onContinue={() => void handleCompany()}
        loading={submitting}
        disabled={companyContinueDisabled}
      />
    ) : isTeamStep ? (
      <>
        <div className="lg:hidden">
          <WizardStickyContinueFooter
            onContinue={() => void handleUsers()}
            loading={submitting}
          />
        </div>
        <div className="hidden lg:block">
          <WizardFocusNav
            showBack
            onBack={goBack}
            onContinue={() => void handleUsers()}
            loading={submitting}
            continueLabel="Continuar"
          />
        </div>
      </>
    ) : isWhatsappStep && !whatsappActivated ? (
      <>
        <div className="lg:hidden">
          <WizardFocusNav showBack={canGoBack} onBack={goBack} loading={submitting} />
        </div>
        <div className="hidden lg:block">
          <WizardFocusNav
            showBack={canGoBack}
            onBack={goBack}
            loading={submitting}
            showSkip
            skipLabel="Entrar sem conectar"
            onSkip={() => void handleSkipWhatsapp()}
          />
        </div>
      </>
    ) : isCompletedStep ? (
      <div className="lg:hidden">
        <WizardStickyContinueFooter
          onContinue={enterDashboard}
          loading={submitting}
          label="Acessar Dashboard"
        />
      </div>
    ) : null;

  const provisionUiReasonAttr =
    showProvisionPasswordUi
      ? provisionPasswordUiReason
      : isAutoProvisioning
        ? 'auto_provisioning'
        : 'hidden';

  return (
    <div
      className="contents"
      data-provision-password-ui-reason={provisionUiReasonAttr}
      data-provision-needs-provision={needsProvision ? 'true' : 'false'}
    >
    <OperationalOnboardingFocusLayout
      header={header ?? <div />}
      footer={footer ?? undefined}
      aside={wizardAside ?? undefined}
      mobileFixedFooter={showProvisionPasswordUi || isCompanyStep || isTeamStep || isCompletedStep}
      reserveMobileFooterSpace={showProvisionPasswordUi || isCompanyStep || isTeamStep || isCompletedStep}
      compactVertical={isCompanyStep || isWhatsappStep || isCompletedStep}
      className={isCompanyStep ? 'lg:overflow-hidden' : undefined}
    >
      {displayStep === 'summary' && summary ? (
        <OperationalSummaryStep summary={summary} loading={submitting} onEnterDashboard={enterDashboard} />
      ) : isCompletedStep ? (
        <OperationReadyStep
          adminName={lead.name ?? ''}
          adminEmail={lead.email}
          adminPhone={lead.phone}
          companyName={companyName}
          logoLight={logoLight}
          logoDark={logoDark}
          whatsapp={readyWhatsapp}
          loading={submitting}
          onAccessDashboard={enterDashboard}
        />
      ) : (
        <div key={displayStep} className="animate-in fade-in slide-in-from-bottom-2 duration-400 fill-mode-both">
          {isAutoProvisioning ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Preparando sua operação</p>
                <p className="text-sm text-muted-foreground">
                  Estamos criando seu workspace. Em instantes você configura a empresa.
                </p>
              </div>
            </div>
          ) : showProvisionPasswordUi ? (
            <>
              <div className="space-y-5 lg:hidden">
                <ProvisionMobileProfileStrip
                  name={lead.name ?? ''}
                  email={lead.email}
                  phone={lead.phone ?? ''}
                />
                <ProvisionMobilePasswordForm
                  password={password}
                  confirmPassword={confirmPassword}
                  onPasswordChange={setPassword}
                  onConfirmPasswordChange={setConfirmPassword}
                />
              </div>
              <div className="hidden lg:block">
                <StepHeading title={stepMeta.headline} subtitle={stepMeta.subtitle} />
                <div className="space-y-6">
                  <p className="text-xs text-muted-foreground">
                    Conta: <span className="text-foreground/90">{lead.email}</span>
                    {lead.name ? (
                      <>
                        {' '}
                        · Responsável: <span className="text-foreground/80">{lead.name}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Senha de acesso</Label>
                      <Input
                        type="password"
                        className="h-11 border-white/10 bg-white/[0.03]"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">Confirmar senha</Label>
                      <Input
                        type="password"
                        className="h-11 border-white/10 bg-white/[0.03]"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : isWhatsappStep && !whatsappActivated ? (
            <StepHeading title={stepMeta.headline} subtitle={stepMeta.subtitle} compact />
          ) : !isCompanyStep && !isTeamStep && !isWhatsappStep && !isCompletedStep ? (
            <StepHeading title={stepMeta.headline} subtitle={stepMeta.subtitle} compact={isWhatsappStep} />
          ) : null}

          {isTeamStep ? (
            <div className="space-y-4">
              <OperationalCompanyCard
                className="lg:hidden"
                companyName={companyName}
                logoLight={logoLight}
                logoDark={logoDark}
              />
              <TeamStepMainForm
                members={members.map(({ email, full_name, role }) => ({ email, full_name, role }))}
                seatsLimit={seatsLimit}
                canAddMember={canAddMember}
                onChange={(next) =>
                  setMembers(next.map((m, i) => ({ ...m, phone: members[i]?.phone ?? '' })))
                }
              />
            </div>
          ) : null}

          {isCompanyStep ? (
            <>
              <div className="space-y-4 lg:hidden">
                <OperationalCompanyCard
                  companyName={companyName}
                  logoLight={logoLight}
                  logoDark={logoDark}
                  liveDraft
                  compact
                />
                <CompanyStepMainForm
                  layout="mobile"
                  companyName={companyName}
                  slug={operationSlug}
                  slugCheck={slugCheck}
                  logoLight={logoLight}
                  logoDark={logoDark}
                  uploadingLogo={uploadingLogo}
                  acceptedImageTypes={ACCEPTED_IMAGE}
                  onCompanyNameChange={handleCompanyNameChange}
                  onSlugChange={handleSlugChange}
                  onUseSlugSuggestion={(s) => {
                    setSlugManuallyEdited(true);
                    setOperationSlug(s);
                  }}
                  onLogoUpload={(file, variant) => void handleLogoUpload(file, variant)}
                />
              </div>
              <div className="hidden lg:block">
                <CompanyStepMainForm
                  layout="desktop"
                  companyName={companyName}
                  slug={operationSlug}
                  slugCheck={slugCheck}
                  logoLight={logoLight}
                  logoDark={logoDark}
                  uploadingLogo={uploadingLogo}
                  acceptedImageTypes={ACCEPTED_IMAGE}
                  onCompanyNameChange={handleCompanyNameChange}
                  onSlugChange={handleSlugChange}
                  onUseSlugSuggestion={(s) => {
                    setSlugManuallyEdited(true);
                    setOperationSlug(s);
                  }}
                  onLogoUpload={(file, variant) => void handleLogoUpload(file, variant)}
                />
              </div>
            </>
          ) : null}

          {isWhatsappStep ? (
            <WhatsappFinalizationStep
              activated={whatsappActivated}
              adminName={lead?.name ?? ''}
              companyName={companyName}
              logoLight={logoLight}
              logoDark={logoDark}
              teamStepEnabled={teamStepEnabled}
              connectionName={connectionName}
              onConnectionNameChange={setConnectionName}
              phase={whatsappConnection.phase}
              qrCode={whatsappConnection.qrCode}
              waProfile={waProfile}
              errorMessage={whatsappConnection.errorMessage}
              starting={whatsappConnection.starting}
              finishing={submitting}
              onEnterDashboard={() => void handleAccessDashboard()}
              onStartWhatsapp={() => void whatsappConnection.startConnection()}
              onEnterWithoutConnect={() => void handleSkipWhatsapp()}
            />
          ) : null}
        </div>
      )}
    </OperationalOnboardingFocusLayout>
    </div>
  );
}

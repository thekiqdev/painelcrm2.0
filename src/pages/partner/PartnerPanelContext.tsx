import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from '@/components/ui/sonner';
import { apiClient } from '@/integrations/api/client';
import {
  brlToCents,
  buildChannelSetupSteps,
  type ChannelSetupStep,
  type CommissionRow,
  type DomainInstructions,
  type GatewayPayload,
  type LicenseSummary,
  type PartnerCustomer,
  type PartnerMe,
  type PartnerSeller,
  type PlanProjection,
  type SellPlan,
  type SellerRule,
} from './partnerTypes';

type PartnerPanelContextValue = {
  me: PartnerMe | null;
  error: string | null;
  loading: boolean;
  saving: boolean;
  isAdmin: boolean;
  isSeller: boolean;
  setupSteps: ChannelSetupStep[];
  setupProgress: number;
  nextSetupStep: ChannelSetupStep | null;

  domainInput: string;
  setDomainInput: (v: string) => void;
  domainInfo: DomainInstructions | null;
  productName: string;
  setProductName: (v: string) => void;
  publicName: string;
  setPublicName: (v: string) => void;
  logoUrl: string;
  setLogoUrl: (v: string) => void;
  tagline: string;
  setTagline: (v: string) => void;

  licenses: LicenseSummary | null;
  gateway: GatewayPayload | null;
  apiKey: string;
  setApiKey: (v: string) => void;
  asaasEnv: 'sandbox' | 'production';
  setAsaasEnv: (v: 'sandbox' | 'production') => void;

  plans: SellPlan[];
  planName: string;
  setPlanName: (v: string) => void;
  planPriceBrl: string;
  setPlanPriceBrl: (v: string) => void;
  planInterval: string;
  setPlanInterval: (v: string) => void;
  planTrialDays: string;
  setPlanTrialDays: (v: string) => void;
  projection: PlanProjection | null;

  customers: PartnerCustomer[];
  sellers: PartnerSeller[];
  houseLink: { sale_url: string } | null;
  sellerLink: { sale_url: string; referral_code: string } | null;

  rules: SellerRule[];
  commissions: CommissionRow[];
  selectedLedger: Record<string, boolean>;
  setSelectedLedger: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  ruleName: string;
  setRuleName: (v: string) => void;
  ruleType: 'percent' | 'fixed' | 'hybrid';
  setRuleType: (v: 'percent' | 'fixed' | 'hybrid') => void;
  rulePercent: string;
  setRulePercent: (v: string) => void;
  ruleFixedBrl: string;
  setRuleFixedBrl: (v: string) => void;
  ruleApplies: string;
  setRuleApplies: (v: string) => void;
  ruleSellerId: string;
  setRuleSellerId: (v: string) => void;

  sellerEmail: string;
  setSellerEmail: (v: string) => void;
  sellerName: string;
  setSellerName: (v: string) => void;
  sellerEarnings: {
    available_cents: number;
    paid_cents: number;
    items: {
      id: string;
      commission_amount_cents: number;
      status: string;
      customer_name?: string | null;
    }[];
  } | null;

  reload: () => Promise<void>;
  saveBrand: () => Promise<boolean>;
  saveDomain: () => Promise<boolean>;
  verifyDomain: () => Promise<boolean>;
  clearDomain: () => Promise<boolean>;
  saveGateway: () => Promise<boolean>;
  testGateway: () => Promise<boolean>;
  createPlan: () => Promise<boolean>;
  publishPlan: (id: string) => Promise<boolean>;
  createSeller: () => Promise<boolean>;
  createCustomer: (input: {
    company_name: string;
    admin_email: string;
    admin_name?: string;
    admin_password: string;
    seats: number;
    sell_plan_id: string;
    seller_user_id?: string | null;
    cpf_cnpj?: string | null;
  }) => Promise<boolean>;
  updateCustomer: (
    customerId: string,
    input: {
      company_name?: string;
      admin_name?: string;
      admin_email?: string;
      admin_password?: string;
      seats?: number;
      sell_plan_id?: string;
      seller_user_id?: string | null;
      cpf_cnpj?: string | null;
    }
  ) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
  deactivateSeller: (userId: string) => Promise<boolean>;
  reassignCustomer: (customerId: string, sellerUserId: string | null) => Promise<boolean>;
  saveRule: () => Promise<boolean>;
  markSelectedPaid: () => Promise<boolean>;
  copySaleLink: (url: string) => Promise<void>;
};

const PartnerPanelContext = createContext<PartnerPanelContextValue | null>(null);

export function PartnerPanelProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<PartnerMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [domainInput, setDomainInput] = useState('');
  const [domainInfo, setDomainInfo] = useState<DomainInstructions | null>(null);
  const [productName, setProductName] = useState('');
  const [publicName, setPublicName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [tagline, setTagline] = useState('');

  const [licenses, setLicenses] = useState<LicenseSummary | null>(null);
  const [gateway, setGateway] = useState<GatewayPayload | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [asaasEnv, setAsaasEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [plans, setPlans] = useState<SellPlan[]>([]);
  const [planName, setPlanName] = useState('');
  const [planPriceBrl, setPlanPriceBrl] = useState('99');
  const [planInterval, setPlanInterval] = useState('monthly');
  const [planTrialDays, setPlanTrialDays] = useState('0');
  const [projection, setProjection] = useState<PlanProjection | null>(null);
  const [customers, setCustomers] = useState<PartnerCustomer[]>([]);
  const [sellers, setSellers] = useState<PartnerSeller[]>([]);
  const [houseLink, setHouseLink] = useState<{ sale_url: string } | null>(null);
  const [sellerLink, setSellerLink] = useState<{
    sale_url: string;
    referral_code: string;
  } | null>(null);
  const [sellerEmail, setSellerEmail] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [rules, setRules] = useState<SellerRule[]>([]);
  const [commissions, setCommissions] = useState<CommissionRow[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<Record<string, boolean>>({});
  const [ruleName, setRuleName] = useState('Equipe padrão');
  const [ruleType, setRuleType] = useState<'percent' | 'fixed' | 'hybrid'>('percent');
  const [rulePercent, setRulePercent] = useState('10');
  const [ruleFixedBrl, setRuleFixedBrl] = useState('0');
  const [ruleApplies, setRuleApplies] = useState('both');
  const [ruleSellerId, setRuleSellerId] = useState('__team__');
  const [sellerEarnings, setSellerEarnings] = useState<{
    available_cents: number;
    paid_cents: number;
    items: {
      id: string;
      commission_amount_cents: number;
      status: string;
      customer_name?: string | null;
    }[];
  } | null>(null);

  const reload = useCallback(async () => {
    const res = await apiClient.get<PartnerMe>('/api/partner/me');
    if (res.error) {
      setError(res.error || 'Sem acesso Partner');
      setMe(null);
      setLoading(false);
      toast.error(res.error || 'Ative partner.channel_v1 em Super Admin → Feature Flags');
      return;
    }
    setError(null);
    setMe(res.data!);
    setProductName(res.data!.profile.product_name || '');
    setPublicName(res.data!.profile.public_name || '');
    setLogoUrl(res.data!.profile.logo_url || '');
    const t = res.data!.profile.theme_json?.tagline;
    setTagline(typeof t === 'string' ? t : '');
    setDomainInput(res.data!.profile.custom_domain || '');

    if (res.data!.role === 'partner_seller') {
      const link = await apiClient.get<{ sale_url: string; referral_code: string }>(
        '/api/partner/seller/me/link'
      );
      if (!link.error && link.data) setSellerLink(link.data);
      const earn = await apiClient.get<{
        available_cents: number;
        paid_cents: number;
        items: {
          id: string;
          commission_amount_cents: number;
          status: string;
          customer_name?: string | null;
        }[];
      }>('/api/partner/seller/me/commissions');
      if (!earn.error && earn.data) setSellerEarnings(earn.data);
      setLoading(false);
      return;
    }

    const d = await apiClient.get<DomainInstructions>('/api/partner/domain');
    if (!d.error && d.data) setDomainInfo(d.data);

    const lic = await apiClient.get<LicenseSummary>('/api/partner/licenses');
    if (!lic.error && lic.data) setLicenses(lic.data);

    const gw = await apiClient.get<GatewayPayload>('/api/partner/gateway');
    if (!gw.error && gw.data) {
      setGateway(gw.data);
      if (gw.data.config?.environment === 'production' || gw.data.config?.environment === 'sandbox') {
        setAsaasEnv(gw.data.config.environment);
      }
    }

    const sp = await apiClient.get<SellPlan[]>('/api/partner/sell-plans');
    if (!sp.error && sp.data) setPlans(sp.data);

    const cust = await apiClient.get<PartnerCustomer[]>('/api/partner/customers');
    if (!cust.error && cust.data) setCustomers(cust.data);

    const sel = await apiClient.get<PartnerSeller[]>('/api/partner/sellers');
    if (!sel.error && sel.data) setSellers(sel.data);

    const house = await apiClient.get<{ sale_url: string }>('/api/partner/sale-link');
    if (!house.error && house.data) setHouseLink(house.data);

    const rl = await apiClient.get<SellerRule[]>('/api/partner/seller-rules');
    if (!rl.error && rl.data) setRules(rl.data);

    const cm = await apiClient.get<CommissionRow[]>('/api/partner/commissions');
    if (!cm.error && cm.data) setCommissions(cm.data);

    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (me?.role !== 'partner_admin') return;
    const price = brlToCents(planPriceBrl);
    if (!Number.isFinite(price)) {
      setProjection(null);
      return;
    }
    void (async () => {
      const q = new URLSearchParams({
        price_cents: String(price),
        billing_interval: planInterval,
        estimated_customers: '1',
        estimated_users_per_customer: '1',
      });
      const res = await apiClient.get<PlanProjection>(`/api/partner/sell-plans/projection?${q}`);
      if (!res.error && res.data) setProjection(res.data);
    })();
  }, [planPriceBrl, planInterval, me?.role]);

  const setupSteps = useMemo(
    () => buildChannelSetupSteps({ me, plans, gateway }),
    [me, plans, gateway]
  );
  const setupDone = setupSteps.filter((s) => s.done).length;
  const setupProgress = setupSteps.length ? Math.round((setupDone / setupSteps.length) * 100) : 0;
  const nextSetupStep = setupSteps.find((s) => !s.done) ?? null;

  const isAdmin = me?.role === 'partner_admin';
  const isSeller = me?.role === 'partner_seller';

  const saveBrand = async () => {
    setSaving(true);
    const theme_json = {
      ...(me?.profile.theme_json || {}),
      tagline: tagline.trim() || undefined,
    };
    const res = await apiClient.patch('/api/partner/profile', {
      public_name: publicName.trim(),
      product_name: productName.trim(),
      logo_url: logoUrl.trim() || null,
      theme_json,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Identidade atualizada');
    await reload();
    return true;
  };

  const saveDomain = async () => {
    setSaving(true);
    const res = await apiClient.post<DomainInstructions>('/api/partner/domain', {
      domain: domainInput.trim(),
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    setDomainInfo(res.data!);
    toast.success('Domínio salvo — configure o DNS e verifique');
    await reload();
    return true;
  };

  const verifyDomain = async () => {
    setSaving(true);
    const res = await apiClient.post<{
      verified: boolean;
      domain_status: string;
      method: string;
      instructions: DomainInstructions | null;
    }>('/api/partner/domain/verify', {});
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    if (res.data?.instructions) setDomainInfo(res.data.instructions);
    if (res.data?.verified) toast.success(`Domínio verificado (${res.data.method})`);
    else toast.error('DNS ainda não encontrado — confira TXT/CNAME');
    await reload();
    return Boolean(res.data?.verified);
  };

  const clearDomain = async () => {
    setSaving(true);
    const res = await apiClient.delete('/api/partner/domain');
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    setDomainInput('');
    setDomainInfo(null);
    toast.success('Domínio removido — link voltou ao padrão da plataforma');
    await reload();
    return true;
  };

  const saveGateway = async () => {
    if (!apiKey.trim() && !gateway?.config?.hasCredentials) {
      toast.error('Informe a API Key do Asaas');
      return false;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      gateway_key: 'asaas',
      credentials: {
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        env: asaasEnv,
      },
      options: { env: asaasEnv },
    };
    const res = await apiClient.put('/api/partner/gateway', body);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    setApiKey('');
    toast.success('Gateway salvo');
    await reload();
    return true;
  };

  const testGateway = async () => {
    setSaving(true);
    const res = await apiClient.post<{ connected: boolean; error?: string }>(
      '/api/partner/gateway/test',
      {}
    );
    setSaving(false);
    if (res.error || !res.data?.connected) {
      toast.error(res.data?.error || res.error || 'Falha no teste de conexão');
      await reload();
      return false;
    }
    toast.success('Asaas conectado');
    await reload();
    return true;
  };

  const createPlan = async () => {
    const price = brlToCents(planPriceBrl);
    if (!planName.trim() || !Number.isFinite(price)) {
      toast.error('Informe nome e preço válidos');
      return false;
    }
    const trialDays = Math.max(0, Math.min(365, Math.floor(Number(String(planTrialDays).replace(',', '.')) || 0)));
    setSaving(true);
    const res = await apiClient.post('/api/partner/sell-plans', {
      name: planName.trim(),
      price_cents: price,
      billing_interval: planInterval,
      trial_days: trialDays,
      status: 'draft',
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Plano criado como rascunho');
    setPlanName('');
    setPlanTrialDays('0');
    await reload();
    return true;
  };

  const publishPlan = async (id: string) => {
    setSaving(true);
    const res = await apiClient.patch(`/api/partner/sell-plans/${id}`, { status: 'active' });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Plano publicado');
    await reload();
    return true;
  };

  const createSeller = async () => {
    if (!sellerEmail.trim()) {
      toast.error('Informe o e-mail do vendedor');
      return false;
    }
    setSaving(true);
    const res = await apiClient.post<{ temporary_password?: string }>('/api/partner/sellers', {
      email: sellerEmail.trim(),
      name: sellerName.trim() || undefined,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    if (res.data?.temporary_password) {
      toast.success(`Vendedor criado. Senha temporária: ${res.data.temporary_password}`);
    } else {
      toast.success('Vendedor criado');
    }
    setSellerEmail('');
    setSellerName('');
    await reload();
    return true;
  };

  const createCustomer = async (input: {
    company_name: string;
    admin_email: string;
    admin_name?: string;
    admin_password: string;
    seats: number;
    sell_plan_id: string;
    seller_user_id?: string | null;
    cpf_cnpj?: string | null;
  }) => {
    if (!input.company_name.trim() || !input.admin_email.trim()) {
      toast.error('Informe empresa e login (e-mail) do admin');
      return false;
    }
    if (!input.admin_password || input.admin_password.length < 8) {
      toast.error('Informe a senha do admin (mín. 8 caracteres)');
      return false;
    }
    if (!input.sell_plan_id) {
      toast.error('Selecione um plano de venda');
      return false;
    }
    if (!Number.isFinite(input.seats) || input.seats < 1) {
      toast.error('Informe ao menos 1 licença');
      return false;
    }
    setSaving(true);
    const res = await apiClient.post('/api/partner/customers', {
      company_name: input.company_name.trim(),
      admin_email: input.admin_email.trim(),
      admin_name: input.admin_name?.trim() || undefined,
      admin_password: input.admin_password,
      seats: input.seats,
      sell_plan_id: input.sell_plan_id,
      seller_user_id: input.seller_user_id || null,
      ...(input.cpf_cnpj?.replace(/\D/g, '')
        ? { cpf_cnpj: input.cpf_cnpj.replace(/\D/g, '') }
        : {}),
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Cliente criado');
    await reload();
    return true;
  };

  const updateCustomer = async (
    customerId: string,
    input: {
      company_name?: string;
      admin_name?: string;
      admin_email?: string;
      admin_password?: string;
      seats?: number;
      sell_plan_id?: string;
      seller_user_id?: string | null;
      cpf_cnpj?: string | null;
    }
  ) => {
    setSaving(true);
    const res = await apiClient.patch(`/api/partner/customers/${customerId}`, input);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Cliente atualizado');
    await reload();
    return true;
  };

  const deleteCustomer = async (customerId: string) => {
    setSaving(true);
    const res = await apiClient.delete(`/api/partner/customers/${customerId}`);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Cliente excluído');
    await reload();
    return true;
  };

  const reassignCustomer = async (customerId: string, sellerUserId: string | null) => {
    return updateCustomer(customerId, { seller_user_id: sellerUserId });
  };

  const saveRule = async () => {
    const percentBps = Math.round(Number(String(rulePercent).replace(',', '.')) * 100);
    const fixed = brlToCents(ruleFixedBrl);
    setSaving(true);
    const res = await apiClient.post('/api/partner/seller-rules', {
      name: ruleName.trim() || 'Regra',
      rule_type: ruleType,
      percent_bps: ruleType === 'fixed' ? null : percentBps,
      fixed_cents: ruleType === 'percent' ? null : fixed,
      applies_to: ruleApplies,
      cycle_mode: 'recurring',
      seller_user_id: ruleSellerId === '__team__' ? null : ruleSellerId,
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Regra salva e ativada');
    await reload();
    return true;
  };

  const markSelectedPaid = async () => {
    const ids = Object.entries(selectedLedger)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (ids.length === 0) {
      toast.error('Selecione comissões disponíveis');
      return false;
    }
    setSaving(true);
    const res = await apiClient.post('/api/partner/commissions/payouts', {
      ledger_ids: ids,
      reference: 'manual',
    });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    setSelectedLedger({});
    toast.success('Comissões marcadas como pagas');
    await reload();
    return true;
  };

  const deactivateSeller = async (userId: string) => {
    setSaving(true);
    const res = await apiClient.patch(`/api/partner/sellers/${userId}`, { status: 'inactive' });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return false;
    }
    toast.success('Vendedor desativado');
    await reload();
    return true;
  };

  const copySaleLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  const value: PartnerPanelContextValue = {
    me,
    error,
    loading,
    saving,
    isAdmin,
    isSeller,
    setupSteps,
    setupProgress,
    nextSetupStep,
    domainInput,
    setDomainInput,
    domainInfo,
    productName,
    setProductName,
    publicName,
    setPublicName,
    logoUrl,
    setLogoUrl,
    tagline,
    setTagline,
    licenses,
    gateway,
    apiKey,
    setApiKey,
    asaasEnv,
    setAsaasEnv,
    plans,
    planName,
    setPlanName,
    planPriceBrl,
    setPlanPriceBrl,
    planInterval,
    setPlanInterval,
    planTrialDays,
    setPlanTrialDays,
    projection,
    customers,
    sellers,
    houseLink,
    sellerLink,
    rules,
    commissions,
    selectedLedger,
    setSelectedLedger,
    ruleName,
    setRuleName,
    ruleType,
    setRuleType,
    rulePercent,
    setRulePercent,
    ruleFixedBrl,
    setRuleFixedBrl,
    ruleApplies,
    setRuleApplies,
    ruleSellerId,
    setRuleSellerId,
    sellerEmail,
    setSellerEmail,
    sellerName,
    setSellerName,
    sellerEarnings,
    reload,
    saveBrand,
    saveDomain,
    verifyDomain,
    clearDomain,
    saveGateway,
    testGateway,
    createPlan,
    publishPlan,
    createSeller,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    deactivateSeller,
    reassignCustomer,
    saveRule,
    markSelectedPaid,
    copySaleLink,
  };

  return (
    <PartnerPanelContext.Provider value={value}>{children}</PartnerPanelContext.Provider>
  );
}

export function usePartnerPanel(): PartnerPanelContextValue {
  const ctx = useContext(PartnerPanelContext);
  if (!ctx) throw new Error('usePartnerPanel must be used within PartnerPanelProvider');
  return ctx;
}

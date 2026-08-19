/** Tipos do Painel do Revendedor (M5) — espelham payloads das APIs /api/partner/*. */

export type PartnerMe = {
  partner_tenant_id: string;
  role: string;
  profile: {
    public_name: string;
    product_name: string;
    program_type: string;
    status: string;
    logo_url: string | null;
    custom_domain: string | null;
    domain_status: string;
    theme_json?: Record<string, unknown>;
    payout_cadence_preference?: string;
  };
  pool: {
    purchased_seats: number;
    used_seats_cache: number;
    unit_cost_cents: number;
  } | null;
};

export type DomainInstructions = {
  custom_domain: string | null;
  domain_status: string;
  domain_verification_token?: string;
  txt_host?: string;
  txt_value?: string;
  cname_host?: string | null;
  cname_target?: string | null;
  bypass_enabled?: boolean;
};

export type LicenseSummary = {
  purchased_seats: number;
  used_seats: number;
  available_seats: number;
  unit_cost_cents: number;
  floor_price_cents: number | null;
};

export type SellPlan = {
  id: string;
  name: string;
  slug: string;
  price_cents: number;
  billing_interval: string;
  status: string;
  trial_days?: number;
};

export type GatewayPayload = {
  config: {
    gateway_key: string;
    hasCredentials: boolean;
    status?: string;
    last_connection_status?: string | null;
    api_key_masked?: string | null;
    environment?: string | null;
  } | null;
  can_charge: boolean;
  can_charge_reason: string;
};

export type PartnerCustomer = {
  id: string;
  name: string;
  slug: string;
  status: string;
  seller_user_id: string | null;
  users_count: number;
  seats_allocated?: number | null;
  partner_sell_plan_id?: string | null;
  sell_plan_name?: string | null;
  sell_plan_price_cents?: number | null;
  admin_email?: string | null;
  admin_name?: string | null;
  cpf_cnpj?: string | null;
};

export type PartnerSeller = {
  user_id: string;
  email: string;
  name: string | null;
  referral_code: string | null;
  status: string;
};

export type SellerRule = {
  id: string;
  name: string;
  rule_type: string;
  percent_bps: number | null;
  fixed_cents: number | null;
  applies_to: string;
  cycle_mode: string;
  seller_user_id: string | null;
  status: string;
};

export type CommissionRow = {
  id: string;
  seller_user_id: string;
  seller_email: string | null;
  customer_name: string | null;
  commission_amount_cents: number;
  profit_amount_cents: number;
  commission_capped: boolean;
  status: string;
  cycle_number: number;
};

export type PlanProjection = {
  projected_margin_cents: number;
  projected_revenue_cents: number;
  projected_cost_cents: number;
  floor_price_cents: number;
};

export function formatBrlCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function brlToCents(raw: string): number {
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export function billingIntervalLabel(interval: string): string {
  const map: Record<string, string> = {
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    yearly: 'Anual',
  };
  return map[interval] || interval;
}

export function appliesToLabel(applies: string): string {
  const map: Record<string, string> = {
    both: '1ª mensalidade + renovações',
    first_only: 'Somente a 1ª venda',
    renewals: 'Somente renovações',
  };
  return map[applies] || applies;
}

export function domainStatusLabel(status: string): string {
  const map: Record<string, string> = {
    none: 'Não configurado',
    pending: 'Aguardando DNS',
    verified: 'Verificado',
    active: 'Ativo',
    failed: 'Falhou',
  };
  return map[status] || status;
}

export type ChannelSetupStep = {
  id: string;
  label: string;
  done: boolean;
  to: string;
};

export function buildChannelSetupSteps(input: {
  me: PartnerMe | null;
  plans: SellPlan[];
  gateway: GatewayPayload | null;
}): ChannelSetupStep[] {
  const { me, plans, gateway } = input;
  const hasIdentity = Boolean(me?.profile.public_name?.trim() && me?.profile.product_name?.trim());
  const hasBrand = Boolean(me?.profile.logo_url?.trim() || (typeof me?.profile.theme_json?.tagline === 'string' && me.profile.theme_json.tagline.trim()));
  const hasPlan = plans.some((p) => p.status === 'active');
  const hasGateway = Boolean(gateway?.can_charge);
  const domainOk =
    me?.profile.domain_status === 'verified' || me?.profile.domain_status === 'active';

  return [
    { id: 'identity', label: 'Informações da empresa', done: hasIdentity, to: '/partner/config/identity' },
    { id: 'brand', label: 'Marca', done: hasBrand, to: '/partner/config/brand' },
    { id: 'plan', label: 'Plano de venda', done: hasPlan, to: '/partner/plans' },
    { id: 'gateway', label: 'Gateway', done: hasGateway, to: '/partner/gateway' },
    { id: 'domain', label: 'Domínio próprio', done: Boolean(domainOk), to: '/partner/config/domain' },
  ];
}

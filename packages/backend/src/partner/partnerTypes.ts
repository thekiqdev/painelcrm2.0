/**
 * M5 Partner channel — types (S1).
 */

export type PartnerAccountType = 'platform_customer' | 'partner' | 'customer_tenant';

export type PartnerProgramType = 'license_pool' | 'revenue_share';

export type PartnerMembershipRole = 'partner_admin' | 'partner_seller';

export type PartnerProfileStatus = 'active' | 'suspended';

export type PartnerDomainStatus = 'none' | 'pending' | 'verified' | 'active';

export type PartnerPayoutCadence = 'monthly' | 'biweekly' | 'on_demand';

export type PartnerLicensePoolProgramConfig = {
  floor_price_cents: number;
  unit_cost_cents: number;
  min_seats: number;
};

export type PartnerProfileRow = {
  partner_tenant_id: string;
  program_type: PartnerProgramType;
  program_config_json: Record<string, unknown>;
  public_name: string;
  product_name: string;
  custom_domain: string | null;
  domain_status: PartnerDomainStatus;
  domain_verification_token: string | null;
  logo_url: string | null;
  theme_json: Record<string, unknown>;
  payout_cadence_preference: PartnerPayoutCadence;
  status: PartnerProfileStatus;
  created_at: string;
  updated_at: string;
};

export type PartnerMembershipRow = {
  id: string;
  partner_tenant_id: string;
  user_id: string;
  role: PartnerMembershipRole;
  status: 'active' | 'inactive';
  referral_code: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerLicensePoolRow = {
  partner_tenant_id: string;
  purchased_seats: number;
  included_seats?: number;
  extra_seats?: number;
  unit_cost_cents: number;
  used_seats_cache: number;
  updated_at: string;
};

export type PartnerListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  account_type: PartnerAccountType;
  created_at: string;
  public_name: string;
  product_name: string;
  program_type: PartnerProgramType;
  partner_status: PartnerProfileStatus;
  purchased_seats: number;
  used_seats_cache: number;
  unit_cost_cents: number;
  floor_price_cents: number | null;
  admin_email: string | null;
};

export type PartnerDetail = PartnerListItem & {
  plan_id: string;
  domain: string | null;
  /** CPF (11) ou CNPJ (14) — dígitos em tenants.cpf_cnpj */
  cpf_cnpj: string | null;
  program_config_json: Record<string, unknown>;
  logo_url: string | null;
  theme_json: Record<string, unknown>;
  custom_domain: string | null;
  domain_status: PartnerDomainStatus;
  payout_cadence_preference: PartnerPayoutCadence;
  wholesale_plan_id: string | null;
  wholesale_status: 'none' | 'active' | 'past_due' | 'canceled';
  wholesale_subscription_id: string | null;
  wholesale_plan_name: string | null;
  /** Block S3 — NULL = usa setting global */
  wholesale_block_after_days: number | null;
  memberships: Array<{
    id: string;
    user_id: string;
    role: PartnerMembershipRole;
    status: string;
    email: string | null;
    referral_code: string | null;
  }>;
};

export type PartnerContext = {
  partnerTenantId: string;
  membershipId: string;
  role: PartnerMembershipRole;
  profile: PartnerProfileRow;
  pool: PartnerLicensePoolRow | null;
};

export type CreatePartnerInput = {
  name: string;
  slug: string;
  admin_email: string;
  admin_name?: string;
  admin_password?: string;
  program_type?: PartnerProgramType;
  floor_price_cents: number;
  unit_cost_cents: number;
  /** Grant inicial opcional (default 0). M5-W: Partner pode nascer sem seats. */
  purchased_seats?: number;
  public_name: string;
  product_name: string;
  plan_id?: string | null;
  domain?: string | null;
  /** CPF ou CNPJ (opcional no cadastro; obrigatório na cobrança). */
  cpf_cnpj?: string | null;
  /**
   * Plano atacado opcional. Se informado, Super Admin atrela (grant).
   * Se omitido, o Partner escolhe em /partner/platform-plan.
   */
  wholesale_plan_id?: string | null;
};

export type PatchPartnerInput = {
  name?: string;
  floor_price_cents?: number;
  unit_cost_cents?: number;
  purchased_seats?: number;
  /** Incremento relativo de seats (alternativa a purchased_seats absoluto). */
  add_seats?: number;
  public_name?: string;
  product_name?: string;
  logo_url?: string | null;
  theme_json?: Record<string, unknown>;
  payout_cadence_preference?: PartnerPayoutCadence;
  /** active|suspended — migração completa de clientes = S6 */
  partner_status?: PartnerProfileStatus;
  status?: string;
  cpf_cnpj?: string | null;
  /** Block S3 — null limpa override (volta ao global) */
  wholesale_block_after_days?: number | null;
};

export type PatchPartnerProfileInput = {
  public_name?: string;
  product_name?: string;
  logo_url?: string | null;
  theme_json?: Record<string, unknown>;
  payout_cadence_preference?: PartnerPayoutCadence;
};

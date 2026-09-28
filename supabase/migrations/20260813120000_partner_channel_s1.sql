-- M5 S1 — Partner channel foundation (account_type, profiles, memberships, license pool)
-- Plano: PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md · SPRINT_M5_S0_INVENTORY_AND_SCHEMA.md

-- ========== tenants: canal ==========
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'platform_customer';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_account_type_chk;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_account_type_chk
  CHECK (account_type IN ('platform_customer', 'partner', 'customer_tenant'));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.tenants(id) ON DELETE RESTRICT;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_partner_account_chk;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_partner_account_chk CHECK (
    (account_type = 'customer_tenant' AND partner_id IS NOT NULL)
    OR (account_type IN ('platform_customer', 'partner') AND partner_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_tenants_partner_id
  ON public.tenants(partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_account_type
  ON public.tenants(account_type);

CREATE INDEX IF NOT EXISTS idx_tenants_seller_user_id
  ON public.tenants(seller_user_id)
  WHERE seller_user_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.account_type IS
  'platform_customer=venda direta; partner=revendedor WL; customer_tenant=cliente do canal';
COMMENT ON COLUMN public.tenants.partner_id IS
  'FK do Partner quando account_type=customer_tenant';
COMMENT ON COLUMN public.tenants.seller_user_id IS
  'Vendedor atribuído (opcional; null = carteira casa do Partner)';

-- ========== partner_profiles ==========
CREATE TABLE IF NOT EXISTS public.partner_profiles (
  partner_tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL DEFAULT 'license_pool'
    CHECK (program_type IN ('license_pool', 'revenue_share')),
  program_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  custom_domain TEXT,
  domain_status TEXT NOT NULL DEFAULT 'none'
    CHECK (domain_status IN ('none', 'pending', 'verified', 'active')),
  domain_verification_token TEXT,
  logo_url TEXT,
  theme_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_cadence_preference TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payout_cadence_preference IN ('monthly', 'biweekly', 'on_demand')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_profiles_custom_domain_active
  ON public.partner_profiles (lower(custom_domain))
  WHERE custom_domain IS NOT NULL AND domain_status IN ('verified', 'active');

CREATE TRIGGER update_partner_profiles_updated_at
  BEFORE UPDATE ON public.partner_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.partner_profiles IS 'Perfil white-label e programa comercial do Partner (M5)';
COMMENT ON COLUMN public.partner_profiles.program_config_json IS
  'license_pool: { floor_price_cents, unit_cost_cents, min_seats }; revenue_share: { share_percent }';

-- ========== partner_memberships ==========
CREATE TABLE IF NOT EXISTS public.partner_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('partner_admin', 'partner_seller')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  referral_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_tenant_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_seller_user_unique_active
  ON public.partner_memberships (user_id)
  WHERE role = 'partner_seller' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_memberships_referral_code
  ON public.partner_memberships (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_partner_memberships_partner
  ON public.partner_memberships (partner_tenant_id)
  WHERE status = 'active';

CREATE TRIGGER update_partner_memberships_updated_at
  BEFORE UPDATE ON public.partner_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.partner_memberships IS 'Admin/seller do Partner; seller ativo é único globalmente (D12)';

-- ========== partner_license_pool ==========
CREATE TABLE IF NOT EXISTS public.partner_license_pool (
  partner_tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchased_seats INTEGER NOT NULL CHECK (purchased_seats >= 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  used_seats_cache INTEGER NOT NULL DEFAULT 0 CHECK (used_seats_cache >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_partner_license_pool_updated_at
  BEFORE UPDATE ON public.partner_license_pool
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.partner_license_pool IS
  'Pool de licenças; 1 seat = 1 usuário em customer_tenants do canal (D20/D26)';

-- ========== feature flag ==========
INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'partner.master_off',
    'partner',
    'Kill switch global canal Partner / white-label',
    false,
    NULL,
    'off',
    0,
    false
  ),
  (
    'partner.channel_v1',
    'partner',
    'M5 Partner channel v1 (S1+): APIs superadmin/partners e /api/partner/*',
    false,
    'partner.master_off',
    'off',
    0,
    true
  )
ON CONFLICT (key) DO NOTHING;

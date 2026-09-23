-- M5-W Sprint 1 — Partner wholesale catalog + license ledger
-- Plano: PLAN_SPRINTS_M5_W_PARTNER_WHOLESALE.md

-- ========== Catálogo atacado (Platform → Partner) ==========
CREATE TABLE IF NOT EXISTS public.partner_wholesale_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  seats_included INTEGER NOT NULL DEFAULT 0
    CHECK (seats_included >= 0),
  price_cents INTEGER NOT NULL DEFAULT 0
    CHECK (price_cents >= 0),
  billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'quarterly', 'semi_annual', 'yearly')),
  envelope_plan_id UUID NULL REFERENCES public.plans(id) ON DELETE SET NULL,
  unit_overage_cents INTEGER NULL
    CHECK (unit_overage_cents IS NULL OR unit_overage_cents >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_wholesale_plans_slug
  ON public.partner_wholesale_plans (slug);

CREATE INDEX IF NOT EXISTS idx_partner_wholesale_plans_status
  ON public.partner_wholesale_plans (status, sort_order);

-- ========== Vínculo Partner ↔ plano atacado (assinatura na Sprint 2) ==========
ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS wholesale_plan_id UUID NULL
    REFERENCES public.partner_wholesale_plans(id) ON DELETE SET NULL;

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS wholesale_status TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.partner_profiles
  DROP CONSTRAINT IF EXISTS partner_profiles_wholesale_status_chk;

ALTER TABLE public.partner_profiles
  ADD CONSTRAINT partner_profiles_wholesale_status_chk
  CHECK (wholesale_status IN ('none', 'active', 'past_due', 'canceled'));

CREATE INDEX IF NOT EXISTS idx_partner_profiles_wholesale_plan
  ON public.partner_profiles (wholesale_plan_id)
  WHERE wholesale_plan_id IS NOT NULL;

-- ========== Ledger de seats ==========
CREATE TABLE IF NOT EXISTS public.partner_license_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  delta_seats INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL
    CHECK (reason IN (
      'grant',
      'plan_activate',
      'plan_renewal',
      'topup_purchase',
      'clawback',
      'admin_adjust',
      'legacy_manual'
    )),
  billing_id UUID NULL,
  external_ref TEXT NULL,
  wholesale_plan_id UUID NULL REFERENCES public.partner_wholesale_plans(id) ON DELETE SET NULL,
  actor_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_license_ledger_partner_created
  ON public.partner_license_ledger (partner_tenant_id, created_at DESC);

COMMENT ON TABLE public.partner_wholesale_plans IS
  'M5-W: planos atacado que Partners contratam (cobrança Platform).';
COMMENT ON TABLE public.partner_license_ledger IS
  'M5-W: auditoria de créditos/débitos em partner_license_pool.purchased_seats.';

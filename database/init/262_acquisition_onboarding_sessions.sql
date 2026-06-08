-- Sessões de onboarding operacional (provisionamento tardio — sem tenant na ativação)

DO $$ BEGIN
  CREATE TYPE public.acquisition_activation_intent AS ENUM ('trial', 'payment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.acquisition_lead_stage ADD VALUE IF NOT EXISTS 'activation_prepared';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.acquisition_lead_stage ADD VALUE IF NOT EXISTS 'onboarding_in_progress';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.acquisition_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  acquisition_lead_id UUID NOT NULL REFERENCES public.acquisition_leads (id) ON DELETE CASCADE,
  activation_intent public.acquisition_activation_intent NOT NULL,
  plan_id UUID REFERENCES public.plans (id) ON DELETE SET NULL,
  users_count INT,
  resume_step INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  payment_status TEXT
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'confirmed', 'failed')),
  payment_billing_id UUID,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  correlation_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acquisition_onboarding_sessions_lead
  ON public.acquisition_onboarding_sessions (acquisition_lead_id, status);

CREATE INDEX IF NOT EXISTS idx_acquisition_onboarding_sessions_token
  ON public.acquisition_onboarding_sessions (session_token)
  WHERE status = 'active';

COMMENT ON TABLE public.acquisition_onboarding_sessions IS
  'Provisionamento tardio: ativação prepara sessão; tenant nasce no fim do onboarding operacional.';

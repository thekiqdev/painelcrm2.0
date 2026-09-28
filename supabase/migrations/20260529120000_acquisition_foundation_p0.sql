-- P0 Sprint 6: acquisition leads, activation events, feature flags

DO $$ BEGIN
  CREATE TYPE public.acquisition_lead_stage AS ENUM (
    'pre_signup',
    'contact_captured',
    'plan_selected',
    'checkout_started',
    'checkout_abandoned',
    'trial_started',
    'converted',
    'onboarding_kickoff',
    'onboarding_active'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.acquisition_activation_score AS ENUM (
    'low',
    'medium',
    'high',
    'at_risk'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.acquisition_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  source TEXT,
  campaign TEXT,
  utm_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_plan_id UUID REFERENCES public.plans (id) ON DELETE SET NULL,
  current_stage public.acquisition_lead_stage NOT NULL DEFAULT 'pre_signup',
  activation_score public.acquisition_activation_score NOT NULL DEFAULT 'low',
  abandoned_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  correlation_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acquisition_leads_email ON public.acquisition_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_acquisition_leads_stage ON public.acquisition_leads (current_stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_acquisition_leads_correlation ON public.acquisition_leads (correlation_id);
CREATE INDEX IF NOT EXISTS idx_acquisition_leads_abandoned
  ON public.acquisition_leads (abandoned_at)
  WHERE abandoned_at IS NOT NULL AND converted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.acquisition_activation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_lead_id UUID REFERENCES public.acquisition_leads (id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acquisition_activation_events_lead
  ON public.acquisition_activation_events (acquisition_lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_acquisition_activation_events_type
  ON public.acquisition_activation_events (event_type, created_at DESC);

COMMENT ON TABLE public.acquisition_leads IS 'P0 Sprint 6 — pré-cadastro e funil de aquisição (coexiste com signup legado)';
COMMENT ON TABLE public.acquisition_activation_events IS 'P0 Sprint 6 — activation tracking foundation';

INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('acquisition.pre_signup_v1', 'acquisition', 'Pré-cadastro acquisition_leads', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.signup_flow_v1', 'acquisition', 'Novo fluxo signup coexistente', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.trial_flow_v1', 'acquisition', 'Fluxo /teste-gratis', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.recovery_v1', 'acquisition', 'Abandonment recovery foundation', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.activation_tracking_v1', 'acquisition', 'Activation event tracking', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.activation_score_v1', 'acquisition', 'Activation score computation', false, 'acquisition.master_off', 'off', 0, true),
  ('acquisition.onboarding_kickoff_v1', 'acquisition', 'Onboarding kickoff workflows', false, 'acquisition.master_off', 'off', 0, true)
ON CONFLICT (key) DO NOTHING;

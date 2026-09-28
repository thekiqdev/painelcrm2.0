-- Sprint E3.1 — estratégia central de cadastro (checkout vs teste fechado).

CREATE TABLE IF NOT EXISTS public.platform_growth_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-4000-8000-000000000001'::uuid,
  active_signup_flow TEXT NOT NULL DEFAULT 'checkout'
    CONSTRAINT platform_growth_settings_flow_ck
    CHECK (active_signup_flow IN ('checkout', 'exclusive_signup')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_growth_settings IS 'Fonte única da estratégia de aquisição (active_signup_flow).';
COMMENT ON COLUMN public.platform_growth_settings.active_signup_flow IS 'checkout = /checkout; exclusive_signup = /cadastro + E1/E2.';

INSERT INTO public.platform_growth_settings (id, active_signup_flow)
VALUES ('00000000-0000-4000-8000-000000000001'::uuid, 'checkout')
ON CONFLICT (id) DO NOTHING;

-- Migra instalações que já usavam acquisition_flow no runtime config.
UPDATE public.platform_growth_settings pgs
SET active_signup_flow = 'exclusive_signup',
    updated_at = now()
WHERE pgs.active_signup_flow = 'checkout'
  AND EXISTS (
    SELECT 1
    FROM public.platform_runtime_config prc
    WHERE prc.key = 'signup_entry'
      AND (prc.value_json->>'mode') = 'acquisition_flow'
      AND COALESCE((prc.value_json->>'acquisition_flow_enabled')::boolean, true) = true
  );

DROP TRIGGER IF EXISTS update_platform_growth_settings_updated_at ON public.platform_growth_settings;
CREATE TRIGGER update_platform_growth_settings_updated_at
  BEFORE UPDATE ON public.platform_growth_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

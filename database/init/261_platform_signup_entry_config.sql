-- Gateway de entrada público: legacy /checkout vs acquisition /cadastro

CREATE TABLE IF NOT EXISTS public.platform_runtime_config (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_runtime_config IS
  'Configuração runtime da plataforma (não boolean) — ex.: signup_entry_mode';

INSERT INTO public.platform_runtime_config (key, value_json)
VALUES (
  'signup_entry',
  '{"mode":"legacy_checkout","post_activation_path":"/onboarding","legacy_checkout_enabled":true,"acquisition_flow_enabled":true}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_feature_flags (key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode)
VALUES
  ('platform.signup_entry_acquisition_v1', 'platform', 'Usar /cadastro como entrada pública quando signup_entry.mode=acquisition_flow', false, NULL, 'off', 0, false)
ON CONFLICT (key) DO NOTHING;

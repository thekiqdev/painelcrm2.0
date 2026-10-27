-- PE Etapa 3 — Cloudflare for SaaS no domínio Partner (Custom Hostname sync)

ALTER TABLE public.partner_profiles
  ADD COLUMN IF NOT EXISTS cf_custom_hostname_id TEXT,
  ADD COLUMN IF NOT EXISTS cf_ssl_status TEXT,
  ADD COLUMN IF NOT EXISTS cf_ownership_status TEXT,
  ADD COLUMN IF NOT EXISTS cf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cf_last_error TEXT;

COMMENT ON COLUMN public.partner_profiles.cf_custom_hostname_id IS
  'Cloudflare Custom Hostname id (PE Etapa 3)';
COMMENT ON COLUMN public.partner_profiles.cf_ssl_status IS
  'Espelho ssl.status da CF (pending|active|…)';
COMMENT ON COLUMN public.partner_profiles.cf_ownership_status IS
  'Espelho status de ownership/hostname da CF';
COMMENT ON COLUMN public.partner_profiles.cf_last_sync_at IS
  'Última sincronização com a API Cloudflare';
COMMENT ON COLUMN public.partner_profiles.cf_last_error IS
  'Último erro de provisionamento/sync (sem secrets)';

INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'partner.edge_cloudflare_saas_v1',
    'partner',
    'PE: ao verificar domínio Partner (active), provisiona Custom Hostname na Cloudflare; no clear, remove. Requer CF_SAAS_* e PARTNER_WL_CNAME_TARGET. Default OFF — habilitar em Super Admin → Avançado → Feature Flags após ops edge OK.',
    false,
    'partner.master_off',
    'off',
    0,
    false
  )
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  kill_switch_key = COALESCE(platform_feature_flags.kill_switch_key, EXCLUDED.kill_switch_key),
  namespace = EXCLUDED.namespace,
  shadow_mode = EXCLUDED.shadow_mode,
  updated_at = now();

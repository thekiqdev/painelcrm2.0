-- TE Sprint 2 — Cloudflare for SaaS em tenant_hosts (loja | chamados)

ALTER TABLE public.tenant_hosts
  ADD COLUMN IF NOT EXISTS cf_custom_hostname_id TEXT,
  ADD COLUMN IF NOT EXISTS cf_ssl_status TEXT,
  ADD COLUMN IF NOT EXISTS cf_ownership_status TEXT,
  ADD COLUMN IF NOT EXISTS cf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cf_last_error TEXT;

COMMENT ON COLUMN public.tenant_hosts.cf_custom_hostname_id IS
  'Cloudflare Custom Hostname id (TE Sprint 2)';
COMMENT ON COLUMN public.tenant_hosts.cf_ssl_status IS
  'Espelho ssl.status da CF';
COMMENT ON COLUMN public.tenant_hosts.cf_ownership_status IS
  'Espelho status de ownership/hostname da CF';
COMMENT ON COLUMN public.tenant_hosts.cf_last_sync_at IS
  'Última sincronização com a API Cloudflare';
COMMENT ON COLUMN public.tenant_hosts.cf_last_error IS
  'Último erro de provisionamento/sync (sem secrets)';

INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'tenant.edge_cloudflare_saas_v1',
    'tenant',
    'TE: ao verificar domínio tenant (active), provisiona Custom Hostname na Cloudflare; no clear, remove. Requer CF_SAAS_* e CNAME SaaS. Default OFF — habilitar em Super Admin → Avançado → Feature Flags após smoke edge OK.',
    false,
    'tenant.master_off',
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

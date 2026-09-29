-- TD Sprint 0 — Feature flags domínio personalizado do Tenant (loja | abertura de chamados)

INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'tenant.master_off',
    'tenant',
    'Kill switch do namespace tenant (custom domain e futuros). ON = desliga flags tenant.*',
    false,
    NULL,
    'off',
    0,
    false
  ),
  (
    'tenant.custom_domain_v1',
    'tenant',
    'TD: domínio personalizado do tenant SaaS — Settings Domínio (papel store|support), DNS verify, host público loja ou portal de chamados. Ligado por padrão para todos; desligue Enabled ou use kill switch tenant.master_off.',
    true,
    'tenant.master_off',
    'global',
    100,
    false
  ),
  (
    'tenant.domain_verify_bypass',
    'tenant',
    'Dev/staging: marcar domínio Tenant como verificado sem checar DNS TXT/CNAME. Nunca ligar em produção.',
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
  -- custom_domain: installs novas e re-seed mantêm default ON (341 também força)
  default_enabled = CASE
    WHEN EXCLUDED.key = 'tenant.custom_domain_v1' THEN EXCLUDED.default_enabled
    ELSE platform_feature_flags.default_enabled
  END,
  rollout_type = CASE
    WHEN EXCLUDED.key = 'tenant.custom_domain_v1' THEN EXCLUDED.rollout_type
    ELSE platform_feature_flags.rollout_type
  END,
  rollout_percent = CASE
    WHEN EXCLUDED.key = 'tenant.custom_domain_v1' THEN EXCLUDED.rollout_percent
    ELSE platform_feature_flags.rollout_percent
  END,
  updated_at = now();

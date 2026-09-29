-- TD — domínio personalizado do tenant ON por padrão (todos os platform_customer)
-- Liga Enabled + rollout global; kill switch tenant.master_off continua válido.

UPDATE public.platform_feature_flags
SET
  default_enabled = true,
  rollout_type = 'global',
  rollout_percent = 100,
  description = 'TD: domínio personalizado do tenant SaaS — Settings Domínio (papel store|support), DNS verify, host público loja ou portal de chamados. Ligado por padrão para todos; desligue Enabled ou use kill switch tenant.master_off.',
  updated_at = now()
WHERE key = 'tenant.custom_domain_v1';

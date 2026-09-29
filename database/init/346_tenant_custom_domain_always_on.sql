-- TD — reforça domínio personalizado ON/global (produto padrão; sem depender de env).
UPDATE public.platform_feature_flags
SET
  default_enabled = true,
  rollout_type = 'global',
  rollout_percent = 100,
  description = 'TD: domínio personalizado do tenant (loja|chamados). Produto ON por padrão. Desligar: kill switch tenant.master_off ou TENANT_CUSTOM_DOMAIN_V1=false. CNAME target vem de FRONTEND_URL/PUBLIC_APP_URL (fallback painelcrm.com).',
  updated_at = now()
WHERE key = 'tenant.custom_domain_v1';

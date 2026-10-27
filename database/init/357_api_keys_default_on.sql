-- API etapa 4 — api.keys_v1 ligada por padrão para todos os tenants.
-- Bancos que já aplicaram a 355 (flag off) passam a global. Um override por tenant no Super Admin ainda desliga só aquela conta.

UPDATE public.platform_feature_flags
SET
  default_enabled = true,
  rollout_type = 'global',
  rollout_percent = 100,
  description = 'API do tenant: gerar/revogar chave e cadastrar lead. Ligada por padrão para todos os tenants. Quem gera a chave continua sendo o admin da conta.',
  updated_at = now()
WHERE key = 'api.keys_v1';

-- API etapa 1 — chaves de integração do tenant (segredo só em hash).
-- A flag nasce ligada para todos. A migration 357 repete o UPDATE para bancos que já tinham a linha desligada.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['leads.create']::text[],
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_name_len CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT api_keys_prefix_len CHECK (char_length(key_prefix) = 12),
  CONSTRAINT api_keys_hash_len CHECK (char_length(key_hash) = 64),
  CONSTRAINT api_keys_scopes_nonempty CHECK (cardinality(scopes) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_key_hash ON public.api_keys (key_hash);
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_key_prefix ON public.api_keys (key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON public.api_keys (tenant_id);

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER update_api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.api_keys IS
  'Chaves de API do tenant. key_hash = SHA-256 hex; o segredo pcrm_… não é persistido.';
COMMENT ON COLUMN public.api_keys.key_prefix IS
  'Primeiros 12 caracteres do segredo, para lista e lookup. Não autentica sozinho.';
COMMENT ON COLUMN public.api_keys.owner_user_id IS
  'Usuário dono dos registros criados por esta chave (lead.user_id).';
COMMENT ON COLUMN public.api_keys.scopes IS
  'Ações permitidas. MVP: leads.create.';

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_keys_tenant_policy ON public.api_keys;
CREATE POLICY api_keys_tenant_policy ON public.api_keys FOR ALL
  USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

INSERT INTO public.platform_feature_flags (
  key, namespace, description, default_enabled, kill_switch_key, rollout_type, rollout_percent, shadow_mode
)
VALUES
  (
    'api.keys_v1',
    'api',
    'API do tenant: gerar/revogar chave e cadastrar lead. Ligada por padrão para todos os tenants. Quem gera a chave continua sendo o admin da conta.',
    true,
    NULL,
    'global',
    100,
    false
  )
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  namespace = EXCLUDED.namespace,
  default_enabled = EXCLUDED.default_enabled,
  rollout_type = EXCLUDED.rollout_type,
  rollout_percent = EXCLUDED.rollout_percent,
  shadow_mode = EXCLUDED.shadow_mode,
  updated_at = now();

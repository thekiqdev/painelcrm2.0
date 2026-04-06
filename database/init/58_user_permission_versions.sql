-- Versionamento de permissões por usuário para invalidação de cache (Permission Engine).
-- Ao incrementar version, a chave do cache (permissions:userId:version) muda e o próximo get é MISS.

CREATE TABLE IF NOT EXISTS public.user_permission_versions (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_permission_versions IS 'Versão das permissões efetivas do usuário; incrementada ao alterar role/custom role ou definição de permissões para invalidar cache.';

CREATE INDEX IF NOT EXISTS idx_user_permission_versions_user_id ON public.user_permission_versions(user_id);

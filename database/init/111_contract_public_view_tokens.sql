-- Etapa 3 — Link público read-only de visualização de contrato (token opaco, hash SHA-256 no BD).
CREATE TABLE IF NOT EXISTS public.contract_public_view_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_public_view_tokens_hash
  ON public.contract_public_view_tokens (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_public_view_one_active_per_contract
  ON public.contract_public_view_tokens (contract_id)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.contract_public_view_tokens IS 'Hash SHA-256 do token opaco para URL pública de somente leitura do contrato (Etapa 3).';
COMMENT ON COLUMN public.contract_public_view_tokens.token_hash IS 'SHA-256 hex (64 chars) do secret enviado na URL; secret não é armazenado em claro.';
COMMENT ON COLUMN public.contract_public_view_tokens.revoked_at IS 'Preenchido para invalidar o link antes de regenerar ou por ação do painel.';
COMMENT ON COLUMN public.contract_public_view_tokens.expires_at IS 'Opcional; NULL = sem expiração automática.';

ALTER TABLE public.contract_public_view_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_public_view_tokens_tenant_policy ON public.contract_public_view_tokens;
CREATE POLICY contract_public_view_tokens_tenant_policy ON public.contract_public_view_tokens
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_public_view_tokens.contract_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_public_view_tokens.contract_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

-- Rota pública: resolve hash → payload mínimo (bypass RLS; não expõe IDs internos desnecessários).
-- PostgreSQL não permite alterar o conjunto de colunas de retorno via CREATE OR REPLACE
-- quando a função já existe com assinatura diferente.
DROP FUNCTION IF EXISTS public.get_contract_public_view_by_token_hash(TEXT);

CREATE OR REPLACE FUNCTION public.get_contract_public_view_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  title TEXT,
  status public.contract_status,
  contract_number TEXT,
  document_html TEXT,
  client_name TEXT,
  tenant_name TEXT,
  tenant_logo_url TEXT,
  responsible_display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.title,
    c.status,
    c.contract_number,
    COALESCE(NULLIF(trim(c.content_snapshot_html), ''), c.content_html) AS document_html,
    cl.name AS client_name,
    tn.name AS tenant_name,
    tn.logo_url AS tenant_logo_url,
    NULLIF(trim(concat_ws(' ', rp.first_name, rp.last_name)), '') AS responsible_display_name
  FROM public.contract_public_view_tokens vt
  INNER JOIN public.contracts c ON c.id = vt.contract_id
  INNER JOIN public.users u ON u.id = c.user_id
  LEFT JOIN public.tenants tn ON tn.id = u.tenant_id
  LEFT JOIN public.clients cl ON cl.id = c.client_id
  LEFT JOIN public.profiles rp ON rp.id = c.responsible_id
  WHERE vt.token_hash = p_token_hash
    AND vt.revoked_at IS NULL
    AND (vt.expires_at IS NULL OR vt.expires_at > now())
    AND c.status IS DISTINCT FROM 'DRAFT'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_contract_public_view_by_token_hash(TEXT) IS 'Etapa 3: payload público read-only do contrato por hash do token de visualização.';

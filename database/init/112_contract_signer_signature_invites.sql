-- Etapa 4 — Convites públicos de assinatura por signatário (token opaco, hash SHA-256; separado da visualização Etapa 3).

CREATE TABLE IF NOT EXISTS public.contract_signer_signature_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_signer_id UUID NOT NULL REFERENCES public.contract_signers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  consumed_at TIMESTAMPTZ NULL,
  signer_name_confirmed TEXT NULL,
  client_ip TEXT NULL,
  user_agent TEXT NULL,
  accepted_terms_version TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signer_sig_invites_hash
  ON public.contract_signer_signature_invites (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signer_sig_invites_one_active
  ON public.contract_signer_signature_invites (contract_signer_id)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_signer_sig_invites_signer
  ON public.contract_signer_signature_invites (contract_signer_id);

COMMENT ON TABLE public.contract_signer_signature_invites IS 'Convite de assinatura pública por signatário (Etapa 4); não reutilizar com tokens de visualização.';
COMMENT ON COLUMN public.contract_signer_signature_invites.token_hash IS 'SHA-256 hex do secret da URL; secret não armazenado em claro.';
COMMENT ON COLUMN public.contract_signer_signature_invites.consumed_at IS 'Preenchido quando a assinatura é concluída com sucesso (convite de uso único).';

ALTER TABLE public.contract_signer_signature_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_signer_sig_invites_tenant_policy ON public.contract_signer_signature_invites;
CREATE POLICY contract_signer_sig_invites_tenant_policy ON public.contract_signer_signature_invites
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contract_signers cs
      INNER JOIN public.contracts c ON c.id = cs.contract_id
      WHERE cs.id = contract_signer_signature_invites.contract_signer_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.contract_signers cs
      INNER JOIN public.contracts c ON c.id = cs.contract_id
      WHERE cs.id = contract_signer_signature_invites.contract_signer_id
        AND c.user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
    )
  );

-- Leitura pública do convite (bypass RLS). O backend filtra colunas sensíveis na resposta HTTP.
-- DROP necessário: CREATE OR REPLACE não pode alterar RETURNS TABLE (ex.: migrações posteriores com mais colunas).
DROP FUNCTION IF EXISTS public.get_signature_invite_full_by_token_hash(TEXT);

CREATE OR REPLACE FUNCTION public.get_signature_invite_full_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  tenant_id UUID,
  contract_id UUID,
  signer_id UUID,
  invite_id UUID,
  contract_title TEXT,
  contract_number TEXT,
  contract_status public.contract_status,
  document_html TEXT,
  signer_name TEXT,
  signer_signed_at TIMESTAMPTZ,
  invite_revoked BOOLEAN,
  invite_expired BOOLEAN,
  invite_consumed BOOLEAN,
  tenant_name TEXT,
  tenant_logo_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.tenant_id AS tenant_id,
    c.id AS contract_id,
    cs.id AS signer_id,
    i.id AS invite_id,
    c.title AS contract_title,
    c.contract_number AS contract_number,
    c.status AS contract_status,
    NULLIF(trim(c.content_snapshot_html), '') AS document_html,
    cs.name AS signer_name,
    cs.signed_at AS signer_signed_at,
    (i.revoked_at IS NOT NULL) AS invite_revoked,
    (i.expires_at IS NOT NULL AND i.expires_at <= now()) AS invite_expired,
    (i.consumed_at IS NOT NULL) AS invite_consumed,
    tn.name AS tenant_name,
    tn.logo_url AS tenant_logo_url
  FROM public.contract_signer_signature_invites i
  INNER JOIN public.contract_signers cs ON cs.id = i.contract_signer_id
  INNER JOIN public.contracts c ON c.id = cs.contract_id
  INNER JOIN public.users u ON u.id = c.user_id
  LEFT JOIN public.tenants tn ON tn.id = u.tenant_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_signature_invite_full_by_token_hash(TEXT) IS 'Etapa 4: resolve convite de assinatura por hash (uso interno + base resposta GET pública).';

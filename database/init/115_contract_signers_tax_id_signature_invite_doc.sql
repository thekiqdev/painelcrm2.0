-- CPF/CNPJ por signatário + documento do convite: fallback para content_html se snapshot vazio.

ALTER TABLE public.contract_signers
  ADD COLUMN IF NOT EXISTS tax_id TEXT NULL;

COMMENT ON COLUMN public.contract_signers.tax_id IS 'CPF (11) ou CNPJ (14) apenas dígitos; obrigatório em novos assinantes via API.';

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
    COALESCE(
      NULLIF(trim(c.content_snapshot_html), ''),
      NULLIF(trim(c.content_html), '')
    ) AS document_html,
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

COMMENT ON FUNCTION public.get_signature_invite_full_by_token_hash(TEXT) IS
  'Convite de assinatura: document_html = snapshot ou, se vazio, content_html (recuperação).';

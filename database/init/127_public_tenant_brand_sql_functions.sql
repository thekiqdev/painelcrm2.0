-- Funções públicas de contrato/assinatura: expõem logo clara/escura para páginas sem login.

DROP FUNCTION IF EXISTS public.get_contract_public_view_by_token_hash(TEXT);

CREATE OR REPLACE FUNCTION public.get_contract_public_view_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  contract_id UUID,
  title TEXT,
  status public.contract_status,
  contract_number TEXT,
  document_html TEXT,
  client_name TEXT,
  tenant_name TEXT,
  tenant_logo_url TEXT,
  tenant_logo_light_url TEXT,
  tenant_logo_dark_url TEXT,
  responsible_display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS contract_id,
    c.title,
    c.status,
    c.contract_number,
    COALESCE(NULLIF(trim(c.content_snapshot_html), ''), c.content_html) AS document_html,
    cl.name AS client_name,
    tn.name AS tenant_name,
    tn.logo_url AS tenant_logo_url,
    tn.logo_light_url AS tenant_logo_light_url,
    tn.logo_dark_url AS tenant_logo_dark_url,
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
    AND c.status IS DISTINCT FROM 'CANCELLED'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_contract_public_view_by_token_hash(TEXT) IS
  'Read-only público: payload por token; inclui logos clara/escura do tenant.';

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
  tenant_logo_url TEXT,
  tenant_logo_light_url TEXT,
  tenant_logo_dark_url TEXT
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
    tn.logo_url AS tenant_logo_url,
    tn.logo_light_url AS tenant_logo_light_url,
    tn.logo_dark_url AS tenant_logo_dark_url
  FROM public.contract_signer_signature_invites i
  INNER JOIN public.contract_signers cs ON cs.id = i.contract_signer_id
  INNER JOIN public.contracts c ON c.id = cs.contract_id
  INNER JOIN public.users u ON u.id = c.user_id
  LEFT JOIN public.tenants tn ON tn.id = u.tenant_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_signature_invite_full_by_token_hash(TEXT) IS
  'Convite de assinatura: inclui logos clara/escura do tenant para UI pública.';

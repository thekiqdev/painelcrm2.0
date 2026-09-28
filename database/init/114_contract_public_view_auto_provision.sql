-- Link público de visualização: rascunho acessível + ciphertext para reemissão ao painel autenticado.
-- Mantém bloqueio para CANCELLED (Etapa 6).

ALTER TABLE public.contract_public_view_tokens
  ADD COLUMN IF NOT EXISTS token_ciphertext TEXT NULL;

COMMENT ON COLUMN public.contract_public_view_tokens.token_ciphertext IS
  'AES-256-GCM (base64: iv+tag+ciphertext) do token em claro; só para utilizadores autenticados do tenant reobterem o URL sem regenerar.';

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
    AND c.status IS DISTINCT FROM 'CANCELLED'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_contract_public_view_by_token_hash(TEXT) IS
  'Read-only público: permite DRAFT; bloqueia cancelado.';

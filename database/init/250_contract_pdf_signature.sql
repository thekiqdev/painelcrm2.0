-- Contratos: modo PDF com assinatura online (mesma tabela contracts + campos/auditoria)

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS document_kind TEXT NOT NULL DEFAULT 'html_editor'
    CHECK (document_kind IN ('html_editor', 'pdf_signature'));

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS original_pdf_storage_key TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS frozen_pdf_storage_key TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS signed_pdf_storage_key TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS pdf_page_count INT;

COMMENT ON COLUMN public.contracts.document_kind IS 'html_editor = TipTap; pdf_signature = upload PDF + campos de assinatura.';

CREATE TABLE IF NOT EXISTS public.contract_signature_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  page INT NOT NULL DEFAULT 1 CHECK (page >= 1),
  x NUMERIC(8, 4) NOT NULL CHECK (x >= 0 AND x <= 100),
  y NUMERIC(8, 4) NOT NULL CHECK (y >= 0 AND y <= 100),
  width NUMERIC(8, 4) NOT NULL CHECK (width > 0 AND width <= 100),
  height NUMERIC(8, 4) NOT NULL CHECK (height > 0 AND height <= 100),
  field_type TEXT NOT NULL CHECK (field_type IN ('signature', 'name', 'date')),
  signer_type TEXT NOT NULL DEFAULT 'CLIENT' CHECK (signer_type IN ('CLIENT', 'INTERNAL')),
  required BOOLEAN NOT NULL DEFAULT true,
  label TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_signature_fields_contract
  ON public.contract_signature_fields (contract_id, page, sort_order);

CREATE TABLE IF NOT EXISTS public.contract_signature_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  signer_id UUID REFERENCES public.contract_signers(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('VIEWED', 'SIGNED', 'DOWNLOADED')),
  client_ip TEXT,
  user_agent TEXT,
  document_hash_sha256 TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_signature_audit_contract
  ON public.contract_signature_audit_events (contract_id, created_at DESC);

-- Convite público: expõe modo PDF
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
  document_kind TEXT,
  frozen_pdf_storage_key TEXT,
  original_pdf_storage_key TEXT,
  pdf_page_count INT,
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
    c.document_kind,
    c.frozen_pdf_storage_key,
    c.original_pdf_storage_key,
    c.pdf_page_count,
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
  'Convite de assinatura: HTML ou PDF (document_kind + storage keys).';

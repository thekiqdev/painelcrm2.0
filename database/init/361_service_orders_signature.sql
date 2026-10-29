-- OS-S4 — Assinatura online: signatários, token de visualização pública, convites de assinatura + eventos de notificação.

CREATE TABLE IF NOT EXISTS public.service_order_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'client',
  name TEXT NOT NULL,
  email TEXT NULL,
  tax_id TEXT NULL,
  whatsapp_phone TEXT NULL,
  signing_order INTEGER NOT NULL DEFAULT 1,
  signed_at TIMESTAMPTZ NULL,
  signature_data JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_order_signers_role_check CHECK (role IN ('client', 'technician')),
  CONSTRAINT service_order_signers_name_nonempty CHECK (length(trim(name)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_service_order_signers_order
  ON public.service_order_signers (service_order_id, signing_order, created_at);
CREATE INDEX IF NOT EXISTS idx_service_order_signers_tenant
  ON public.service_order_signers (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_signers_one_client
  ON public.service_order_signers (service_order_id)
  WHERE role = 'client';

COMMENT ON TABLE public.service_order_signers IS 'Signatários da OS (cliente obrigatório no envio; técnico opcional).';
COMMENT ON COLUMN public.service_order_signers.signature_data IS 'Payload da assinatura pública (PNG base64, IP, UA, termos).';

ALTER TABLE public.service_order_signers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_signers_tenant_policy ON public.service_order_signers;
CREATE POLICY service_order_signers_tenant_policy ON public.service_order_signers
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  );

-- Link público read-only
CREATE TABLE IF NOT EXISTS public.service_order_public_view_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_ciphertext TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_public_view_tokens_hash
  ON public.service_order_public_view_tokens (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_public_view_one_active
  ON public.service_order_public_view_tokens (service_order_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_order_public_view_tenant
  ON public.service_order_public_view_tokens (tenant_id);

COMMENT ON TABLE public.service_order_public_view_tokens IS 'Token opaco (hash SHA-256) para visualização pública da OS.';
COMMENT ON COLUMN public.service_order_public_view_tokens.token_ciphertext IS 'Ciphertext AES-GCM do token bruto para reemissão no painel.';

ALTER TABLE public.service_order_public_view_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_public_view_tokens_tenant_policy ON public.service_order_public_view_tokens;
CREATE POLICY service_order_public_view_tokens_tenant_policy ON public.service_order_public_view_tokens
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  );

-- Convite de assinatura por signatário
CREATE TABLE IF NOT EXISTS public.service_order_signer_signature_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  service_order_signer_id UUID NOT NULL REFERENCES public.service_order_signers(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_sig_invites_hash
  ON public.service_order_signer_signature_invites (token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_order_sig_invites_one_active
  ON public.service_order_signer_signature_invites (service_order_signer_id)
  WHERE revoked_at IS NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_order_sig_invites_signer
  ON public.service_order_signer_signature_invites (service_order_signer_id);

COMMENT ON TABLE public.service_order_signer_signature_invites IS 'Convite público de assinatura da OS (token hash; uso único).';

ALTER TABLE public.service_order_signer_signature_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_order_sig_invites_tenant_policy ON public.service_order_signer_signature_invites;
CREATE POLICY service_order_sig_invites_tenant_policy ON public.service_order_signer_signature_invites
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = public.app_current_tenant_id()
  );

-- Lookup público: visualização (bypass RLS; backend filtra colunas)
DROP FUNCTION IF EXISTS public.get_service_order_public_view_by_token_hash(TEXT);
CREATE OR REPLACE FUNCTION public.get_service_order_public_view_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  tenant_id UUID,
  service_order_id UUID,
  service_order_number INTEGER,
  status TEXT,
  content_snapshot_html TEXT,
  content_html TEXT,
  client_name TEXT,
  tenant_name TEXT,
  tenant_logo_url TEXT,
  tenant_logo_light_url TEXT,
  tenant_logo_dark_url TEXT,
  token_revoked BOOLEAN,
  token_expired BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    so.tenant_id,
    so.id,
    so.service_order_number,
    so.status,
    so.content_snapshot_html,
    so.content_html,
    COALESCE(NULLIF(trim(so.client_snapshot->>'name'), ''), cl.name) AS client_name,
    t.name AS tenant_name,
    t.logo_url AS tenant_logo_url,
    t.logo_light_url AS tenant_logo_light_url,
    t.logo_dark_url AS tenant_logo_dark_url,
    (tok.revoked_at IS NOT NULL) AS token_revoked,
    (tok.expires_at IS NOT NULL AND tok.expires_at < now()) AS token_expired
  FROM public.service_order_public_view_tokens tok
  INNER JOIN public.service_orders so ON so.id = tok.service_order_id
  INNER JOIN public.tenants t ON t.id = so.tenant_id
  LEFT JOIN public.clients cl ON cl.id = so.client_id
  WHERE tok.token_hash = p_token_hash
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_service_order_public_view_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_order_public_view_by_token_hash(TEXT) TO PUBLIC;

-- Lookup público: convite de assinatura
DROP FUNCTION IF EXISTS public.get_service_order_signature_invite_by_token_hash(TEXT);
CREATE OR REPLACE FUNCTION public.get_service_order_signature_invite_by_token_hash(p_token_hash TEXT)
RETURNS TABLE (
  tenant_id UUID,
  service_order_id UUID,
  signer_id UUID,
  invite_id UUID,
  service_order_number INTEGER,
  status TEXT,
  content_snapshot_html TEXT,
  content_html TEXT,
  signer_name TEXT,
  signer_role TEXT,
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
    so.tenant_id,
    so.id,
    s.id,
    i.id,
    so.service_order_number,
    so.status,
    so.content_snapshot_html,
    so.content_html,
    s.name,
    s.role,
    s.signed_at,
    (i.revoked_at IS NOT NULL) AS invite_revoked,
    (i.expires_at IS NOT NULL AND i.expires_at < now()) AS invite_expired,
    (i.consumed_at IS NOT NULL) AS invite_consumed,
    t.name AS tenant_name,
    t.logo_url AS tenant_logo_url,
    t.logo_light_url AS tenant_logo_light_url,
    t.logo_dark_url AS tenant_logo_dark_url
  FROM public.service_order_signer_signature_invites i
  INNER JOIN public.service_order_signers s ON s.id = i.service_order_signer_id
  INNER JOIN public.service_orders so ON so.id = s.service_order_id
  INNER JOIN public.tenants t ON t.id = so.tenant_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_service_order_signature_invite_by_token_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_order_signature_invite_by_token_hash(TEXT) TO PUBLIC;

-- Catálogo de notificações OS
INSERT INTO public.notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  ('service_order.sent', 'service_orders', 'Ordem de serviço enviada para assinatura', 'whatsapp',
   '["tenant.name","client.name","service_order.number","service_order.sign_link","service_order.public_view_link","signer.name","signer.email","signer.whatsapp"]'::jsonb, true),
  ('service_order.signed', 'service_orders', 'Ordem de serviço assinada', 'whatsapp',
   '["tenant.name","client.name","service_order.number","service_order.public_view_link"]'::jsonb, true)
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('service_order.sent', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{signer.name}}*.\n\nConvite para assinar a *Ordem de Serviço Nº {{service_order.number}}*.\n\n*Assinatura:*\n{{service_order.sign_link}}\n\n*Documento (somente leitura):*\n{{service_order.public_view_link}}\n\n{{tenant.name}}',
   1, true),
  ('service_order.sent', 'email', 'pt-BR',
   'Assinar Ordem de Serviço Nº {{service_order.number}}',
   E'<p>Olá, {{signer.name}}.</p><p>Convite para assinar a <strong>Ordem de Serviço Nº {{service_order.number}}</strong>.</p><p><a href="{{service_order.sign_link}}">Assinar online</a></p><p><a href="{{service_order.public_view_link}}">Ver documento</a></p><p>{{tenant.name}}</p>',
   1, true),
  ('service_order.signed', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nA Ordem de Serviço *Nº {{service_order.number}}* foi assinada.\n\n*Documento:*\n{{service_order.public_view_link}}\n\n{{tenant.name}}',
   1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;

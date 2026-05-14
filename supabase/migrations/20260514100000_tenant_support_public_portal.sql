-- Portal público de tickets por slug do tenant (Fase 2) — espelho de database/init/238_tenant_support_public_portal.sql
CREATE TABLE IF NOT EXISTS public.tenant_support_portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  slug TEXT NOT NULL,
  title TEXT,
  description TEXT,
  welcome_message TEXT,
  logo_url TEXT,
  primary_color TEXT,
  default_priority public.ticket_priority NOT NULL DEFAULT 'normal',
  allowed_category_ids UUID[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_support_portal_settings_slug_lower CHECK (slug = lower(slug)),
  CONSTRAINT tenant_support_portal_settings_slug_format CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 80
  ),
  CONSTRAINT tenant_support_portal_settings_slug_reserved CHECK (
    slug NOT IN (
      'admin',
      'superadmin',
      'api',
      'login',
      'dashboard',
      'suporte',
      'support',
      'app'
    )
  ),
  CONSTRAINT tenant_support_portal_settings_slug_not_uuid_shape CHECK (
    slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_support_portal_settings_slug_key
  ON public.tenant_support_portal_settings (slug);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_support_portal_settings_tenant_id_key
  ON public.tenant_support_portal_settings (tenant_id);

DROP TRIGGER IF EXISTS update_tenant_support_portal_settings_updated_at ON public.tenant_support_portal_settings;
CREATE TRIGGER update_tenant_support_portal_settings_updated_at
  BEFORE UPDATE ON public.tenant_support_portal_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_support_portal_settings IS 'Configuração do formulário público de abertura de tickets (/suporte/:slug)';

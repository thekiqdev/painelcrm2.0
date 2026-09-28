-- Templates de mensagem para Chat / WhatsApp por tenant (internos vs oficiais).
-- CRUD em Configurações → WhatsApp → Templates. Isolamento: tenant_id + RLS.

CREATE TABLE IF NOT EXISTS public.tenant_chat_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL CHECK (template_type IN ('internal', 'whatsapp_official')),
  name TEXT NOT NULL,
  slug TEXT,
  category TEXT,
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_template_name TEXT,
  provider_language TEXT,
  provider_category TEXT,
  provider_status TEXT,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_chat_templates_tenant_slug_key UNIQUE (tenant_id, slug),
  CONSTRAINT tenant_chat_templates_tenant_type_name_key UNIQUE (tenant_id, template_type, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_chat_templates_tenant_id ON public.tenant_chat_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_chat_templates_type ON public.tenant_chat_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_tenant_chat_templates_active ON public.tenant_chat_templates(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tenant_chat_templates_updated ON public.tenant_chat_templates(tenant_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_tenant_chat_templates_updated_at ON public.tenant_chat_templates;
CREATE TRIGGER update_tenant_chat_templates_updated_at
  BEFORE UPDATE ON public.tenant_chat_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_chat_templates IS 'Templates de texto para chat/WhatsApp: internos (reutilização) e oficiais (estrutura para provedor).';
COMMENT ON COLUMN public.tenant_chat_templates.variables IS 'Lista JSON de chaves de variáveis, ex.: ["contact_name","column_name"].';
COMMENT ON COLUMN public.tenant_chat_templates.provider_status IS 'Estado operacional do template oficial (rascunho, pendente, aprovado, etc.) — sem sync automático nesta fase.';

ALTER TABLE public.tenant_chat_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_chat_templates_tenant_policy ON public.tenant_chat_templates;
CREATE POLICY tenant_chat_templates_tenant_policy ON public.tenant_chat_templates
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

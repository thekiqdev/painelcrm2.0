-- Módulo Templates WhatsApp: categorias, templates automáticos com sequência de mensagens (texto/imagem + delay).
-- Configurações → WhatsApp / Chat → Templates WhatsApp. Isolamento por tenant_id + RLS.

CREATE TABLE IF NOT EXISTS public.whatsapp_template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_template_categories_tenant_name_key UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_tpl_cat_tenant ON public.whatsapp_template_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_tpl_cat_active ON public.whatsapp_template_categories(tenant_id, is_active);

DROP TRIGGER IF EXISTS update_whatsapp_template_categories_updated_at ON public.whatsapp_template_categories;
CREATE TRIGGER update_whatsapp_template_categories_updated_at
  BEFORE UPDATE ON public.whatsapp_template_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.whatsapp_template_categories(id) ON DELETE RESTRICT,
  template_type TEXT NOT NULL DEFAULT 'model' CHECK (template_type IN ('automatic', 'model')),
  name TEXT NOT NULL,
  slug TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  seed_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_message_templates_tenant_slug_key UNIQUE (tenant_id, slug)
);

-- Instalações antigas: a tabela já existia sem template_type (CREATE TABLE IF NOT EXISTS não altera esquema).
ALTER TABLE public.whatsapp_message_templates ADD COLUMN IF NOT EXISTS template_type TEXT;

UPDATE public.whatsapp_message_templates
SET template_type = 'automatic'
WHERE template_type IS NULL AND (seed_key IS NOT NULL OR is_system_default = true);

UPDATE public.whatsapp_message_templates
SET template_type = 'model'
WHERE template_type IS NULL;

UPDATE public.whatsapp_message_templates
SET template_type = 'automatic'
WHERE seed_key IS NOT NULL;

ALTER TABLE public.whatsapp_message_templates
  ALTER COLUMN template_type SET DEFAULT 'model';

ALTER TABLE public.whatsapp_message_templates
  ALTER COLUMN template_type SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_message_templates
    ADD CONSTRAINT whatsapp_message_templates_type_check
    CHECK (template_type IN ('automatic', 'model'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_tenant_seed
  ON public.whatsapp_message_templates(tenant_id, seed_key)
  WHERE seed_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_tenant ON public.whatsapp_message_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_category ON public.whatsapp_message_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_type ON public.whatsapp_message_templates(tenant_id, template_type);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_active ON public.whatsapp_message_templates(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_updated ON public.whatsapp_message_templates(tenant_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_whatsapp_message_templates_updated_at ON public.whatsapp_message_templates;
CREATE TRIGGER update_whatsapp_message_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_message_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.whatsapp_message_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.whatsapp_message_templates(id) ON DELETE CASCADE,
  position INT NOT NULL CHECK (position >= 0 AND position < 1000),
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'image', 'document')),
  content TEXT,
  media_url TEXT,
  caption TEXT,
  delay_seconds INT NOT NULL DEFAULT 0 CHECK (delay_seconds >= 0 AND delay_seconds <= 3600),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_msg_tpl_items_position_unique UNIQUE (template_id, position),
  CONSTRAINT whatsapp_msg_tpl_items_body_chk CHECK (
    (message_type = 'text' AND content IS NOT NULL AND length(trim(content)) > 0)
    OR
    (
      (message_type = 'image' OR message_type = 'document')
      AND media_url IS NOT NULL
      AND length(trim(media_url)) > 0
    )
  )
);

-- Itens: bases antigas tinham image_url e message_type só text|image
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_message_template_items'
      AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.whatsapp_message_template_items RENAME COLUMN image_url TO media_url;
  END IF;
END $$;

ALTER TABLE public.whatsapp_message_template_items DROP CONSTRAINT IF EXISTS whatsapp_message_template_items_message_type_check;
ALTER TABLE public.whatsapp_message_template_items DROP CONSTRAINT IF EXISTS whatsapp_msg_tpl_items_body_chk;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_message_template_items
    ADD CONSTRAINT whatsapp_message_template_items_message_type_check
    CHECK (message_type IN ('text', 'image', 'document'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_message_template_items
    ADD CONSTRAINT whatsapp_msg_tpl_items_body_chk CHECK (
      (message_type = 'text' AND content IS NOT NULL AND length(trim(content)) > 0)
      OR
      (
        (message_type = 'image' OR message_type = 'document')
        AND media_url IS NOT NULL
        AND length(trim(media_url)) > 0
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_items_template ON public.whatsapp_message_template_items(template_id);

DROP TRIGGER IF EXISTS update_whatsapp_message_template_items_updated_at ON public.whatsapp_message_template_items;
CREATE TRIGGER update_whatsapp_message_template_items_updated_at
  BEFORE UPDATE ON public.whatsapp_message_template_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.whatsapp_template_categories IS 'Categorias personalizadas de Templates WhatsApp por tenant.';
COMMENT ON TABLE public.whatsapp_message_templates IS 'Templates WhatsApp: automatic (operação/sistema) ou model (reutilização Kanbam/chat).';
COMMENT ON COLUMN public.whatsapp_message_templates.template_type IS 'automatic = fluxos operacionais; model = modelos da empresa.';
COMMENT ON TABLE public.whatsapp_message_template_items IS 'Itens ordenados: texto, imagem ou documento (URL/storage) + legenda + delay.';
COMMENT ON COLUMN public.whatsapp_message_templates.seed_key IS 'Chave idempotente para modelos padrão criados pelo sistema (ex.: sys_transfer_attendant).';
COMMENT ON COLUMN public.whatsapp_message_template_items.media_url IS 'URL ou referência de ficheiro para image/document.';

ALTER TABLE public.whatsapp_template_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_template_categories_tenant_policy ON public.whatsapp_template_categories;
CREATE POLICY whatsapp_template_categories_tenant_policy ON public.whatsapp_template_categories
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.whatsapp_message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_message_templates_tenant_policy ON public.whatsapp_message_templates;
CREATE POLICY whatsapp_message_templates_tenant_policy ON public.whatsapp_message_templates
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.whatsapp_message_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_message_template_items_tenant_policy ON public.whatsapp_message_template_items;
CREATE POLICY whatsapp_message_template_items_tenant_policy ON public.whatsapp_message_template_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.whatsapp_message_templates t
      WHERE t.id = whatsapp_message_template_items.template_id
        AND public.app_tenant_visible(t.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.whatsapp_message_templates t
      WHERE t.id = whatsapp_message_template_items.template_id
        AND (public.app_can_bypass_rls() OR t.tenant_id = public.app_current_tenant_id())
    )
  );

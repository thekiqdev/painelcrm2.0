-- Evolução do módulo Templates WhatsApp: tipo automatic|model, itens image|document, coluna media_url.
-- Aplica-se a bases que já executaram a versão anterior do 105 (image_url, sem template_type).

-- 1) Coluna template_type na tabela de templates
ALTER TABLE public.whatsapp_message_templates
  ADD COLUMN IF NOT EXISTS template_type TEXT;

UPDATE public.whatsapp_message_templates
SET template_type = 'automatic'
WHERE template_type IS NULL AND (seed_key IS NOT NULL OR is_system_default = true);

UPDATE public.whatsapp_message_templates
SET template_type = 'model'
WHERE template_type IS NULL;

-- Linhas seed com DEFAULT 'model' (coluna já existente) passam a automatic.
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

CREATE INDEX IF NOT EXISTS idx_whatsapp_msg_tpl_type ON public.whatsapp_message_templates(tenant_id, template_type);

-- 2) Itens: renomear image_url -> media_url e tipos text | image | document
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

COMMENT ON COLUMN public.whatsapp_message_templates.template_type IS 'automatic = fluxos operacionais; model = modelos da empresa.';
COMMENT ON COLUMN public.whatsapp_message_template_items.media_url IS 'URL ou referência de ficheiro para image/document.';

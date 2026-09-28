-- Upload real de mídia para Templates WhatsApp (imagem/documento), com metadados de storage por tenant.

ALTER TABLE public.whatsapp_message_template_items
  ADD COLUMN IF NOT EXISTS storage_provider TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS original_filename TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS image_width INTEGER,
  ADD COLUMN IF NOT EXISTS image_height INTEGER;

ALTER TABLE public.whatsapp_message_template_items
  ALTER COLUMN storage_provider SET DEFAULT 'local';

-- Compat: itens antigos com media_url continuam válidos.
ALTER TABLE public.whatsapp_message_template_items
  DROP CONSTRAINT IF EXISTS whatsapp_msg_tpl_items_body_chk;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_message_template_items
    ADD CONSTRAINT whatsapp_msg_tpl_items_body_chk CHECK (
      (message_type = 'text' AND content IS NOT NULL AND length(trim(content)) > 0)
      OR
      (
        (message_type = 'image' OR message_type = 'document')
        AND (
          (storage_path IS NOT NULL AND length(trim(storage_path)) > 0)
          OR
          (media_url IS NOT NULL AND length(trim(media_url)) > 0)
        )
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.whatsapp_message_template_items
  DROP CONSTRAINT IF EXISTS whatsapp_msg_tpl_items_file_size_chk;

DO $$
BEGIN
  ALTER TABLE public.whatsapp_message_template_items
    ADD CONSTRAINT whatsapp_msg_tpl_items_file_size_chk
    CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_tpl_items_storage_path
  ON public.whatsapp_message_template_items (storage_path)
  WHERE storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_tpl_items_file_size
  ON public.whatsapp_message_template_items (template_id, file_size_bytes)
  WHERE file_size_bytes IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_message_template_items.storage_provider IS 'Provider de storage (ex.: local, s3).';
COMMENT ON COLUMN public.whatsapp_message_template_items.storage_path IS 'Caminho interno de storage tenant-safe.';
COMMENT ON COLUMN public.whatsapp_message_template_items.original_filename IS 'Nome original enviado pelo utilizador.';
COMMENT ON COLUMN public.whatsapp_message_template_items.mime_type IS 'MIME type validado no upload.';
COMMENT ON COLUMN public.whatsapp_message_template_items.file_size_bytes IS 'Tamanho do arquivo em bytes; base para controle futuro de quota por tenant.';


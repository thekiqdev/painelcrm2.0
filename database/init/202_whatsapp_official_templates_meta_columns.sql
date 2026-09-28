-- Metadados Meta para modelos WhatsApp Cloud API (criação + sincronização).
ALTER TABLE public.whatsapp_official_templates
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS quality_score TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.whatsapp_official_templates.meta_template_id IS 'ID Graph do modelo (WhatsApp Message Template)';
COMMENT ON COLUMN public.whatsapp_official_templates.rejection_reason IS 'Motivo de rejeição devolvido pela Meta';
COMMENT ON COLUMN public.whatsapp_official_templates.quality_score IS 'Score de qualidade (GREEN/YELLOW/RED ou texto Meta)';
COMMENT ON COLUMN public.whatsapp_official_templates.raw_payload IS 'Última resposta bruta da Meta (criação/sync)';
COMMENT ON COLUMN public.whatsapp_official_templates.last_synced_at IS 'Última sincronização com a Graph API';

CREATE INDEX IF NOT EXISTS idx_wa_official_tpl_meta_id ON public.whatsapp_official_templates (meta_template_id)
  WHERE meta_template_id IS NOT NULL;

BEGIN;

ALTER TABLE public.crm_notes
  ADD COLUMN IF NOT EXISTS source_comment_id UUID REFERENCES public.chat_message_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_notes_source_comment
  ON public.crm_notes(source_comment_id)
  WHERE source_comment_id IS NOT NULL AND deleted_at IS NULL;

COMMIT;

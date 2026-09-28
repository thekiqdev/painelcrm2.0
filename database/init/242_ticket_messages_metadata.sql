-- Metadados em mensagens (ex.: autor no portal público)
ALTER TABLE public.ticket_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ticket_messages_metadata_source
  ON public.ticket_messages ((metadata->>'source'))
  WHERE metadata->>'source' IS NOT NULL;

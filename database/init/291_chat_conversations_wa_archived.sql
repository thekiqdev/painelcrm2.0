-- WhatsApp archive flag (CRM-owned). Independent from attendance_status.
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS wa_archived BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_conversations.wa_archived IS
  'WhatsApp archive state (CRM-owned via PATCH /wa-archive). Not synced from UazAPI find/chats payloads.';

CREATE INDEX IF NOT EXISTS idx_chat_conversations_wa_archived
  ON public.chat_conversations (wa_archived)
  WHERE wa_archived = true;

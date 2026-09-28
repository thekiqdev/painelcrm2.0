-- After 291 column; repair polluted archive flags.
UPDATE public.chat_conversations
SET wa_archived = false,
    updated_at = now()
WHERE wa_archived = true;

COMMENT ON COLUMN public.chat_conversations.wa_archived IS
  'WhatsApp archive state (CRM-owned via PATCH /wa-archive). Not synced from UazAPI find/chats payloads.';

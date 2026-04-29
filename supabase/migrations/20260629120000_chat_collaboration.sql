-- mirror of database/init/193_chat_collaboration.sql
BEGIN;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_preview TEXT,
  ADD COLUMN IF NOT EXISTS reply_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS reply_message_type TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_parent
  ON public.chat_messages(reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_message_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_message_comments_message
  ON public.chat_message_comments(message_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_message_comments_conv
  ON public.chat_message_comments(conversation_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  author_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN ('general', 'chat_message', 'follow_up', 'internal')),
  note_text TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT crm_notes_client_or_lead_not_both CHECK (
    NOT (client_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_client
  ON public.crm_notes(client_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_notes_lead
  ON public.crm_notes(lead_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crm_notes_conv
  ON public.crm_notes(conversation_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.chat_message_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_message_comments_tenant ON public.chat_message_comments;
CREATE POLICY chat_message_comments_tenant ON public.chat_message_comments
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = public.app_actor_user_id())
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = public.app_actor_user_id())
  );

DROP POLICY IF EXISTS crm_notes_tenant ON public.crm_notes;
CREATE POLICY crm_notes_tenant ON public.crm_notes
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = public.app_actor_user_id())
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR tenant_id = (SELECT u.tenant_id FROM public.users u WHERE u.id = public.app_actor_user_id())
  );

COMMIT;

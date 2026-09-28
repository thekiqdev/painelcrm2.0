-- Chat WhatsApp via UazAPI
CREATE TABLE IF NOT EXISTS public.chat_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  external_instance_name TEXT,
  instance_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.chat_instances(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  external_chat_id TEXT NOT NULL,
  external_fast_id TEXT,
  contact_name TEXT,
  profile_name TEXT,
  phone_number TEXT,
  status TEXT DEFAULT 'open',
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(instance_id, external_chat_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  external_message_id TEXT,
  body TEXT,
  media JSONB DEFAULT '[]'::jsonb,
  status TEXT,
  sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_instances_user_id ON public.chat_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_instance ON public.chat_conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON public.chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON public.chat_messages(sent_at);

CREATE TRIGGER update_chat_instances_updated_at
  BEFORE UPDATE ON public.chat_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();



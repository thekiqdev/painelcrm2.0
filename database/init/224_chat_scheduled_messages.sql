-- Mensagens de texto agendadas para envio futuro (WhatsApp via conversa existente)

CREATE TABLE IF NOT EXISTS public.chat_scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.chat_instances(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  scheduled_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('scheduled', 'processing', 'sent', 'cancelled', 'failed')),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  failure_reason TEXT,
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sched_msg_tenant_conv_sched
  ON public.chat_scheduled_messages (tenant_id, conversation_id, scheduled_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sched_msg_status_sched
  ON public.chat_scheduled_messages (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_chat_sched_msg_tenant_status
  ON public.chat_scheduled_messages (tenant_id, status);

COMMENT ON TABLE public.chat_scheduled_messages IS 'Envio diferido de texto WhatsApp associado a conversa; processado por worker.';

DROP TRIGGER IF EXISTS update_chat_scheduled_messages_updated_at ON public.chat_scheduled_messages;
CREATE TRIGGER update_chat_scheduled_messages_updated_at
  BEFORE UPDATE ON public.chat_scheduled_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

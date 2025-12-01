-- Sistema de Notificações Internas
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Comentários
COMMENT ON TABLE public.notifications IS 'Sistema de notificações internas para usuários';
COMMENT ON COLUMN public.notifications.type IS 'Tipo da notificação: new_message, message_delivered, message_read, new_conversation, connection_lost, connection_restored, lead_updated';
COMMENT ON COLUMN public.notifications.data IS 'Dados adicionais da notificação em formato JSON (ex: conversation_id, message_id, etc)';
COMMENT ON COLUMN public.notifications.read IS 'Indica se a notificação foi lida pelo usuário';


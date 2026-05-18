ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_category TEXT NOT NULL DEFAULT 'system'
  CHECK (notification_category IN ('system', 'message'));

UPDATE public.notifications
SET notification_category = 'message'
WHERE type IN (
  'new_message',
  'message_delivered',
  'message_read',
  'new_conversation',
  'chat_assigned',
  'chat_transferred',
  'chat_sla_breach'
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_category_read
  ON public.notifications(user_id, notification_category, read, created_at DESC);

COMMENT ON COLUMN public.notifications.notification_category IS
  'Categoria da notificação in-app: system (financeiro, tickets, tarefas, alertas) ou message (WhatsApp/chat/conversas).';

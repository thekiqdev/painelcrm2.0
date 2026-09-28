-- WR3: sticky de instância no retry de outbound WhatsApp

ALTER TABLE public.notification_outbound_deliveries
  ADD COLUMN IF NOT EXISTS dispatch_chat_instance_id UUID REFERENCES public.chat_instances(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notification_outbound_deliveries.dispatch_chat_instance_id IS
  'Instância WhatsApp usada no primeiro envio (routing explícito ou resolve); reutilizada em retries.';

CREATE INDEX IF NOT EXISTS idx_notification_outbound_dispatch_instance
  ON public.notification_outbound_deliveries (dispatch_chat_instance_id)
  WHERE dispatch_chat_instance_id IS NOT NULL;

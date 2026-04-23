-- Fase 4 — Motor de notificações: retry básico e remetente persistido para reprocessamento.

ALTER TABLE public.notification_outbound_deliveries
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatch_sender_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.notification_outbound_deliveries.retry_count IS 'Número de reagendamentos após falha transitória (Fase 4).';
COMMENT ON COLUMN public.notification_outbound_deliveries.next_retry_at IS 'Quando reprocessar envio WhatsApp (worker).';
COMMENT ON COLUMN public.notification_outbound_deliveries.dispatch_sender_user_id IS 'Utilizador cuja instância UazAPI foi usada no primeiro envio; reutilizado em retries.';

CREATE INDEX IF NOT EXISTS idx_notification_outbound_deliveries_retry_poll
  ON public.notification_outbound_deliveries (next_retry_at)
  WHERE status = 'queued' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbound_deliveries_ops_lookup
  ON public.notification_outbound_deliveries (tenant_id, created_at DESC, status, event_key, channel);

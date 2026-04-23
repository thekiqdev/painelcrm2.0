-- Fase 4 (horário notificação por tenant) — primeira janela elegível de envio outbound.
-- NULL = envio imediato (compatível com entregas anteriores à coluna).
-- Semântica distinta de next_retry_at (reagendamento pós-falha).

ALTER TABLE public.notification_outbound_deliveries
  ADD COLUMN IF NOT EXISTS dispatch_not_before TIMESTAMPTZ;

COMMENT ON COLUMN public.notification_outbound_deliveries.dispatch_not_before IS
  'Primeiro instante em que o envio pode ser tentado (agendamento inicial). NULL = due imediato.';

CREATE INDEX IF NOT EXISTS idx_notification_outbound_deliveries_dispatch_poll
  ON public.notification_outbound_deliveries (dispatch_not_before)
  WHERE status = 'queued' AND dispatch_not_before IS NOT NULL;

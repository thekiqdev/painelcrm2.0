-- Agenda: permitir lembretes de 30m e padronização 60m (mantendo legado 1h).

ALTER TABLE public.appointment_notifications_log
  DROP CONSTRAINT IF EXISTS appointment_notifications_log_reminder_type_check;

ALTER TABLE public.appointment_notifications_log
  ADD CONSTRAINT appointment_notifications_log_reminder_type_check
  CHECK (reminder_type IN ('10m', '30m', '60m', '1h', '1d'));

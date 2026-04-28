-- Fase 3.2: lembretes internos (log idempotente) + flag para futuro lembrete ao cliente

CREATE TABLE IF NOT EXISTS public.appointment_notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('10m', '1h', '1d')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_appointment_notif_log_appointment
  ON public.appointment_notifications_log(appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_notif_log_sent
  ON public.appointment_notifications_log(sent_at);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS send_reminder_to_client BOOLEAN NOT NULL DEFAULT false;

COMMENT ON TABLE public.appointment_notifications_log IS 'Registo de lembretes internos enviados (evita duplicados).';
COMMENT ON COLUMN public.appointments.send_reminder_to_client IS 'Reservado: envio futuro de lembrete ao cliente (WhatsApp/e-mail).';

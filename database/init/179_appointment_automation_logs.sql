CREATE TABLE IF NOT EXISTS public.appointment_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  automation_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT NOT NULL DEFAULT 'created',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_automation_logs_unique
  ON public.appointment_automation_logs(appointment_id, automation_key);

CREATE INDEX IF NOT EXISTS idx_appointment_automation_logs_appointment_id
  ON public.appointment_automation_logs(appointment_id);

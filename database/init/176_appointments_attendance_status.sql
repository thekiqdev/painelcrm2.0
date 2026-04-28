-- Agenda Fase 4.4: confirmação de presença

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS attendance_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS attendance_updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS attendance_note TEXT NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS chk_appointments_attendance_status;

ALTER TABLE public.appointments
  ADD CONSTRAINT chk_appointments_attendance_status
  CHECK (attendance_status IN ('pending', 'confirmed', 'not_confirmed', 'no_show'));

CREATE INDEX IF NOT EXISTS idx_appointments_attendance_status
  ON public.appointments(tenant_id, attendance_status);


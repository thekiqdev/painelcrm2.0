-- Fase 3.5 — pós-compromisso comercial (conclusão + resultado + notas).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT NULL,
  ADD COLUMN IF NOT EXISTS outcome TEXT NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS chk_appointments_outcome;

ALTER TABLE public.appointments
  ADD CONSTRAINT chk_appointments_outcome
  CHECK (
    outcome IS NULL
    OR outcome IN ('success', 'no_show', 'rescheduled', 'needs_follow_up', 'lost', 'other')
  );

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

COMMENT ON COLUMN public.appointments.completed_at IS 'Quando o compromisso foi concluído.';
COMMENT ON COLUMN public.appointments.completion_notes IS 'Resumo/observações de encerramento do compromisso.';
COMMENT ON COLUMN public.appointments.outcome IS 'Resultado comercial do compromisso.';

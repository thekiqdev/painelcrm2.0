-- Agenda Fase 5.7: capacidade por horário (slots públicos / mesmo responsável)

ALTER TABLE public.appointment_availability_settings
  ADD COLUMN IF NOT EXISTS capacity_per_slot integer NOT NULL DEFAULT 1;

ALTER TABLE public.appointment_user_availability_settings
  ADD COLUMN IF NOT EXISTS capacity_per_slot integer NOT NULL DEFAULT 1;

ALTER TABLE public.appointment_availability_settings
  DROP CONSTRAINT IF EXISTS chk_appointment_availability_capacity_per_slot;

ALTER TABLE public.appointment_availability_settings
  ADD CONSTRAINT chk_appointment_availability_capacity_per_slot
  CHECK (capacity_per_slot >= 1 AND capacity_per_slot <= 20);

ALTER TABLE public.appointment_user_availability_settings
  DROP CONSTRAINT IF EXISTS chk_appointment_user_availability_capacity_per_slot;

ALTER TABLE public.appointment_user_availability_settings
  ADD CONSTRAINT chk_appointment_user_availability_capacity_per_slot
  CHECK (capacity_per_slot >= 1 AND capacity_per_slot <= 20);

COMMENT ON COLUMN public.appointment_availability_settings.capacity_per_slot IS
  'Máximo de compromissos sobrepostos permitidos no mesmo horário para o mesmo responsável (remarcação pública).';

COMMENT ON COLUMN public.appointment_user_availability_settings.capacity_per_slot IS
  'Capacidade por slot quando a disponibilidade personalizada está ativa (sobrescreve a empresa).';

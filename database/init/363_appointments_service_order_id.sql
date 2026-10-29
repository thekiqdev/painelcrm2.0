-- OS-S6 — Vínculo Agenda ↔ Ordem de Serviço (visita técnica).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_order_id UUID NULL
  REFERENCES public.service_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_service_order_id
  ON public.appointments(service_order_id)
  WHERE service_order_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.service_order_id IS
  'OS de origem da visita técnica (OS-S6).';

-- FK da OS → appointment principal (coluna já existia em 360)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_orders_appointment_id_fkey'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_appointment_id_fkey
      FOREIGN KEY (appointment_id)
      REFERENCES public.appointments(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_orders_appointment_id
  ON public.service_orders(appointment_id)
  WHERE appointment_id IS NOT NULL;

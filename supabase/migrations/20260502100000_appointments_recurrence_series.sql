-- Agenda Fase 4.2A: recorrencia simples de compromissos
-- Espelha database/init/172_appointments_recurrence_series.sql

CREATE TABLE IF NOT EXISTS public.appointment_recurrence_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'meeting',
  responsible_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  location TEXT,
  recurrence_frequency TEXT NOT NULL CHECK (recurrence_frequency IN ('weekly', 'monthly', 'weekdays')),
  recurrence_interval INTEGER NOT NULL DEFAULT 1 CHECK (recurrence_interval >= 1),
  weekdays_json JSONB,
  day_of_month INTEGER NULL CHECK (day_of_month BETWEEN 1 AND 31),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  recurrence_until DATE NULL,
  max_occurrences INTEGER NULL CHECK (max_occurrences >= 1 AND max_occurrences <= 100),
  create_google_event BOOLEAN NOT NULL DEFAULT false,
  create_meet BOOLEAN NOT NULL DEFAULT false,
  send_reminder_to_client BOOLEAN NOT NULL DEFAULT false,
  reminders_json JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_recurrence_series_tenant
  ON public.appointment_recurrence_series(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointment_recurrence_series_responsible
  ON public.appointment_recurrence_series(tenant_id, responsible_user_id);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS recurrence_series_id UUID NULL REFERENCES public.appointment_recurrence_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_occurrence_index INTEGER NULL,
  ADD COLUMN IF NOT EXISTS recurrence_original_starts_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_series_id
  ON public.appointments(recurrence_series_id);

ALTER TABLE public.appointment_recurrence_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_recurrence_series_tenant_policy ON public.appointment_recurrence_series;
CREATE POLICY appointment_recurrence_series_tenant_policy ON public.appointment_recurrence_series
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());


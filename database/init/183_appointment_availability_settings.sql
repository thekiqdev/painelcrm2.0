-- Agenda Fase 5.1: disponibilidade para remarcação pública (slots por tenant)

CREATE TABLE IF NOT EXISTS public.appointment_availability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  slot_duration_minutes INT NOT NULL DEFAULT 30
    CHECK (slot_duration_minutes >= 10 AND slot_duration_minutes <= 180),
  default_meeting_duration_minutes INT NOT NULL DEFAULT 60
    CHECK (default_meeting_duration_minutes >= 15 AND default_meeting_duration_minutes <= 480),
  min_notice_minutes INT NOT NULL DEFAULT 120
    CHECK (min_notice_minutes >= 0 AND min_notice_minutes <= 10080),
  max_days_ahead INT NOT NULL DEFAULT 30
    CHECK (max_days_ahead >= 1 AND max_days_ahead <= 365),
  weekdays_json JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  work_start_time TIME NOT NULL DEFAULT '09:00',
  work_end_time TIME NOT NULL DEFAULT '18:00',
  break_start_time TIME NULL DEFAULT '12:00',
  break_end_time TIME NULL DEFAULT '13:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_appointment_availability_settings_tenant UNIQUE (tenant_id),
  CONSTRAINT chk_appointment_availability_work_window CHECK (work_end_time > work_start_time),
  CONSTRAINT chk_appointment_availability_break CHECK (
    (break_start_time IS NULL AND break_end_time IS NULL)
    OR (break_start_time IS NOT NULL AND break_end_time IS NOT NULL AND break_end_time > break_start_time)
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_availability_settings_tenant
  ON public.appointment_availability_settings (tenant_id);

DROP TRIGGER IF EXISTS update_appointment_availability_settings_updated_at ON public.appointment_availability_settings;
CREATE TRIGGER update_appointment_availability_settings_updated_at
  BEFORE UPDATE ON public.appointment_availability_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointment_availability_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_availability_settings_tenant_policy ON public.appointment_availability_settings;
CREATE POLICY appointment_availability_settings_tenant_policy ON public.appointment_availability_settings
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

COMMENT ON TABLE public.appointment_availability_settings IS 'Janelas e slots para remarcação pública na Agenda (sem Google externo).';

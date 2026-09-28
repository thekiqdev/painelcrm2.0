-- Agenda Fase 5.8: tipos de compromisso com duração padrão

CREATE TABLE IF NOT EXISTS public.appointment_type_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type_key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  default_duration_minutes INT NOT NULL
    CHECK (default_duration_minutes >= 5 AND default_duration_minutes <= 480),
  color TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_appointment_type_settings_tenant_key UNIQUE (tenant_id, type_key),
  CONSTRAINT chk_appointment_type_settings_type_key_format CHECK (
    type_key ~ '^[a-z][a-z0-9_]{0,62}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_type_settings_tenant_sort
  ON public.appointment_type_settings (tenant_id, sort_order, label);

DROP TRIGGER IF EXISTS update_appointment_type_settings_updated_at ON public.appointment_type_settings;
CREATE TRIGGER update_appointment_type_settings_updated_at
  BEFORE UPDATE ON public.appointment_type_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointment_type_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_type_settings_tenant_policy ON public.appointment_type_settings;
CREATE POLICY appointment_type_settings_tenant_policy ON public.appointment_type_settings
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

COMMENT ON TABLE public.appointment_type_settings IS 'Tipos de compromisso configuráveis por tenant (duração padrão, labels).';

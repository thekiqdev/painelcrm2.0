-- Mirror database/init/188_appointment_holidays.sql (Agenda Fase 5.4)

ALTER TABLE public.appointment_availability_settings
  ADD COLUMN IF NOT EXISTS block_holidays BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS holiday_country_code TEXT NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS holiday_state_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS holiday_city TEXT NULL;

CREATE TABLE IF NOT EXISTS public.appointment_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  scope TEXT NOT NULL DEFAULT 'tenant'
    CHECK (scope IN ('global', 'tenant')),
  country_code TEXT NULL,
  state_code TEXT NULL,
  city TEXT NULL,
  is_recurring_yearly BOOLEAN NOT NULL DEFAULT false,
  blocks_availability BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'seed', 'import')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_appointment_holidays_scope_tenant CHECK (
    (scope = 'global' AND tenant_id IS NULL)
    OR (scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_holidays_date ON public.appointment_holidays (holiday_date);
CREATE INDEX IF NOT EXISTS idx_appointment_holidays_tenant ON public.appointment_holidays (tenant_id);

DROP TRIGGER IF EXISTS update_appointment_holidays_updated_at ON public.appointment_holidays;
CREATE TRIGGER update_appointment_holidays_updated_at
  BEFORE UPDATE ON public.appointment_holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointment_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_holidays_select ON public.appointment_holidays;
CREATE POLICY appointment_holidays_select ON public.appointment_holidays
  FOR SELECT
  USING (
    public.app_can_bypass_rls()
    OR scope = 'global'
    OR (scope = 'tenant' AND tenant_id = public.app_current_tenant_id())
  );

DROP POLICY IF EXISTS appointment_holidays_insert ON public.appointment_holidays;
CREATE POLICY appointment_holidays_insert ON public.appointment_holidays
  FOR INSERT
  WITH CHECK (
    public.app_can_bypass_rls()
    OR (scope = 'tenant' AND tenant_id = public.app_current_tenant_id())
  );

DROP POLICY IF EXISTS appointment_holidays_update ON public.appointment_holidays;
CREATE POLICY appointment_holidays_update ON public.appointment_holidays
  FOR UPDATE
  USING (
    public.app_can_bypass_rls()
    OR (scope = 'tenant' AND tenant_id = public.app_current_tenant_id())
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR (scope = 'tenant' AND tenant_id = public.app_current_tenant_id())
  );

INSERT INTO public.appointment_holidays (
  id, tenant_id, name, holiday_date, scope, country_code, state_code, city,
  is_recurring_yearly, blocks_availability, source, is_active
) VALUES
  ('a1000001-0001-4001-8001-000000000001'::uuid, NULL, 'Confraternização Universal', '2000-01-01', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000002'::uuid, NULL, 'Tiradentes', '2000-04-21', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000003'::uuid, NULL, 'Dia do Trabalho', '2000-05-01', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000004'::uuid, NULL, 'Independência do Brasil', '2000-09-07', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000005'::uuid, NULL, 'Nossa Senhora Aparecida', '2000-10-12', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000006'::uuid, NULL, 'Finados', '2000-11-02', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000007'::uuid, NULL, 'Proclamação da República', '2000-11-15', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000008'::uuid, NULL, 'Dia Nacional de Zumbi e da Consciência Negra', '2000-11-20', 'global', 'BR', NULL, NULL, true, true, 'seed', true),
  ('a1000001-0001-4001-8001-000000000009'::uuid, NULL, 'Natal', '2000-12-25', 'global', 'BR', NULL, NULL, true, true, 'seed', true)
ON CONFLICT (id) DO NOTHING;

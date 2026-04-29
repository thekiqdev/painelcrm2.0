-- Agenda Fase 5.3: bloqueios / indisponibilidades (tenant e utilizador)

CREATE TABLE IF NOT EXISTS public.appointment_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  block_scope TEXT NOT NULL DEFAULT 'user'
    CHECK (block_scope IN ('tenant', 'user')),
  block_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (block_type IN ('manual', 'holiday', 'vacation', 'external_meeting', 'maintenance', 'other')),
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ NULL,
  CONSTRAINT chk_appointment_availability_blocks_range CHECK (ends_at > starts_at),
  CONSTRAINT chk_appointment_availability_blocks_scope_user CHECK (
    (block_scope = 'tenant' AND user_id IS NULL)
    OR (block_scope = 'user' AND user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_appointment_availability_blocks_tenant_starts
  ON public.appointment_availability_blocks (tenant_id, starts_at)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_availability_blocks_tenant_ends
  ON public.appointment_availability_blocks (tenant_id, ends_at)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointment_availability_blocks_user_starts
  ON public.appointment_availability_blocks (tenant_id, user_id, starts_at)
  WHERE cancelled_at IS NULL AND user_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_appointment_availability_blocks_updated_at ON public.appointment_availability_blocks;
CREATE TRIGGER update_appointment_availability_blocks_updated_at
  BEFORE UPDATE ON public.appointment_availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointment_availability_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_availability_blocks_tenant_policy ON public.appointment_availability_blocks;
CREATE POLICY appointment_availability_blocks_tenant_policy ON public.appointment_availability_blocks
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

COMMENT ON TABLE public.appointment_availability_blocks IS 'Indisponibilidades da agenda (não são compromissos; não disparam notificações).';

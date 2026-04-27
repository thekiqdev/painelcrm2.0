-- Módulo Agenda (compromissos) + ligação opcional a Google Calendar do utilizador que cria o evento.

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  responsible_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'meeting',
  status TEXT NOT NULL DEFAULT 'scheduled',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  create_google_event BOOLEAN NOT NULL DEFAULT false,
  google_calendar_connection_id UUID NULL REFERENCES public.google_calendar_connections(id) ON DELETE SET NULL,
  google_event_id TEXT,
  google_meet_link TEXT,
  google_html_link TEXT,
  sync_status TEXT NOT NULL DEFAULT 'not_synced',
  sync_error TEXT,
  reminders_json JSONB,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT chk_appointments_time_range CHECK (ends_at > starts_at),
  CONSTRAINT chk_appointments_status CHECK (status IN ('scheduled', 'done', 'cancelled')),
  CONSTRAINT chk_appointments_sync_status CHECK (sync_status IN ('not_synced', 'synced', 'error', 'cancelled')),
  CONSTRAINT chk_appointments_client_lead_excl CHECK (
    NOT (client_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON public.appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_starts_at ON public.appointments(tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_responsible ON public.appointments(responsible_user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON public.appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_google_event_id
  ON public.appointments(google_event_id) WHERE google_event_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_appointments_updated_at ON public.appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.appointment_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  attendee_type TEXT NOT NULL DEFAULT 'external',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_attendees_appointment ON public.appointment_attendees(appointment_id);

COMMENT ON TABLE public.appointments IS 'Compromissos CRM (módulo agenda); sync Google na conta do utilizador autenticado que cria.';

-- RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointments_tenant_policy ON public.appointments;
CREATE POLICY appointments_tenant_policy ON public.appointments
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.appointment_attendees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_attendees_tenant_policy ON public.appointment_attendees;
CREATE POLICY appointment_attendees_tenant_policy ON public.appointment_attendees
  FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_attendees.appointment_id
        AND public.app_tenant_visible(a.tenant_id)
    )
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_attendees.appointment_id
        AND a.tenant_id = public.app_current_tenant_id()
    )
  );

-- Permissões por módulo (agenda)
INSERT INTO public.role_module_permissions (role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
VALUES
  ('admin', 'agenda', true, true, true, true, false, false),
  ('manager', 'agenda', true, true, true, true, false, false),
  ('member', 'agenda', true, true, true, true, true, true),
  ('viewer', 'agenda', true, false, false, false, false, false)
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  edit_own_only = EXCLUDED.edit_own_only,
  delete_own_only = EXCLUDED.delete_own_only,
  updated_at = now();

-- Feature do plano: habilitar agenda em todos os planos
INSERT INTO public.plan_features (plan_id, feature_key, enabled, created_at, updated_at)
SELECT id, 'agenda', true, now(), now() FROM public.plans
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = true, updated_at = now();

-- Catálogo de recursos (Super Admin)
INSERT INTO public.system_features (key, name, description, sort_order) VALUES
  ('agenda', 'Agenda', 'Compromissos e integração com Google Calendar', 125)
ON CONFLICT (key) DO NOTHING;

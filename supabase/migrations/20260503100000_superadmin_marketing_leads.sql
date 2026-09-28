-- Mirror database/init/198_superadmin_marketing_leads.sql

CREATE TABLE IF NOT EXISTS public.superadmin_lead_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.superadmin_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source TEXT NOT NULL DEFAULT 'Importação',
  status TEXT,
  notes TEXT,
  assignee_label TEXT,
  active_label TEXT,
  import_kind TEXT NOT NULL CHECK (import_kind IN ('lead_csv', 'client_csv')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_superadmin_leads_created ON public.superadmin_leads (created_at DESC);

CREATE TABLE IF NOT EXISTS public.superadmin_lead_group_members (
  group_id UUID NOT NULL REFERENCES public.superadmin_lead_groups(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.superadmin_leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_superadmin_lead_group_members_lead ON public.superadmin_lead_group_members (lead_id);

DROP TRIGGER IF EXISTS update_superadmin_lead_groups_updated_at ON public.superadmin_lead_groups;
CREATE TRIGGER update_superadmin_lead_groups_updated_at
  BEFORE UPDATE ON public.superadmin_lead_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_superadmin_leads_updated_at ON public.superadmin_leads;
CREATE TRIGGER update_superadmin_leads_updated_at
  BEFORE UPDATE ON public.superadmin_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.announcement_sends
  ADD COLUMN IF NOT EXISTS superadmin_lead_group_id UUID REFERENCES public.superadmin_lead_groups(id) ON DELETE RESTRICT;

ALTER TABLE public.announcement_sends ALTER COLUMN group_id DROP NOT NULL;

ALTER TABLE public.announcement_sends DROP CONSTRAINT IF EXISTS announcement_sends_target_chk;
ALTER TABLE public.announcement_sends ADD CONSTRAINT announcement_sends_target_chk CHECK (
  (group_id IS NOT NULL AND superadmin_lead_group_id IS NULL)
  OR (group_id IS NULL AND superadmin_lead_group_id IS NOT NULL)
);

ALTER TABLE public.announcement_send_recipients
  ADD COLUMN IF NOT EXISTS superadmin_lead_id UUID REFERENCES public.superadmin_leads(id) ON DELETE RESTRICT;

ALTER TABLE public.announcement_send_recipients ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.announcement_send_recipients DROP CONSTRAINT IF EXISTS announcement_send_recipients_send_id_tenant_id_key;

ALTER TABLE public.announcement_send_recipients DROP CONSTRAINT IF EXISTS announcement_send_recipients_dest_chk;
ALTER TABLE public.announcement_send_recipients ADD CONSTRAINT announcement_send_recipients_dest_chk CHECK (
  (tenant_id IS NOT NULL AND superadmin_lead_id IS NULL)
  OR (tenant_id IS NULL AND superadmin_lead_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ann_send_rec_send_tenant
  ON public.announcement_send_recipients (send_id, tenant_id)
  WHERE tenant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ann_send_rec_send_lead
  ON public.announcement_send_recipients (send_id, superadmin_lead_id)
  WHERE superadmin_lead_id IS NOT NULL;

COMMENT ON TABLE public.superadmin_leads IS 'Contactos importados no Super Admin (planilhas tipo CRM) para segmentação e disparos WhatsApp';
COMMENT ON COLUMN public.announcement_sends.superadmin_lead_group_id IS 'Envio por grupo de leads da plataforma (alternativo a group_id de tenants)';

CREATE TABLE IF NOT EXISTS public.communication_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'whatsapp_uazapi',
  provider_contact_id TEXT,
  phone TEXT,
  username TEXT,
  display_name TEXT,
  profile_avatar_url TEXT,
  linked_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  linked_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  raw_profile JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_profile_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communication_contacts IS
  'Identidade técnica multicanal do contato externo; ponte para client/lead sem duplicar CRM.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_contacts_tenant_provider_phone
  ON public.communication_contacts(tenant_id, provider, phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_contacts_tenant_provider_contact
  ON public.communication_contacts(tenant_id, provider, provider_contact_id)
  WHERE provider_contact_id IS NOT NULL AND btrim(provider_contact_id) <> '';

CREATE INDEX IF NOT EXISTS idx_communication_contacts_tenant_updated_at
  ON public.communication_contacts(tenant_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_communication_contacts_updated_at ON public.communication_contacts;
CREATE TRIGGER update_communication_contacts_updated_at
  BEFORE UPDATE ON public.communication_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.communication_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_contacts_tenant_policy ON public.communication_contacts;
CREATE POLICY communication_contacts_tenant_policy ON public.communication_contacts
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());


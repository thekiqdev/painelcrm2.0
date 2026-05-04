-- WhatsApp Business Platform (Meta Cloud API) — provider paralelo à UazAPI
-- Não remove nem altera fluxos UazAPI; novas tabelas + extensão opcional de chat_conversations.

CREATE TABLE IF NOT EXISTS public.whatsapp_official_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_scope TEXT NOT NULL CHECK (owner_scope IN ('superadmin', 'tenant')),
  business_account_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  verified_name TEXT,
  access_token_ciphertext TEXT NOT NULL,
  webhook_verify_token TEXT NOT NULL,
  app_id TEXT,
  app_secret_ciphertext TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'disabled')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Inbox: utilizador (ex. super admin) que vê as conversas deste número
  inbox_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_official_accounts_tenant ON public.whatsapp_official_accounts (tenant_id)
  WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_official_accounts_scope ON public.whatsapp_official_accounts (owner_scope);
CREATE INDEX IF NOT EXISTS idx_whatsapp_official_accounts_phone_number_id ON public.whatsapp_official_accounts (phone_number_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_official_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.whatsapp_official_accounts(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  category TEXT,
  status TEXT,
  components JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, template_name, language)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_official_templates_account ON public.whatsapp_official_templates (account_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_official_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.whatsapp_official_accounts(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'pt_BR',
  template_components JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled')),
  scheduled_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  audience_meta JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_official_campaigns_account ON public.whatsapp_official_campaigns (account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_official_campaigns_status ON public.whatsapp_official_campaigns (status);

CREATE TABLE IF NOT EXISTS public.whatsapp_official_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.whatsapp_official_campaigns(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  superadmin_lead_id UUID REFERENCES public.superadmin_leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_official_campaign_recipients_campaign ON public.whatsapp_official_campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_official_campaign_recipients_phone ON public.whatsapp_official_campaign_recipients (recipient_phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_official_campaign_recipients_wamid
  ON public.whatsapp_official_campaign_recipients (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- Conversas oficiais sem chat_instances: XOR com instance_id
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_instance_xor_official;
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS whatsapp_official_account_id UUID REFERENCES public.whatsapp_official_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.chat_conversations ALTER COLUMN instance_id DROP NOT NULL;

ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_instance_xor_official CHECK (
  (instance_id IS NOT NULL AND whatsapp_official_account_id IS NULL)
  OR (instance_id IS NULL AND whatsapp_official_account_id IS NOT NULL)
);

DROP INDEX IF EXISTS uq_chat_conversations_official_external;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_conversations_official_external
  ON public.chat_conversations (whatsapp_official_account_id, external_chat_id)
  WHERE whatsapp_official_account_id IS NOT NULL;

COMMENT ON COLUMN public.chat_conversations.whatsapp_official_account_id IS 'Conversa WhatsApp Cloud API (Meta); provider da conversa = whatsapp_official';

DROP TRIGGER IF EXISTS update_whatsapp_official_accounts_updated_at ON public.whatsapp_official_accounts;
CREATE TRIGGER update_whatsapp_official_accounts_updated_at
  BEFORE UPDATE ON public.whatsapp_official_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_official_templates_updated_at ON public.whatsapp_official_templates;
CREATE TRIGGER update_whatsapp_official_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_official_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_whatsapp_official_campaigns_updated_at ON public.whatsapp_official_campaigns;
CREATE TRIGGER update_whatsapp_official_campaigns_updated_at
  BEFORE UPDATE ON public.whatsapp_official_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.whatsapp_official_accounts IS 'Credenciais Meta Cloud API (tokens em ciphertext)';
COMMENT ON TABLE public.whatsapp_official_campaigns IS 'Campanhas template Super Admin / tenants (feature flag)';

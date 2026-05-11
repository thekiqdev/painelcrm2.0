-- Suporte da plataforma (clientes PainelCRM) — domínio separado dos tickets do tenant.

CREATE TABLE IF NOT EXISTS public.platform_support_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number TEXT,
  whatsapp_message_template TEXT NOT NULL DEFAULT 'Olá, preciso de suporte no PainelCRM. Minha empresa é {{tenant_name}}.',
  support_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.platform_support_settings (support_enabled)
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_support_settings);

CREATE TRIGGER update_platform_support_settings_updated_at
  BEFORE UPDATE ON public.platform_support_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category VARCHAR(64) NOT NULL,
  priority VARCHAR(32) NOT NULL DEFAULT 'medium',
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT platform_support_tickets_category_chk CHECK (
    category IN (
      'question', 'bug', 'billing', 'whatsapp_integration', 'google_integration', 'suggestion', 'other'
    )
  ),
  CONSTRAINT platform_support_tickets_priority_chk CHECK (
    priority IN ('low', 'medium', 'high', 'urgent')
  ),
  CONSTRAINT platform_support_tickets_status_chk CHECK (
    status IN ('open', 'waiting_support', 'waiting_customer', 'resolved', 'closed')
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_tenant_created
  ON public.platform_support_tickets (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_status
  ON public.platform_support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_priority
  ON public.platform_support_tickets (priority);

CREATE TABLE IF NOT EXISTS public.platform_support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.platform_support_tickets(id) ON DELETE CASCADE,
  sender_type VARCHAR(16) NOT NULL,
  sender_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_support_ticket_messages_sender_chk CHECK (
    sender_type IN ('customer', 'superadmin')
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_support_ticket_messages_ticket
  ON public.platform_support_ticket_messages (ticket_id, created_at ASC);

COMMENT ON TABLE public.platform_support_settings IS 'Configuração global do suporte da plataforma (WhatsApp, ativo).';
COMMENT ON TABLE public.platform_support_tickets IS 'Chamados de suporte da plataforma por tenant (não misturar com tickets operacionais).';
COMMENT ON TABLE public.platform_support_ticket_messages IS 'Thread de mensagens do suporte da plataforma.';

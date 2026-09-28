-- Fase 2 — Motor Central de Notificações: núcleo mínimo (catálogo, overrides, entregas).
-- Templates "sistema" são apenas seed aqui; tenants não atualizam estas linhas via app (overrides em tabela dedicada).

CREATE TABLE IF NOT EXISTS public.notification_event_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT,
  default_channel TEXT NOT NULL CHECK (default_channel IN ('whatsapp', 'email', 'sms')),
  merge_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_event_catalog IS 'Catálogo global de eventos do motor de notificações (MVP transacional).';
COMMENT ON COLUMN public.notification_event_catalog.merge_fields IS 'Whitelist JSON array de chaves permitidas (ex.: ["tenant.name","client.name"]).';

CREATE TABLE IF NOT EXISTS public.notification_template_system (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES public.notification_event_catalog(event_key) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  subject_template TEXT,
  body_template TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_template_system_event_channel_locale_key UNIQUE (event_key, channel, locale)
);

COMMENT ON TABLE public.notification_template_system IS 'Templates padrão do sistema (imutáveis via app tenant; manutenção via migração/seed).';

CREATE TABLE IF NOT EXISTS public.tenant_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL REFERENCES public.notification_event_catalog(event_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  primary_channel TEXT CHECK (primary_channel IS NULL OR primary_channel IN ('whatsapp', 'email', 'sms')),
  recipient_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_notification_preferences_tenant_event_key UNIQUE (tenant_id, event_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_notification_template_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL REFERENCES public.notification_event_catalog(event_key) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  system_template_id UUID NOT NULL REFERENCES public.notification_template_system(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_notification_template_overrides_unique UNIQUE (tenant_id, event_key, channel, locale)
);

COMMENT ON TABLE public.tenant_notification_template_overrides IS 'Override editável pelo tenant; não altera notification_template_system.';

CREATE TABLE IF NOT EXISTS public.notification_outbound_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  idempotency_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
  recipient_type TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled', 'skipped')),
  rendered_subject TEXT,
  rendered_body TEXT NOT NULL,
  error_message TEXT,
  provider_message_id TEXT,
  actor JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT notification_outbound_deliveries_idempotency UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_outbound_deliveries_tenant_created
  ON public.notification_outbound_deliveries(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_outbound_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.notification_outbound_deliveries(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  provider_response JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbound_delivery_attempts_delivery
  ON public.notification_outbound_delivery_attempts(delivery_id, attempt_number);

-- Triggers updated_at
DROP TRIGGER IF EXISTS update_notification_event_catalog_updated_at ON public.notification_event_catalog;
CREATE TRIGGER update_notification_event_catalog_updated_at
  BEFORE UPDATE ON public.notification_event_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_template_system_updated_at ON public.notification_template_system;
CREATE TRIGGER update_notification_template_system_updated_at
  BEFORE UPDATE ON public.notification_template_system
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_notification_preferences_updated_at ON public.tenant_notification_preferences;
CREATE TRIGGER update_tenant_notification_preferences_updated_at
  BEFORE UPDATE ON public.tenant_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tenant_notification_template_overrides_updated_at ON public.tenant_notification_template_overrides;
CREATE TRIGGER update_tenant_notification_template_overrides_updated_at
  BEFORE UPDATE ON public.tenant_notification_template_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_outbound_deliveries_updated_at ON public.notification_outbound_deliveries;
CREATE TRIGGER update_notification_outbound_deliveries_updated_at
  BEFORE UPDATE ON public.notification_outbound_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS (tabelas com tenant_id)
ALTER TABLE public.tenant_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_notification_preferences_tenant_policy ON public.tenant_notification_preferences;
CREATE POLICY tenant_notification_preferences_tenant_policy ON public.tenant_notification_preferences
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.tenant_notification_template_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_notification_template_overrides_tenant_policy ON public.tenant_notification_template_overrides;
CREATE POLICY tenant_notification_template_overrides_tenant_policy ON public.tenant_notification_template_overrides
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.notification_outbound_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_outbound_deliveries_tenant_policy ON public.notification_outbound_deliveries;
CREATE POLICY notification_outbound_deliveries_tenant_policy ON public.notification_outbound_deliveries
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.notification_outbound_delivery_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_outbound_delivery_attempts_tenant_policy ON public.notification_outbound_delivery_attempts;
CREATE POLICY notification_outbound_delivery_attempts_tenant_policy ON public.notification_outbound_delivery_attempts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_outbound_deliveries d
      WHERE d.id = notification_outbound_delivery_attempts.delivery_id
        AND public.app_tenant_visible(d.tenant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notification_outbound_deliveries d
      WHERE d.id = notification_outbound_delivery_attempts.delivery_id
        AND (public.app_can_bypass_rls() OR d.tenant_id = public.app_current_tenant_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Seed: eventos + templates sistema (WhatsApp, pt-BR) — idempotente
-- ---------------------------------------------------------------------------

INSERT INTO public.notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  ('proposal.sent', 'proposals', 'Proposta enviada ao cliente', 'whatsapp',
   '["tenant.name","client.name","proposal.title","proposal.total","proposal.public_link"]'::jsonb, true),
  ('proposal.accepted', 'proposals', 'Proposta aceita', 'whatsapp',
   '["tenant.name","client.name","proposal.title"]'::jsonb, true),
  ('proposal.rejected', 'proposals', 'Proposta recusada', 'whatsapp',
   '["tenant.name","client.name","proposal.title"]'::jsonb, true),
  ('contract.sent', 'contracts', 'Contrato enviado para assinatura', 'whatsapp',
   '["tenant.name","client.name","contract.title","contract.sign_link","contract.public_view_link","signer.name","signer.email","signer.whatsapp"]'::jsonb, true),
  ('contract.signed', 'contracts', 'Contrato assinado', 'whatsapp',
   '["tenant.name","client.name","contract.title","contract.public_view_link"]'::jsonb, true),
  ('invoice.created', 'invoices', 'Fatura criada', 'whatsapp',
   '["tenant.name","client.name","invoice.number","invoice.total","invoice.due_date","invoice.public_link"]'::jsonb, true),
  ('invoice.due_soon', 'invoices', 'Fatura a vencer', 'whatsapp',
   '["tenant.name","client.name","invoice.number","invoice.total","invoice.due_date","invoice.public_link"]'::jsonb, true),
  ('invoice.overdue', 'invoices', 'Fatura vencida', 'whatsapp',
   '["tenant.name","client.name","invoice.number","invoice.total","invoice.due_date","invoice.public_link"]'::jsonb, true),
  ('invoice.paid', 'invoices', 'Fatura paga', 'whatsapp',
   '["tenant.name","client.name","invoice.number","invoice.total","invoice.public_link"]'::jsonb, true)
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('proposal.sent', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\n*Proposta:* {{proposal.title}}\n*Valor:* {{proposal.total}}\n\n*Link da proposta:*\n{{proposal.public_link}}\n\nDúvidas, responda a esta mensagem.\n\n{{tenant.name}}',
   1, true),
  ('proposal.accepted', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nConfirmamos o aceite da proposta *«{{proposal.title}}»*.\n\nObrigado pela confiança.\n\n{{tenant.name}}',
   1, true),
  ('proposal.rejected', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nRecebemos o seu retorno sobre *«{{proposal.title}}»*.\n\nEstamos à disposição.\n\n{{tenant.name}}',
   1, true),
  ('contract.sent', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{signer.name}}*.\n\nConvite para assinar *«{{contract.title}}»*.\n\n*Assinatura:*\n{{contract.sign_link}}\n\n*Documento (somente leitura):*\n{{contract.public_view_link}}\n\n{{tenant.name}}',
   1, true),
  ('contract.signed', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nO contrato *«{{contract.title}}»* está assinado.\n\n*Documento:*\n{{contract.public_view_link}}\n\n{{tenant.name}}',
   1, true),
  ('invoice.created', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nCriámos a fatura *{{invoice.number}}*.\n\n*Valor:* {{invoice.total}}\n*Vencimento:* {{invoice.due_date}}\n\n*Consulte ou pague aqui:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
   1, true),
  ('invoice.due_soon', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\n*Lembrete de vencimento*\n\nFatura *{{invoice.number}}*\n*Valor:* {{invoice.total}}\n*Data:* {{invoice.due_date}}\n\n*Link da fatura:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
   1, true),
  ('invoice.overdue', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nA fatura *{{invoice.number}}* está em atraso.\n\n*Valor:* {{invoice.total}}\n*Vencimento:* {{invoice.due_date}}\n\n*Regularizar ou consultar:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
   1, true),
  ('invoice.paid', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{client.name}}*.\n\nPagamento confirmado — fatura *{{invoice.number}}* (*{{invoice.total}}*).\n\n*Recibo / detalhe:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
   1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;

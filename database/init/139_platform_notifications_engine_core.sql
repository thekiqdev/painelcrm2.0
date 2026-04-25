-- Fase 2 — Motor de Notificações da PLATAFORMA (domínio separado do motor do tenant).
-- MVP: catálogo + templates sistema + overrides Super Admin + entregas + tentativas.
-- Canal seed: apenas whatsapp. Sem tabelas de anúncios/campanhas.

CREATE TABLE IF NOT EXISTS public.platform_notification_event_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT,
  default_channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (default_channel = 'whatsapp'),
  merge_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_notification_event_catalog IS 'Catálogo de eventos do motor transacional da PLATAFORMA (prefixo platform.*).';
COMMENT ON COLUMN public.platform_notification_event_catalog.merge_fields IS 'Whitelist JSON array de merge fields permitidos por event_key (modo strict).';

CREATE TABLE IF NOT EXISTS public.platform_notification_template_system (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES public.platform_notification_event_catalog(event_key) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel = 'whatsapp'),
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  subject_template TEXT,
  body_template TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_notification_template_system_event_channel_locale_key UNIQUE (event_key, channel, locale)
);

COMMENT ON TABLE public.platform_notification_template_system IS 'Templates padrão da plataforma (baseline por migração; Super Admin edita via override).';

CREATE TABLE IF NOT EXISTS public.platform_notification_template_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES public.platform_notification_event_catalog(event_key) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel = 'whatsapp'),
  locale TEXT NOT NULL DEFAULT 'pt-BR',
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  system_template_id UUID NOT NULL REFERENCES public.platform_notification_template_system(id) ON DELETE RESTRICT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_notification_template_overrides_unique UNIQUE (event_key, channel, locale)
);

COMMENT ON TABLE public.platform_notification_template_overrides IS 'Override operacional editável apenas por Super Admin; não altera template sistema.';

CREATE TABLE IF NOT EXISTS public.platform_notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  idempotency_key TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel = 'whatsapp'),
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
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  dispatch_sender_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  dispatch_not_before TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  CONSTRAINT platform_notification_deliveries_idempotency UNIQUE (target_tenant_id, idempotency_key)
);

COMMENT ON TABLE public.platform_notification_deliveries IS 'Histórico/fila de entregas do motor da PLATAFORMA (não usar notification_outbound_deliveries do tenant).';
COMMENT ON COLUMN public.platform_notification_deliveries.target_tenant_id IS 'Tenant (conta cliente da plataforma) alvo da mensagem.';

CREATE INDEX IF NOT EXISTS idx_platform_notification_deliveries_target_created
  ON public.platform_notification_deliveries(target_tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_notification_deliveries_retry_poll
  ON public.platform_notification_deliveries (next_retry_at)
  WHERE status = 'queued' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_notification_deliveries_ops
  ON public.platform_notification_deliveries (target_tenant_id, created_at DESC, status, event_key, channel);

CREATE TABLE IF NOT EXISTS public.platform_notification_delivery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES public.platform_notification_deliveries(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  provider_response JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_notification_delivery_attempts_delivery
  ON public.platform_notification_delivery_attempts(delivery_id, attempt_number);

-- Triggers updated_at
DROP TRIGGER IF EXISTS update_platform_notification_event_catalog_updated_at ON public.platform_notification_event_catalog;
CREATE TRIGGER update_platform_notification_event_catalog_updated_at
  BEFORE UPDATE ON public.platform_notification_event_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_notification_template_system_updated_at ON public.platform_notification_template_system;
CREATE TRIGGER update_platform_notification_template_system_updated_at
  BEFORE UPDATE ON public.platform_notification_template_system
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_notification_template_overrides_updated_at ON public.platform_notification_template_overrides;
CREATE TRIGGER update_platform_notification_template_overrides_updated_at
  BEFORE UPDATE ON public.platform_notification_template_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_notification_deliveries_updated_at ON public.platform_notification_deliveries;
CREATE TRIGGER update_platform_notification_deliveries_updated_at
  BEFORE UPDATE ON public.platform_notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seeds: catálogo MVP reduzido (5 eventos)
INSERT INTO public.platform_notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  ('platform.account.created', 'platform_auth', 'Conta (tenant) criada na plataforma — boas-vindas', 'whatsapp',
   '["platform.name","platform.support_link","tenant.name","tenant.admin_name","tenant.admin_email","tenant.admin_whatsapp","auth.login_link"]'::jsonb, true),
  ('platform.auth.login_link.issued', 'platform_auth', 'Link de acesso / login emitido (quando houver fluxo dedicado)', 'whatsapp',
   '["platform.name","tenant.name","auth.login_link","auth.magic_link_expires_at"]'::jsonb, true),
  ('platform.plan.activated', 'platform_billing', 'Plano ativado para o tenant', 'whatsapp',
   '["platform.name","tenant.name","tenant.admin_name","plan.name"]'::jsonb, true),
  ('platform.billing.charge.created', 'platform_billing', 'Cobrança SaaS criada', 'whatsapp',
   '["platform.name","tenant.name","tenant.admin_name","billing.amount","billing.due_date","billing.payment_link","billing.invoice_number"]'::jsonb, true),
  ('platform.billing.payment_confirmed', 'platform_billing', 'Pagamento da cobrança SaaS confirmado', 'whatsapp',
   '["platform.name","tenant.name","tenant.admin_name","plan.name","billing.amount","billing.invoice_number"]'::jsonb, true)
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('platform.account.created', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{tenant.admin_name}}*.\n\n*Bem-vindo(a) à {{platform.name}}!*\n\nConta: *{{tenant.name}}*\n\nAceda ao painel:\n{{auth.login_link}}\n\n{{platform.support_link}}',
   1, true),
  ('platform.auth.login_link.issued', 'whatsapp', 'pt-BR', NULL,
   E'Olá,\n\n*{{platform.name}}* — link de acesso para *{{tenant.name}}*.\n\n{{auth.login_link}}\n\nVálido até: {{auth.magic_link_expires_at}}',
   1, true),
  ('platform.plan.activated', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{tenant.admin_name}}*.\n\nO plano *{{plan.name}}* está *ativo* para *{{tenant.name}}*.\n\n{{platform.name}}',
   1, true),
  ('platform.billing.charge.created', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{tenant.admin_name}}*.\n\nNova cobrança *{{billing.invoice_number}}* — *{{billing.amount}}*.\nVencimento: *{{billing.due_date}}*\n\nPagar/consultar:\n{{billing.payment_link}}\n\n{{platform.name}}',
   1, true),
  ('platform.billing.payment_confirmed', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{tenant.admin_name}}*.\n\n*Pagamento confirmado* — fatura *{{billing.invoice_number}}* (*{{billing.amount}}*).\nPlano: *{{plan.name}}* | Conta: *{{tenant.name}}*\n\n{{platform.name}}',
   1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;

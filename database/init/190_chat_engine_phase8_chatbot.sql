-- Chat Engine Fase 8 — Chatbot básico (regras isoladas; não confundir com chat_automation_rules da Fase 6)

CREATE TYPE public.chat_bot_rule_type AS ENUM (
  'welcome_message',
  'out_of_hours',
  'menu',
  'keyword'
);

CREATE TABLE IF NOT EXISTS public.chat_bot_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type public.chat_bot_rule_type NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_bot_rules_tenant_active_prio
  ON public.chat_bot_rules (tenant_id, is_active, priority ASC);

ALTER TABLE public.chat_bot_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_bot_rules_tenant_policy ON public.chat_bot_rules;
CREATE POLICY chat_bot_rules_tenant_policy ON public.chat_bot_rules
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

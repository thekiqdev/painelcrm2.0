-- Sync with database/init/189_chat_engine_phase7_operational_ui.sql (Chat Engine Fase 7)

CREATE TABLE IF NOT EXISTS public.chat_automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.chat_automation_rules(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'ok',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_auto_logs_tenant_created ON public.chat_automation_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_auto_logs_conv ON public.chat_automation_logs(conversation_id, created_at DESC);

ALTER TABLE public.chat_automation_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_automation_logs_tenant_policy ON public.chat_automation_logs;
CREATE POLICY chat_automation_logs_tenant_policy ON public.chat_automation_logs
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

ALTER TABLE public.chat_automation_settings
  ADD COLUMN IF NOT EXISTS sla_alerts_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.chat_automation_settings
  ADD COLUMN IF NOT EXISTS sla_risk_percent INTEGER DEFAULT 80;

UPDATE public.chat_automation_settings SET sla_risk_percent = 80 WHERE sla_risk_percent IS NULL;

ALTER TABLE public.chat_automation_settings
  ALTER COLUMN sla_risk_percent SET NOT NULL;

ALTER TABLE public.chat_automation_settings
  DROP CONSTRAINT IF EXISTS chat_automation_settings_sla_risk_percent_check;

ALTER TABLE public.chat_automation_settings
  ADD CONSTRAINT chat_automation_settings_sla_risk_percent_check
  CHECK (sla_risk_percent >= 50 AND sla_risk_percent <= 99);

ALTER TABLE public.chat_queues
  ADD COLUMN IF NOT EXISTS sla_first_response_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS sla_next_response_minutes INTEGER;

ALTER TABLE public.chat_automation_rules
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.chat_automation_rules DROP CONSTRAINT IF EXISTS chat_automation_rules_match_type_check;
ALTER TABLE public.chat_automation_rules
  ADD CONSTRAINT chat_automation_rules_match_type_check
  CHECK (match_type IN ('keyword_body', 'client_tag', 'client_new', 'client_existing'));

ALTER TABLE public.chat_automation_rules DROP CONSTRAINT IF EXISTS chat_automation_rules_action_check;
ALTER TABLE public.chat_automation_rules
  ADD CONSTRAINT chat_automation_rules_action_check
  CHECK (action IN ('set_queue', 'set_team', 'set_priority', 'assign_user'));

-- Chat Engine Fase 6 — automações, distribuição, SLA e regras simples
-- Depende de Fase 5 (chat_queues, attendance_status, SLA columns).

CREATE TABLE IF NOT EXISTS public.chat_automation_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  automation_enabled BOOLEAN NOT NULL DEFAULT false,
  /** Cliente envia mensagem → in_progress (quando automação ativa). */
  auto_status_from_customer BOOLEAN NOT NULL DEFAULT true,
  /** Agente envia mensagem → waiting_customer. */
  auto_status_from_agent BOOLEAN NOT NULL DEFAULT true,
  distribution_enabled BOOLEAN NOT NULL DEFAULT false,
  sla_first_response_minutes INTEGER,
  sla_next_response_minutes INTEGER,
  /** Opcional: voltar a pending após N min em waiting_customer sem resposta do cliente (NULL = desligado). */
  inactivity_reset_minutes INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.chat_automation_settings IS 'Fase 6: flags tenant para automação de chat';

DROP TRIGGER IF EXISTS update_chat_automation_settings_updated_at ON public.chat_automation_settings;
CREATE TRIGGER update_chat_automation_settings_updated_at
  BEFORE UPDATE ON public.chat_automation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.chat_queue_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES public.chat_queues(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  strategy TEXT NOT NULL DEFAULT 'round_robin'
    CHECK (strategy IN ('none', 'round_robin', 'least_open')),
  auto_assign BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_chat_queue_distribution_queue UNIQUE (tenant_id, queue_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_queue_dist_tenant ON public.chat_queue_distribution(tenant_id);

DROP TRIGGER IF EXISTS update_chat_queue_distribution_updated_at ON public.chat_queue_distribution;
CREATE TRIGGER update_chat_queue_distribution_updated_at
  BEFORE UPDATE ON public.chat_queue_distribution
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chat_queue_distribution IS 'Fase 6: equipa + estratégia de atribuição automática por fila';

CREATE TABLE IF NOT EXISTS public.chat_team_round_robin_state (
  team_id UUID PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_rr_tenant ON public.chat_team_round_robin_state(tenant_id);

CREATE TABLE IF NOT EXISTS public.chat_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  match_type TEXT NOT NULL CHECK (match_type IN ('keyword_body', 'client_tag')),
  pattern TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('set_queue', 'set_team', 'set_priority')),
  target_queue_id UUID REFERENCES public.chat_queues(id) ON DELETE SET NULL,
  target_team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  priority_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_auto_rules_tenant_prio ON public.chat_automation_rules(tenant_id, priority, is_active);

DROP TRIGGER IF EXISTS update_chat_automation_rules_updated_at ON public.chat_automation_rules;
CREATE TRIGGER update_chat_automation_rules_updated_at
  BEFORE UPDATE ON public.chat_automation_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chat_automation_rules IS 'Fase 6: roteamento simples por palavra-chave ou tag de cliente';

CREATE TABLE IF NOT EXISTS public.chat_sla_alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  escalated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sla_alert_conv ON public.chat_sla_alert_log(conversation_id, created_at DESC);

ALTER TABLE public.chat_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_queue_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_team_round_robin_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sla_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_automation_settings_tenant_policy ON public.chat_automation_settings;
CREATE POLICY chat_automation_settings_tenant_policy ON public.chat_automation_settings
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

DROP POLICY IF EXISTS chat_queue_distribution_tenant_policy ON public.chat_queue_distribution;
CREATE POLICY chat_queue_distribution_tenant_policy ON public.chat_queue_distribution
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

DROP POLICY IF EXISTS chat_team_round_robin_state_tenant_policy ON public.chat_team_round_robin_state;
CREATE POLICY chat_team_round_robin_state_tenant_policy ON public.chat_team_round_robin_state
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

DROP POLICY IF EXISTS chat_automation_rules_tenant_policy ON public.chat_automation_rules;
CREATE POLICY chat_automation_rules_tenant_policy ON public.chat_automation_rules
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

DROP POLICY IF EXISTS chat_sla_alert_log_tenant_policy ON public.chat_sla_alert_log;
CREATE POLICY chat_sla_alert_log_tenant_policy ON public.chat_sla_alert_log
  FOR ALL USING (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id())
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

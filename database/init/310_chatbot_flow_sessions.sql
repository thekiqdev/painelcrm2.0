-- Chatbot Flows S3 — sessões de runtime por conversa WhatsApp.

CREATE TABLE IF NOT EXISTS public.chatbot_flow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  flow_version_id UUID NOT NULL REFERENCES public.chatbot_flow_versions(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  current_node_id TEXT,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  waiting_variable TEXT,
  last_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  CONSTRAINT chk_chatbot_flow_sessions_status CHECK (
    status IN ('active', 'waiting_input', 'paused', 'ended', 'transferred', 'error')
  )
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_sessions_conversation
  ON public.chatbot_flow_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flow_sessions_tenant_status
  ON public.chatbot_flow_sessions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chatbot_flow_sessions_flow
  ON public.chatbot_flow_sessions(flow_id);

-- No máximo uma sessão “viva” por conversa
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbot_flow_sessions_live_conversation
  ON public.chatbot_flow_sessions(conversation_id)
  WHERE status IN ('active', 'waiting_input');

DROP TRIGGER IF EXISTS update_chatbot_flow_sessions_updated_at ON public.chatbot_flow_sessions;
CREATE TRIGGER update_chatbot_flow_sessions_updated_at
  BEFORE UPDATE ON public.chatbot_flow_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chatbot_flow_sessions IS
  'Runtime WhatsApp do Chatbot Flows (S3): estado por conversa na versão publicada.';

ALTER TABLE public.chatbot_flow_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatbot_flow_sessions_tenant_policy ON public.chatbot_flow_sessions;
CREATE POLICY chatbot_flow_sessions_tenant_policy ON public.chatbot_flow_sessions
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Feature runtime separada (fail-closed se off); ligada por defeito nos planos
INSERT INTO public.plan_features (plan_id, feature_key, enabled, created_at, updated_at)
SELECT id, 'chatbot_flows_runtime', true, now(), now() FROM public.plans
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

INSERT INTO public.system_features (key, name, description, sort_order) VALUES
  ('chatbot_flows_runtime', 'Chatbot Flows Runtime', 'Executa flows publicados no WhatsApp (UazAPI)', 119)
ON CONFLICT (key) DO NOTHING;

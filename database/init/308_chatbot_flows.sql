-- Chatbot Flows S0 — lista multi-flow + draft graph (sem runtime).

CREATE TABLE IF NOT EXISTS public.chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  draft_graph JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_chatbot_flows_status CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT chk_chatbot_flows_name_len CHECK (char_length(trim(name)) >= 1 AND char_length(name) <= 200)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flows_tenant_id ON public.chatbot_flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_tenant_status ON public.chatbot_flows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chatbot_flows_tenant_updated ON public.chatbot_flows(tenant_id, updated_at DESC);

DROP TRIGGER IF EXISTS update_chatbot_flows_updated_at ON public.chatbot_flows;
CREATE TRIGGER update_chatbot_flows_updated_at
  BEFORE UPDATE ON public.chatbot_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.chatbot_flows IS 'Flows visuais de chatbot (canvas); draft_graph = rascunho editável (S0).';

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatbot_flows_tenant_policy ON public.chatbot_flows;
CREATE POLICY chatbot_flows_tenant_policy ON public.chatbot_flows
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Permissões por módulo
INSERT INTO public.role_module_permissions (role, module, can_view, can_create, can_edit, can_delete, edit_own_only, delete_own_only)
VALUES
  ('admin', 'chatbot_flows', true, true, true, true, false, false),
  ('manager', 'chatbot_flows', true, true, true, true, false, false),
  ('member', 'chatbot_flows', true, true, true, false, true, false),
  ('viewer', 'chatbot_flows', true, false, false, false, false, false)
ON CONFLICT (role, module) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete,
  edit_own_only = EXCLUDED.edit_own_only,
  delete_own_only = EXCLUDED.delete_own_only,
  updated_at = now();

-- Feature do plano (habilitada por defeito; Super Admin pode desligar)
INSERT INTO public.plan_features (plan_id, feature_key, enabled, created_at, updated_at)
SELECT id, 'chatbot_flows', true, now(), now() FROM public.plans
ON CONFLICT (plan_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();

INSERT INTO public.system_features (key, name, description, sort_order) VALUES
  ('chatbot_flows', 'Chatbot Flows', 'Editor visual de fluxos de atendimento (canvas)', 118)
ON CONFLICT (key) DO NOTHING;

-- Chatbot Flows S1 — versões publicadas imutáveis + ponteiro no flow.

CREATE TABLE IF NOT EXISTS public.chatbot_flow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  graph_json JSONB NOT NULL,
  published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_chatbot_flow_versions_version_pos CHECK (version >= 1),
  CONSTRAINT uq_chatbot_flow_versions_flow_version UNIQUE (flow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_flow_versions_flow_id
  ON public.chatbot_flow_versions(flow_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flow_versions_tenant_id
  ON public.chatbot_flow_versions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_flow_versions_flow_published
  ON public.chatbot_flow_versions(flow_id, published_at DESC);

COMMENT ON TABLE public.chatbot_flow_versions IS
  'Snapshots imutáveis do grafo ao publicar (S1); runtime usará a versão, não o draft.';

ALTER TABLE public.chatbot_flows
  ADD COLUMN IF NOT EXISTS published_version_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_chatbot_flows_published_version'
  ) THEN
    ALTER TABLE public.chatbot_flows
      ADD CONSTRAINT fk_chatbot_flows_published_version
      FOREIGN KEY (published_version_id)
      REFERENCES public.chatbot_flow_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.chatbot_flow_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatbot_flow_versions_tenant_policy ON public.chatbot_flow_versions;
CREATE POLICY chatbot_flow_versions_tenant_policy ON public.chatbot_flow_versions
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

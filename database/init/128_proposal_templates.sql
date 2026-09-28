-- Modelos de proposta (área exclusiva; não são rascunhos operacionais em `proposals`).

CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_title TEXT,
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  funnel_id UUID REFERENCES public.sales_funnels(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  post_accept_billing_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (post_accept_billing_mode IN ('none', 'notify_team', 'auto_pending_invoice')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_templates_user_id ON public.proposal_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_active ON public.proposal_templates(user_id, is_active);

CREATE TRIGGER update_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proposal_templates_tenant_policy ON public.proposal_templates;
CREATE POLICY proposal_templates_tenant_policy ON public.proposal_templates FOR ALL
  USING (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
  )
  WITH CHECK (
    public.app_can_bypass_rls()
    OR user_id IN (SELECT id FROM public.users WHERE tenant_id = public.app_current_tenant_id())
  );

COMMENT ON TABLE public.proposal_templates IS 'Modelos reutilizáveis para criar propostas e pré-preencher o Kanban (metadata da coluna).';

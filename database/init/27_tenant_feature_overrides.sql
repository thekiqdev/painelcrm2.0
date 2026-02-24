-- Etapa 4.2: Override de features por tenant (além do plano)
CREATE TABLE IF NOT EXISTS public.tenant_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_overrides_tenant_id ON public.tenant_feature_overrides(tenant_id);

CREATE TRIGGER update_tenant_feature_overrides_updated_at
  BEFORE UPDATE ON public.tenant_feature_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_feature_overrides IS 'Override de feature por tenant (sobrescreve o plano)';

-- Mirror database/init/201_system_feature_flags.sql

CREATE TABLE IF NOT EXISTS public.system_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'tenant')),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT system_feature_flags_scope_tenant_ck CHECK (
    (scope = 'global' AND tenant_id IS NULL)
    OR (scope = 'tenant' AND tenant_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_feature_flags_global_key
  ON public.system_feature_flags (key)
  WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_feature_flags_tenant_key
  ON public.system_feature_flags (key, tenant_id)
  WHERE scope = 'tenant';

COMMENT ON TABLE public.system_feature_flags IS 'Interruptores de produto (alternativa a env); globais ou por tenant';

INSERT INTO public.system_feature_flags (key, value, scope, tenant_id)
SELECT 'whatsapp_official_enabled', true, 'global', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_feature_flags
  WHERE key = 'whatsapp_official_enabled' AND scope = 'global' AND tenant_id IS NULL
);

INSERT INTO public.system_feature_flags (key, value, scope, tenant_id)
SELECT 'whatsapp_official_tenant_enabled', false, 'global', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_feature_flags
  WHERE key = 'whatsapp_official_tenant_enabled' AND scope = 'global' AND tenant_id IS NULL
);

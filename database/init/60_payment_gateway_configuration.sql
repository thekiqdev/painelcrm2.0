-- Etapa 1 — Configuração de gateways de pagamento (PLANO-PAYMENT-GATEWAY-CONFIGURATION)
-- Tabelas: payment_gateways (catálogo), payment_gateway_configs (configurações por conta global/tenant)

-- 1) Catálogo de gateways suportados
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  credentials_schema JSONB DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_payment_gateways_updated_at
  BEFORE UPDATE ON public.payment_gateways
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.payment_gateways IS 'Gateways de pagamento suportados pelo sistema; usado para listar opções na configuração e validar gateway_key em payment_gateway_configs.';
COMMENT ON COLUMN public.payment_gateways.credentials_schema IS 'Documenta campos esperados em credentials (ex.: api_key, env para Asaas).';

-- 2) Configurações por conta (global ou por tenant)
CREATE TABLE IF NOT EXISTS public.payment_gateway_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'tenant')),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  gateway_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  credentials JSONB DEFAULT '{}',
  options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_gateway_configs_scope_tenant
    CHECK (
      (scope = 'global' AND tenant_id IS NULL) OR
      (scope = 'tenant' AND tenant_id IS NOT NULL)
    )
);

CREATE TRIGGER update_payment_gateway_configs_updated_at
  BEFORE UPDATE ON public.payment_gateway_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.payment_gateway_configs IS 'Configurações de gateway por escopo: global (SaaS billing) ou tenant (CRM billing).';
COMMENT ON COLUMN public.payment_gateway_configs.credentials IS 'Credenciais por gateway (ex.: { "api_key": "...", "env": "sandbox" } para Asaas).';
COMMENT ON COLUMN public.payment_gateway_configs.options IS 'Opções extras (ex.: webhook_secret).';

-- Uma config ativa global por gateway_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_gateway_configs_one_active_global
  ON public.payment_gateway_configs (gateway_key)
  WHERE scope = 'global' AND is_active = true;

-- Uma config ativa por (tenant_id, gateway_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_gateway_configs_one_active_per_tenant
  ON public.payment_gateway_configs (tenant_id, gateway_key)
  WHERE scope = 'tenant' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_payment_gateway_configs_scope_tenant
  ON public.payment_gateway_configs (scope, tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_gateway_configs_gateway_key
  ON public.payment_gateway_configs (gateway_key);

-- 3) Seed: Asaas no catálogo
INSERT INTO public.payment_gateways (key, name, description, is_enabled, credentials_schema, sort_order)
VALUES (
  'asaas',
  'Asaas',
  'Gateway de pagamento Asaas (boleto, PIX, cartão).',
  true,
  '{"api_key": "required", "env": "sandbox|production"}'::jsonb,
  10
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_enabled = EXCLUDED.is_enabled,
  credentials_schema = EXCLUDED.credentials_schema,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

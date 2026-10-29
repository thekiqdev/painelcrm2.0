-- S10 — Endereços do cliente (N por cliente) + default único por cliente/tenant
-- Plano: docs/PLANO_CLIENT_ADDRESSES_E_OS_PREFILL.md

CREATE TABLE IF NOT EXISTS public.client_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Principal',
  postal_code TEXT NULL,
  street TEXT NULL,
  number TEXT NULL,
  complement TEXT NULL,
  neighborhood TEXT NULL,
  city TEXT NULL,
  state TEXT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_addresses_label_len CHECK (char_length(label) <= 120),
  CONSTRAINT client_addresses_postal_code_len CHECK (postal_code IS NULL OR char_length(postal_code) <= 16),
  CONSTRAINT client_addresses_state_len CHECK (state IS NULL OR char_length(state) <= 2)
);

CREATE INDEX IF NOT EXISTS idx_client_addresses_tenant_client
  ON public.client_addresses (tenant_id, client_id);

CREATE INDEX IF NOT EXISTS idx_client_addresses_client
  ON public.client_addresses (client_id);

-- No máximo um endereço padrão por cliente no tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_addresses_default_per_client
  ON public.client_addresses (tenant_id, client_id)
  WHERE is_default = true;

DROP TRIGGER IF EXISTS update_client_addresses_updated_at ON public.client_addresses;
CREATE TRIGGER update_client_addresses_updated_at
  BEFORE UPDATE ON public.client_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

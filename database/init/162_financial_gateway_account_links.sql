-- Vínculo conta financeira ↔ gateway de pagamento + metadados em financial_transactions (recebimentos automáticos).

CREATE TABLE IF NOT EXISTS public.financial_account_gateway_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  financial_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL CHECK (gateway IN ('asaas', 'mercado_pago')),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_default_receivables BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fagl_one_link_per_account
  ON public.financial_account_gateway_links (financial_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fagl_tenant_gateway_default
  ON public.financial_account_gateway_links (tenant_id, gateway)
  WHERE is_enabled AND is_default_receivables;

CREATE INDEX IF NOT EXISTS idx_fagl_tenant_gateway ON public.financial_account_gateway_links (tenant_id, gateway);

DROP TRIGGER IF EXISTS financial_account_gateway_links_updated_at ON public.financial_account_gateway_links;
CREATE TRIGGER financial_account_gateway_links_updated_at
  BEFORE UPDATE ON public.financial_account_gateway_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS entry_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (entry_source IN ('manual', 'gateway_payment'));

ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS gateway_provider TEXT,
  ADD COLUMN IF NOT EXISTS gateway_reference_id TEXT,
  ADD COLUMN IF NOT EXISTS external_event_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ft_gateway_invoice_dup
  ON public.financial_transactions (tenant_id, reference_type, reference_id)
  WHERE entry_source = 'gateway_payment'
    AND reference_type = 'customer_invoice'
    AND reference_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ft_gateway_external_dup
  ON public.financial_transactions (tenant_id, gateway_provider, gateway_reference_id)
  WHERE gateway_provider IS NOT NULL
    AND gateway_reference_id IS NOT NULL
    AND trim(gateway_reference_id) <> '';

ALTER TABLE public.financial_account_gateway_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_account_gateway_links_policy ON public.financial_account_gateway_links;
CREATE POLICY financial_account_gateway_links_policy ON public.financial_account_gateway_links
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

-- Cobranças (customer_charges): agrupamento de faturas; charge_id em customer_invoices.
-- Fase 10 — docs/ANALISE-IMPLANTACAO-SEGURA-EVOLUCAO-FINANCEIRO.md
-- Status da cobrança: open (nenhuma paga), partial (algumas pagas), paid (todas pagas).

CREATE TABLE IF NOT EXISTS public.customer_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NULL REFERENCES public.clients(id) ON DELETE SET NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_charges_tenant_id ON public.customer_charges(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_charges_client_id ON public.customer_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_charges_status ON public.customer_charges(status);

CREATE TRIGGER update_customer_charges_updated_at
  BEFORE UPDATE ON public.customer_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.customer_charges IS 'Cobranças do CRM: agrupam faturas (customer_invoices). Status derivado das faturas: open/partial/paid.';

-- Vincular fatura à cobrança (opcional)
ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS charge_id UUID NULL REFERENCES public.customer_charges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_invoices_charge_id ON public.customer_invoices(charge_id)
  WHERE charge_id IS NOT NULL;

COMMENT ON COLUMN public.customer_invoices.charge_id IS 'Cobrança à qual a fatura pertence (opcional). Ao marcar fatura paga, status da cobrança é recalculado.';

-- RLS: isolamento por tenant
ALTER TABLE public.customer_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_charges_tenant_policy ON public.customer_charges;
CREATE POLICY customer_charges_tenant_policy ON public.customer_charges
  FOR ALL
  USING (public.app_tenant_visible(tenant_id))
  WITH CHECK (public.app_can_bypass_rls() OR tenant_id = public.app_current_tenant_id());

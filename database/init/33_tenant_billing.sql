-- Faturamento por tenant (Fase 2 - Perfil empresa)
CREATE TABLE IF NOT EXISTS public.tenant_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  billing_interval TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  paid_at TIMESTAMPTZ,
  invoice_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_tenant_id ON public.tenant_billing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_due_date ON public.tenant_billing(due_date);
CREATE INDEX IF NOT EXISTS idx_tenant_billing_status ON public.tenant_billing(status);

CREATE TRIGGER update_tenant_billing_updated_at
  BEFORE UPDATE ON public.tenant_billing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.tenant_billing IS 'Cobranças por empresa (tenant); usado na aba Faturamento do Super Admin';

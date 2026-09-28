-- Billing Engine Fase 4: faturas recorrentes dos clientes do CRM (customer_invoices).
-- Ref: docs/PLANO-BILLING-ENGINE-RECORRENCIA.md
-- Worker type=customer cria faturas nesta tabela; gateway usa config do tenant (billingType=crm).

CREATE TABLE IF NOT EXISTS public.customer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount_cents INT NOT NULL CHECK (amount_cents >= 0),
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ NULL,
  invoice_number TEXT NULL,
  gateway TEXT NULL,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('PIX', 'BOLETO', 'CREDIT_CARD')),
  asaas_payment_id TEXT NULL,
  asaas_status TEXT NULL,
  idempotency_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_invoices_subscription_period
  ON public.customer_invoices (subscription_id, period_start);

CREATE INDEX IF NOT EXISTS idx_customer_invoices_tenant_id ON public.customer_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_client_id ON public.customer_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_subscription_id ON public.customer_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_status ON public.customer_invoices(status);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_due_date ON public.customer_invoices(due_date);

CREATE TRIGGER update_customer_invoices_updated_at
  BEFORE UPDATE ON public.customer_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.customer_invoices IS 'Faturas recorrentes dos clientes do CRM (Billing Engine type=customer). Uma por subscription_id + period_start.';

-- payment_customers: suporte a cliente do CRM (client_id) além do tenant (SaaS).
-- client_id NULL = vínculo tenant↔gateway (SaaS); client_id NOT NULL = tenant+client↔gateway (CRM).
ALTER TABLE public.payment_customers
  ADD COLUMN IF NOT EXISTS client_id UUID NULL REFERENCES public.clients(id) ON DELETE CASCADE;

DO $$
DECLARE
  _con text;
BEGIN
  SELECT conname INTO _con
  FROM pg_constraint
  WHERE conrelid = 'public.payment_customers'::regclass AND contype = 'u'
  LIMIT 1;
  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_customers DROP CONSTRAINT %I', _con);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_customers_tenant_gateway_saas
  ON public.payment_customers (tenant_id, gateway_key)
  WHERE client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_customers_tenant_gateway_client
  ON public.payment_customers (tenant_id, gateway_key, client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.payment_customers.client_id IS 'NULL = cliente do gateway é o tenant (SaaS). Preenchido = cliente do CRM (cobrança recorrente type=customer).';

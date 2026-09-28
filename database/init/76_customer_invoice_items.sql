-- Itens por fatura (customer_invoices). Fase 4 evolução financeiro.
-- Ref: docs/PLANO-EVOLUCAO-FATURAS-E-FINANCEIRO.md
-- Faturas sem itens continuam válidas (amount_cents apenas); faturas com itens têm amount_cents = soma dos itens.

CREATE TABLE IF NOT EXISTS public.customer_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  product_id UUID NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
  unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
  discount_cents INT NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INT NOT NULL CHECK (total_cents >= 0),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_invoice_items_invoice_id
  ON public.customer_invoice_items(invoice_id);

COMMENT ON TABLE public.customer_invoice_items IS 'Linhas de itens das faturas de clientes (manuais). total_cents = quantity * unit_price_cents - discount_cents.';

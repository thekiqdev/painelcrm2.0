-- Link único de pagamento (Fase 6 evolução financeiro).
-- Ref: docs/ANALISE-IMPLANTACAO-SEGURA-EVOLUCAO-FINANCEIRO.md, docs/PLANO-EVOLUCAO-FATURAS-E-FINANCEIRO.md
-- Token público para GET /pay/:token; não expor id interno.

ALTER TABLE public.customer_invoices
  ADD COLUMN IF NOT EXISTS payment_token UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_invoices_payment_token
  ON public.customer_invoices (payment_token)
  WHERE payment_token IS NOT NULL;

COMMENT ON COLUMN public.customer_invoices.payment_token IS 'Token público para página de pagamento (link único). NULL = faturas antigas sem link.';

-- Função para rota pública: busca por payment_token sem RLS (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_customer_invoice_by_payment_token(p_token UUID)
RETURNS TABLE (
  invoice_id UUID,
  tenant_id UUID,
  client_id UUID,
  amount_cents INT,
  due_date DATE,
  status TEXT,
  invoice_number TEXT,
  description TEXT,
  payment_method TEXT,
  gateway_metadata JSONB,
  origin TEXT,
  invoice_type TEXT,
  client_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ci.id,
    ci.tenant_id,
    ci.client_id,
    ci.amount_cents,
    ci.due_date,
    ci.status,
    ci.invoice_number,
    ci.description,
    ci.payment_method,
    ci.gateway_metadata,
    ci.origin,
    ci.invoice_type,
    c.name
  FROM customer_invoices ci
  LEFT JOIN clients c ON c.id = ci.client_id
  WHERE ci.payment_token = p_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_customer_invoice_by_payment_token(UUID) IS 'Rota pública: retorna fatura por payment_token (bypass RLS).';
